import 'server-only';
import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { TipoEventoNotificacion } from '@/services/notificaciones';

/**
 * Notificaciones push (Web Push) al celular / computadora.
 *
 * - Se activan con las variables de entorno NEXT_PUBLIC_VAPID_PUBLIC_KEY y
 *   VAPID_PRIVATE_KEY (opcional VAPID_SUBJECT). Sin ellas, no se envía nada.
 * - Requiere sql/patch-push-notificaciones-supabase.sql (tabla push_suscripciones).
 * - Nunca lanza: un push fallido no debe romper la operación principal.
 * - Suscripciones vencidas (404/410) se borran solas.
 */

let configurado: boolean | null = null;

export function clavePublicaVapid(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushDisponible(): boolean {
  if (configurado !== null) return configurado;
  const publica = clavePublicaVapid();
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) {
    configurado = false;
    return false;
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@eyeadvanced.mx', publica, privada);
    configurado = true;
  } catch (err) {
    console.error('[push] claves VAPID inválidas', err instanceof Error ? err.message : err);
    configurado = false;
  }
  return configurado;
}

export interface MensajePush {
  tipo: TipoEventoNotificacion;
  titulo: string;
  mensaje: string;
  /** Pantalla a la que lleva al tocarla. */
  url: string;
  /** Id de la notificación in-app (para marcarla como leída al tocarla). */
  notificacionId?: string | null;
  /** Agrupa: una nueva notificación con el mismo tag reemplaza a la anterior. */
  tag?: string;
}

/** Títulos sin datos del paciente (dispositivos en modo discreto). */
const TITULO_DISCRETO: Record<TipoEventoNotificacion, string> = {
  PAGO_HONORARIOS: 'Pago de honorarios registrado',
  RECORDATORIO_CONSULTA: 'Tienes una cita próxima',
  ASIGNACION_SERVICIO: 'Se te asignó una cita',
  PROXIMA_CIRUGIA: 'Tienes una cirugía próxima',
  CANCELACION: 'Se canceló una cita',
  REAGENDADO: 'Se movió una cita',
  STOCK_BAJO: 'Inventario con stock bajo',
  LENTE_RECIBIDO: 'Llegó un lente para cirugía',
  SISTEMA: 'EyeAdvanced',
};

/** Avisos con hora: alta prioridad para que lleguen al instante. */
const URGENTES = new Set<TipoEventoNotificacion>(['RECORDATORIO_CONSULTA', 'PROXIMA_CIRUGIA', 'CANCELACION', 'REAGENDADO']);

interface Suscripcion {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  discreta: boolean;
  /** Sesión con la que se registró (sql/patch-push-notificaciones-supabase.sql). */
  session_id?: string | null;
}

/** Envía cada mensaje a todos los dispositivos de su usuario. Devuelve cuántos se entregaron. */
export async function enviarPush(envios: Array<{ userId: string; mensaje: MensajePush }>): Promise<number> {
  if (envios.length === 0 || !pushDisponible()) return 0;
  try {
    const supabase = getSupabaseAdmin();
    const userIds = Array.from(new Set(envios.map((e) => e.userId)));
    const [subsRes, usuariosRes] = await Promise.all([
      supabase.from('push_suscripciones').select('*').in('user_id', userIds).limit(500),
      supabase.from('usuarios').select('id, sesion_activa_id').in('id', userIds),
    ]);
    const { data, error } = subsRes;
    if (error) {
      // Sin la tabla (patch sin aplicar) no se registra como error en cada aviso.
      if (error.code !== 'PGRST205' && error.code !== '42P01') {
        console.error('[push] suscripciones', { code: error.code, message: error.message });
      }
      return 0;
    }
    // Sesión única: si el usuario tiene una sesión vigente, solo se avisa al
    // dispositivo registrado con esa sesión (no al que se quedó con la sesión
    // reemplazada por «Trabajar aquí»). Sin sesión vigente: todos sus dispositivos.
    const sesionActiva = new Map(
      ((usuariosRes.error ? [] : usuariosRes.data) ?? []).map((u) => [u.id as string, (u.sesion_activa_id as string | null) ?? null]),
    );
    const porUsuario = new Map<string, Suscripcion[]>();
    for (const s of (data ?? []) as Suscripcion[]) {
      const activa = sesionActiva.get(s.user_id);
      if (activa && 'session_id' in s && s.session_id !== activa) continue;
      porUsuario.set(s.user_id, [...(porUsuario.get(s.user_id) ?? []), s]);
    }

    const vencidas: string[] = [];
    let enviados = 0;
    await Promise.allSettled(
      envios.flatMap(({ userId, mensaje }) =>
        (porUsuario.get(userId) ?? []).map(async (s) => {
          const urgente = URGENTES.has(mensaje.tipo);
          const payload = JSON.stringify({
            titulo: s.discreta ? TITULO_DISCRETO[mensaje.tipo] : mensaje.titulo,
            cuerpo: s.discreta ? 'Toca para ver los detalles.' : mensaje.mensaje,
            url: mensaje.url,
            tag: mensaje.tag,
            id: mensaje.notificacionId ?? null,
            urgente,
          });
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              TTL: 12 * 60 * 60,
              urgency: urgente ? 'high' : 'normal',
              timeout: 5000,
            });
            enviados += 1;
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) vencidas.push(s.id);
            else console.error('[push] envío', { status, message: err instanceof Error ? err.message : String(err) });
          }
        }),
      ),
    );
    if (vencidas.length) {
      await supabase.from('push_suscripciones').delete().in('id', vencidas);
    }
    return enviados;
  } catch (err) {
    console.error('[push] error', err);
    return 0;
  }
}

/**
 * Da de baja los dispositivos del usuario que NO pertenecen a la sesión indicada
 * (al iniciar sesión / «Trabajar aquí») o los de esa sesión (al cerrarla).
 * El dispositivo vigente se vuelve a registrar solo al cargar la app.
 */
export async function limpiarSuscripcionesDeSesion(
  userId: string,
  sessionId: string,
  modo: 'otras' | 'esta',
): Promise<void> {
  try {
    const q = getSupabaseAdmin().from('push_suscripciones').delete().eq('user_id', userId);
    const { error } =
      modo === 'esta' ? await q.eq('session_id', sessionId) : await q.or(`session_id.is.null,session_id.neq.${sessionId}`);
    if (error && !['PGRST205', '42P01', '42703', 'PGRST204'].includes(error.code)) {
      console.error('[push] limpiar', { code: error.code, message: error.message });
    }
  } catch (err) {
    console.error('[push] limpiar', err);
  }
}

/** La sesión del mismo navegador se renovó: sus dispositivos pasan a la sesión nueva. */
export async function moverSuscripcionesDeSesion(userId: string, anterior: string | null, nueva: string): Promise<void> {
  if (!anterior) return;
  try {
    const { error } = await getSupabaseAdmin()
      .from('push_suscripciones')
      .update({ session_id: nueva, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_id', anterior);
    if (error && !['PGRST205', '42P01', '42703', 'PGRST204'].includes(error.code)) {
      console.error('[push] mover', { code: error.code, message: error.message });
    }
  } catch (err) {
    console.error('[push] mover', err);
  }
}
