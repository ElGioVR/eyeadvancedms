import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { notificarUsuarios, usuariosDeDoctores } from '@/services/notificaciones';

const MINUTOS_ANTES = parseInt(process.env.AGENDA_NOTIFICACION_MINUTOS || '30', 10);

/** "Reloj de pared" de Tijuana como epoch comparable (la agenda guarda hora local). */
function ahoraTijuana(): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

/**
 * Envía el recordatorio "Cirugía próxima" a los doctores con cirugías en los
 * próximos MINUTOS_ANTES minutos. Es seguro correrlo en paralelo desde varias
 * instancias: cada cirugía se "reclama" de forma atómica (notificado false→true)
 * y solo quien la reclama envía el aviso → nunca se duplica.
 */
export async function procesarRecordatoriosCirugia(): Promise<{ revisadas: number; enviadas: number }> {
  const supabase = getSupabaseAdmin();
  const ahora = ahoraTijuana();
  const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const { data: cirugias, error } = await supabase
    .from('agenda_cirugias')
    .select('id, doctor_id, nombre_paciente, procedimiento, fecha, hora, jornada')
    .eq('estado', 'agendada')
    .eq('notificado', false)
    .not('doctor_id', 'is', null)
    .not('hora', 'is', null)
    .gte('fecha', aFecha(ahora))
    .lte('fecha', aFecha(ahora + MINUTOS_ANTES * 60_000))
    .limit(200);

  if (error) throw new Error('Error al consultar cirugías');

  const proximas = (cirugias ?? []).filter((c) => {
    if (!c.fecha || !c.hora) return false;
    const [y, m, d] = c.fecha.split('-').map(Number);
    const [h, mi] = c.hora.split(':').map(Number);
    const diff = (Date.UTC(y, m - 1, d, h, mi) - ahora) / 60_000;
    return diff >= 0 && diff <= MINUTOS_ANTES;
  });
  if (proximas.length === 0) return { revisadas: 0, enviadas: 0 };

  // Reclamo atómico: solo las filas que ESTA ejecución pasó a notificado=true
  const { data: reclamadas } = await supabase
    .from('agenda_cirugias')
    .update({ notificado: true, updated_at: new Date().toISOString() })
    .in('id', proximas.map((c) => c.id))
    .eq('notificado', false)
    .select('id');
  const mias = new Set((reclamadas ?? []).map((r) => r.id));
  const aEnviar = proximas.filter((c) => mias.has(c.id));

  const usuarios = await usuariosDeDoctores(aEnviar.map((c) => c.doctor_id));
  let enviadas = 0;
  for (const c of aEnviar) {
    const userId = usuarios.get(c.doctor_id);
    if (!userId) continue;
    enviadas += await notificarUsuarios([userId], {
      tipo: 'PROXIMA_CIRUGIA',
      titulo: 'Cirugía próxima',
      mensaje: `${c.nombre_paciente}${c.procedimiento ? ' · ' + c.procedimiento : ''} a las ${c.hora!.slice(0, 5)}${c.jornada ? ' (' + c.jornada + ')' : ''}`,
      entidadTipo: 'agenda_cirugia',
      entidadId: c.id,
    });
  }
  return { revisadas: aEnviar.length, enviadas };
}

/**
 * "Cron sin cron" para el plan gratuito de Vercel: se invoca desde el sondeo de
 * notificaciones que hace cada usuario conectado (cada 30 s). Como mucho corre
 * una vez cada INTERVALO por instancia; el reclamo atómico evita duplicados
 * entre instancias. Nunca lanza.
 */
const INTERVALO_MS = 2 * 60_000;
let ultimaCorrida = 0;
let enCurso: Promise<unknown> | null = null;

export async function procesarRecordatoriosSiToca(): Promise<void> {
  const ahora = Date.now();
  if (enCurso || ahora - ultimaCorrida < INTERVALO_MS) return;
  ultimaCorrida = ahora;
  enCurso = procesarRecordatoriosCirugia()
    .catch((e) => console.error('[recordatorios]', e))
    .finally(() => {
      enCurso = null;
    });
  await enCurso;
}
