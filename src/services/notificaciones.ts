import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Servicio único de notificaciones in-app.
 *
 * Reglas:
 * - `notificaciones.user_id` referencia a `usuarios.id`. Los eventos clínicos
 *   guardan `doctor_id` (= `doctores.id`), por eso SIEMPRE hay que resolver
 *   `doctores.usuario_id` antes de insertar (antes se insertaba el doctor_id
 *   directo y la FK hacía fallar el insert en silencio → nadie recibía nada).
 * - Respeta `notificacion_preferencias` (canal IN_APP); sin registro = activo.
 * - Nunca lanza: una notificación fallida no debe romper la operación principal.
 */

export type TipoEventoNotificacion =
  | 'PAGO_HONORARIOS'
  | 'RECORDATORIO_CONSULTA'
  | 'ASIGNACION_SERVICIO'
  | 'PROXIMA_CIRUGIA'
  | 'CANCELACION'
  | 'REAGENDADO'
  | 'STOCK_BAJO'
  | 'SISTEMA';

/** Tipo de entidad → la UI decide a qué pantalla navegar. */
export type EntidadNotificacion = 'consulta' | 'agenda_cirugia' | 'inventario_item' | 'honorarios';

const SEVERIDAD: Record<TipoEventoNotificacion, 'info' | 'warning' | 'error'> = {
  PAGO_HONORARIOS: 'info',
  RECORDATORIO_CONSULTA: 'info',
  ASIGNACION_SERVICIO: 'info',
  PROXIMA_CIRUGIA: 'info',
  CANCELACION: 'warning',
  REAGENDADO: 'warning',
  STOCK_BAJO: 'warning',
  SISTEMA: 'info',
};

interface NotificarParams {
  tipo: TipoEventoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo?: EntidadNotificacion;
  entidadId?: string;
  /** Usuario que realizó la acción: no se le notifica su propia acción. */
  actorUserId?: string;
}

/** Envía la notificación a varios usuarios (1 lectura de preferencias + 1 insert). */
export async function notificarUsuarios(userIds: Array<string | null | undefined>, params: NotificarParams): Promise<number> {
  try {
    const destinatarios = Array.from(new Set(userIds.filter((u): u is string => !!u && u !== params.actorUserId)));
    if (destinatarios.length === 0) return 0;

    const supabase = getSupabaseAdmin();
    const { data: prefs } = await supabase
      .from('notificacion_preferencias')
      .select('user_id, activo')
      .in('user_id', destinatarios)
      .eq('tipo_evento', params.tipo)
      .eq('canal', 'IN_APP');
    const desactivados = new Set((prefs ?? []).filter((p) => p.activo === false).map((p) => p.user_id));
    const finales = destinatarios.filter((u) => !desactivados.has(u));
    if (finales.length === 0) return 0;

    const { error } = await supabase.from('notificaciones').insert(
      finales.map((user_id) => ({
        user_id,
        tipo: SEVERIDAD[params.tipo],
        titulo: params.titulo.slice(0, 255),
        mensaje: params.mensaje,
        entidad_tipo: params.entidadTipo ?? null,
        entidad_id: params.entidadId ?? null,
      })),
    );
    if (error) {
      console.error('[notificaciones] insert', { code: error.code, message: error.message });
      return 0;
    }
    return finales.length;
  } catch (err) {
    console.error('[notificaciones] error', err);
    return 0;
  }
}

/** Resuelve el usuario de uno o varios doctores (doctores.id → usuarios.id). */
export async function usuariosDeDoctores(doctorIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(doctorIds.filter((d): d is string => !!d)));
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  const { data } = await getSupabaseAdmin().from('doctores').select('id, usuario_id').in('id', ids);
  for (const d of data ?? []) if (d.usuario_id) mapa.set(d.id, d.usuario_id);
  return mapa;
}

/** Notifica a los doctores indicados (por doctores.id). */
export async function notificarDoctores(doctorIds: Array<string | null | undefined>, params: NotificarParams): Promise<number> {
  const mapa = await usuariosDeDoctores(doctorIds);
  return notificarUsuarios(Array.from(mapa.values()), params);
}

/** Notifica a todos los usuarios activos con alguno de los roles. */
export async function notificarRoles(roles: string[], params: NotificarParams): Promise<number> {
  const { data } = await getSupabaseAdmin().from('usuarios').select('id').in('rol', roles).eq('activo', true);
  return notificarUsuarios((data ?? []).map((u) => u.id), params);
}

// ── Helpers de dominio ─────────────────────────────────────────────

function fechaLegible(fecha?: string | null, hora?: string | null): string {
  if (!fecha) return 'sin fecha';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

export function notificarAsignacion(opts: {
  doctorId: string | null | undefined;
  tipoServicio: 'Cirugía' | 'Consulta' | 'Estudio';
  paciente: string;
  fecha?: string | null;
  hora?: string | null;
  entidadTipo: EntidadNotificacion;
  entidadId: string;
  actorUserId?: string;
}) {
  return notificarDoctores([opts.doctorId], {
    tipo: 'ASIGNACION_SERVICIO',
    titulo: `Nueva ${opts.tipoServicio.toLowerCase()} asignada`,
    mensaje: `${opts.paciente} · ${fechaLegible(opts.fecha, opts.hora)}`,
    entidadTipo: opts.entidadTipo,
    entidadId: opts.entidadId,
    actorUserId: opts.actorUserId,
  });
}

export function notificarCancelacion(opts: {
  doctorId: string | null | undefined;
  paciente: string;
  fecha?: string | null;
  hora?: string | null;
  motivo?: string | null;
  entidadTipo: EntidadNotificacion;
  entidadId: string;
  actorUserId?: string;
}) {
  return notificarDoctores([opts.doctorId], {
    tipo: 'CANCELACION',
    titulo: opts.entidadTipo === 'agenda_cirugia' ? 'Cirugía cancelada' : 'Consulta cancelada',
    mensaje: `${opts.paciente} · ${fechaLegible(opts.fecha, opts.hora)}${opts.motivo ? ` — ${opts.motivo}` : ''}`,
    entidadTipo: opts.entidadTipo,
    entidadId: opts.entidadId,
    actorUserId: opts.actorUserId,
  });
}

export function notificarReagendado(opts: {
  doctorId: string | null | undefined;
  paciente: string;
  fecha?: string | null;
  hora?: string | null;
  aplazada?: boolean;
  entidadTipo: EntidadNotificacion;
  entidadId: string;
  actorUserId?: string;
}) {
  const que = opts.entidadTipo === 'agenda_cirugia' ? 'Cirugía' : 'Consulta';
  return notificarDoctores([opts.doctorId], {
    tipo: 'REAGENDADO',
    titulo: `${que} ${opts.aplazada ? 'aplazada' : 'reagendada'}`,
    mensaje: `${opts.paciente} · nueva fecha ${fechaLegible(opts.fecha, opts.hora)}`,
    entidadTipo: opts.entidadTipo,
    entidadId: opts.entidadId,
    actorUserId: opts.actorUserId,
  });
}

export function notificarPagoHonorarios(opts: { doctorId: string; monto: number; eventos: number; actorUserId?: string }) {
  const monto = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(opts.monto);
  return notificarDoctores([opts.doctorId], {
    tipo: 'PAGO_HONORARIOS',
    titulo: 'Pago de honorarios registrado',
    mensaje: `Se registró un pago de ${monto} (${opts.eventos} servicio${opts.eventos === 1 ? '' : 's'}).`,
    entidadTipo: 'honorarios',
    actorUserId: opts.actorUserId,
  });
}
