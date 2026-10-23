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
}

/** Envía cada mensaje a todos los dispositivos de su usuario. Devuelve cuántos se entregaron. */
export async function enviarPush(envios: Array<{ userId: string; mensaje: MensajePush }>): Promise<number> {
  if (envios.length === 0 || !pushDisponible()) return 0;
  try {
    const supabase = getSupabaseAdmin();
    const userIds = Array.from(new Set(envios.map((e) => e.userId)));
    const { data, error } = await supabase
      .from('push_suscripciones')
      .select('id, user_id, endpoint, p256dh, auth, discreta')
      .in('user_id', userIds)
      .limit(500);
    if (error) {
      // Sin la tabla (patch sin aplicar) no se registra como error en cada aviso.
      if (error.code !== 'PGRST205' && error.code !== '42P01') {
        console.error('[push] suscripciones', { code: error.code, message: error.message });
      }
      return 0;
    }
    const porUsuario = new Map<string, Suscripcion[]>();
    for (const s of (data ?? []) as Suscripcion[]) {
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
