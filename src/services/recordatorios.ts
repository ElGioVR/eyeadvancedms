import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { notificarRoles, notificarUsuarios, usuariosDeDoctores } from '@/services/notificaciones';

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

/** Hora (Tijuana) a partir de la cual se manda el recordatorio de inicio de jornada. */
const HORA_INICIO_JORNADA = parseInt(process.env.AGENDA_INICIO_JORNADA_HORA || '7', 10);

/**
 * Recordatorio de inicio de jornada: lentes de COMPRA DIRECTA de las cirugías de hoy
 * que aún no se han confirmado como listos. Cada lente se reclama de forma atómica
 * (recordado_fecha = hoy) → un solo aviso por día aunque corra en varias instancias.
 * Requiere sql/patch-lentes-logistica-supabase.sql.
 */
export async function procesarRecordatorioLentesCompraDirecta(): Promise<{ enviadas: number }> {
  const ahora = ahoraTijuana();
  const hoy = new Date(ahora).toISOString().slice(0, 10);
  const hora = new Date(ahora).getUTCHours();
  if (hora < HORA_INICIO_JORNADA) return { enviadas: 0 };

  const supabase = getSupabaseAdmin();
  const { data: lentes, error } = await supabase
    .from('cirugia_lentes')
    .select('id, cirugia_id, orden, fabricante, modelo, poder_d, cilindro, torico, agenda_cirugias!inner(fecha, hora, nombre_paciente, doctor_id, estado)')
    .eq('modo', 'COMPRA_DIRECTA')
    .eq('estado', 'RESERVADO')
    .eq('estado_logistica', 'POR_COMPRAR')
    .eq('agenda_cirugias.fecha', hoy)
    .eq('agenda_cirugias.estado', 'agendada')
    .or(`recordado_fecha.is.null,recordado_fecha.lt.${hoy}`)
    .limit(200);
  if (error) throw new Error('Error al consultar lentes de compra directa');
  if (!lentes?.length) return { enviadas: 0 };

  // Reclamo atómico por lente.
  const { data: reclamados } = await supabase
    .from('cirugia_lentes')
    .update({ recordado_fecha: hoy })
    .in('id', lentes.map((l) => l.id))
    .or(`recordado_fecha.is.null,recordado_fecha.lt.${hoy}`)
    .select('id');
  const mios = new Set((reclamados ?? []).map((r) => r.id));
  const aEnviar = (lentes as any[])
    .filter((l) => mios.has(l.id))
    .map((l) => ({ l, c: Array.isArray(l.agenda_cirugias) ? l.agenda_cirugias[0] : l.agenda_cirugias }))
    .filter((x) => x.c);
  if (!aEnviar.length) return { enviadas: 0 };

  const linea = ({ l, c }: (typeof aEnviar)[number]) =>
    `${c.hora ? String(c.hora).slice(0, 5) + ' ' : ''}${c.nombre_paciente}: ${[l.fabricante, l.modelo].filter(Boolean).join(' ')}${l.poder_d != null ? ` ${l.poder_d}D` : ''}${l.torico && l.cilindro != null ? ` cil. ${l.cilindro}` : ''}`;

  // Inventario / recepción: todos los lentes del día en un solo aviso.
  let enviadas = await notificarRoles(['admin', 'recepcionista'], {
    tipo: 'SISTEMA',
    titulo: `Lentes de compra directa para hoy (${aEnviar.length})`,
    mensaje: aEnviar.map(linea).join(' · '),
    entidadTipo: 'agenda_cirugia',
    entidadId: aEnviar[0].l.cirugia_id,
  });

  // Cada doctor: solo los de sus cirugías.
  const porDoctor = new Map<string, typeof aEnviar>();
  for (const x of aEnviar) {
    if (!x.c.doctor_id) continue;
    porDoctor.set(x.c.doctor_id, [...(porDoctor.get(x.c.doctor_id) ?? []), x]);
  }
  const usuarios = await usuariosDeDoctores([...porDoctor.keys()]);
  for (const [doctorId, items] of porDoctor) {
    const userId = usuarios.get(doctorId);
    if (!userId) continue;
    enviadas += await notificarUsuarios([userId], {
      tipo: 'SISTEMA',
      titulo: `Confirma tus lentes de compra directa (${items.length})`,
      mensaje: `Antes de iniciar: ${items.map(linea).join(' · ')}`,
      entidadTipo: 'agenda_cirugia',
      entidadId: items[0].l.cirugia_id,
    });
  }
  return { enviadas };
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
  enCurso = Promise.all([
    procesarRecordatoriosCirugia(),
    procesarRecordatorioLentesCompraDirecta(),
  ])
    .catch((e) => console.error('[recordatorios]', e))
    .finally(() => {
      enCurso = null;
    });
  await enCurso;
}
