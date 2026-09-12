import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MINUTOS_ANTES = parseInt(process.env.AGENDA_NOTIFICACION_MINUTOS || '30', 10);

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const ahora = new Date();
  const ventana = new Date(ahora.getTime() + MINUTOS_ANTES * 60 * 1000);
  const fechaActual = ahora.toISOString().split('T')[0];
  const fechaVentana = ventana.toISOString().split('T')[0];
  const horaActual = ahora.toTimeString().slice(0, 8);
  const horaVentana = ventana.toTimeString().slice(0, 8);

  const { data: cirugias, error } = await supabase
    .from('agenda_cirugias')
    .select('id, doctor_id, nombre_paciente, procedimiento, fecha, hora, jornada')
    .eq('estado', 'agendada')
    .eq('notificado', false)
    .not('doctor_id', 'is', null)
    .not('fecha', 'is', null)
    .not('hora', 'is', null)
    .gte('fecha', fechaActual)
    .lte('fecha', fechaVentana);

  if (error) {
    return NextResponse.json({ error: 'Error al consultar cirugías' }, { status: 500 });
  }

  if (!cirugias || cirugias.length === 0) {
    return NextResponse.json({ notificaciones: 0, mensaje: 'No hay cirugías por notificar' });
  }

  let notificacionesEnviadas = 0;

  for (const cirugia of cirugias) {
    if (!cirugia.fecha || !cirugia.hora || !cirugia.doctor_id) continue;

    const cirugiaDateTime = new Date(`${cirugia.fecha}T${cirugia.hora}`);
    const diffMs = cirugiaDateTime.getTime() - ahora.getTime();
    const diffMin = diffMs / (1000 * 60);

    if (diffMin < 0 || diffMin > MINUTOS_ANTES) continue;

    const { error: notifError } = await supabase.from('notificaciones').insert({
      user_id: cirugia.doctor_id,
      tipo: 'info',
      titulo: 'Cirugía próxima',
      mensaje: `${cirugia.nombre_paciente}${cirugia.procedimiento ? ' - ' + cirugia.procedimiento : ''} programada para las ${cirugia.hora.slice(0, 5)}${cirugia.jornada ? ' (' + cirugia.jornada + ')' : ''}`,
      entidad_tipo: 'agenda_cirugia',
      entidad_id: cirugia.id,
    });

    if (!notifError) {
      await supabase
        .from('agenda_cirugias')
        .update({ notificado: true, updated_at: new Date().toISOString() })
        .eq('id', cirugia.id);
      notificacionesEnviadas++;
    }
  }

  return NextResponse.json({ notificaciones: notificacionesEnviadas });
}
