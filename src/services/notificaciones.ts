import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type TipoEventoNotificacion =
  | 'PAGO_HONORARIOS'
  | 'RECORDATORIO_CONSULTA'
  | 'ASIGNACION_SERVICIO'
  | 'PROXIMA_CIRUGIA'
  | 'CANCELACION'
  | 'REAGENDADO'
  | 'SISTEMA';

interface DispararNotificacionParams {
  userId: string;
  tipo: TipoEventoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo?: string;
  entidadId?: string;
}

export async function dispararNotificacion(params: DispararNotificacionParams): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { userId, tipo, titulo, mensaje, entidadTipo, entidadId } = params;

  // Check if user has this notification type enabled
  const { data: pref } = await supabase
    .from('notificacion_preferencias')
    .select('activo')
    .eq('user_id', userId)
    .eq('tipo_evento', tipo)
    .eq('canal', 'IN_APP')
    .maybeSingle();

  // Default to enabled if no preference record exists
  const activo = pref?.activo ?? true;
  if (!activo) return;

  await supabase.from('notificaciones').insert({
    user_id: userId,
    tipo: tipo === 'CANCELACION' || tipo === 'REAGENDADO' ? 'warning' : 'info',
    titulo,
    mensaje,
    entidad_tipo: entidadTipo ?? null,
    entidad_id: entidadId ?? null,
  });
}

export async function notificarPagoHonorarios(doctorUserId: string, monto: number, periodo: string): Promise<void> {
  await dispararNotificacion({
    userId: doctorUserId,
    tipo: 'PAGO_HONORARIOS',
    titulo: 'Pago de honorarios realizado',
    mensaje: `Se ha registrado tu pago de $${monto.toLocaleString('es-MX')} correspondiente al periodo ${periodo}.`,
    entidadTipo: 'honorarios',
  });
}

export async function notificarAsignacionServicio(
  doctorUserId: string,
  pacienteNombre: string,
  tipoServicio: string,
  consultaId: string,
): Promise<void> {
  await dispararNotificacion({
    userId: doctorUserId,
    tipo: 'ASIGNACION_SERVICIO',
    titulo: `${tipoServicio} asignado`,
    mensaje: `Se te ha asignado un ${tipoServicio.toLowerCase()} para el paciente ${pacienteNombre}.`,
    entidadTipo: 'consulta',
    entidadId: consultaId,
  });
}

export async function notificarCancelacion(
  userId: string,
  pacienteNombre: string,
  fecha: string,
  entidadTipo: string,
  entidadId: string,
): Promise<void> {
  await dispararNotificacion({
    userId,
    tipo: 'CANCELACION',
    titulo: 'Consulta/cirugía cancelada',
    mensaje: `La cita con ${pacienteNombre} del ${fecha} ha sido cancelada.`,
    entidadTipo,
    entidadId,
  });
}

export async function notificarReagendado(
  userId: string,
  pacienteNombre: string,
  nuevaFecha: string,
  entidadTipo: string,
  entidadId: string,
): Promise<void> {
  await dispararNotificacion({
    userId,
    tipo: 'REAGENDADO',
    titulo: 'Consulta/cirugía reagendada',
    mensaje: `La cita con ${pacienteNombre} ha sido reagendada para el ${nuevaFecha}.`,
    entidadTipo,
    entidadId,
  });
}

export async function notificarProximaCirugia(
  doctorUserId: string,
  pacienteNombre: string,
  procedimiento: string,
  fecha: string,
  cirugiaId: string,
): Promise<void> {
  await dispararNotificacion({
    userId: doctorUserId,
    tipo: 'PROXIMA_CIRUGIA',
    titulo: 'Próxima cirugía programada',
    mensaje: `${procedimiento} con ${pacienteNombre} programada para ${fecha}.`,
    entidadTipo: 'cirugia',
    entidadId: cirugiaId,
  });
}
