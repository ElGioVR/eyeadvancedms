import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { notificarRoles, notificarUsuarios, usuariosDeDoctores } from '@/services/notificaciones';
import { detalleEvento, ESTATUS_ACTIVOS_CONSULTA } from '@/lib/bandeja-agenda';
import { etiquetaTipoConsulta } from '@/lib/catalogos/tipos-consulta';

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

/** Clave de la cita (fecha+hora) para saber a qué horario ya se le avisó. */
function claveCita(fecha: string, hora: string): string {
  return `${fecha}T${hora.slice(0, 5)}`;
}

/** Minutos que faltan para la cita (null = fuera de la ventana de aviso). */
function minutosParaCita(ahora: number, fecha: string | null, hora: string | null): number | null {
  if (!fecha || !hora) return null;
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d, h, mi) - ahora) / 60_000);
  return diff >= 0 && diff <= MINUTOS_ANTES ? diff : null;
}

function enCuanto(min: number): string {
  if (min <= 1) return 'ya va a empezar';
  return min >= 60 ? `en ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `en ${min} min`;
}

const faltaColumna = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /recordatorio_para/.test(e.message || ''));

/**
 * Sin sql/patch-push-notificaciones-supabase.sql no existe `recordatorio_para`:
 * cirugías usan el método anterior (`notificado`) y las consultas no se recuerdan.
 * Se detecta una vez por instancia para no generar errores en cada vuelta.
 */
const sinColumna = { cirugias: false, consultas: false };

/**
 * Reclama de forma atómica el recordatorio de cada cita (recordatorio_para ← clave).
 * Si la cita se mueve de horario la clave cambia y se vuelve a avisar.
 * Devuelve los ids que reclamó ESTA ejecución (nunca se duplica entre instancias).
 */
async function reclamar(tabla: 'agenda_cirugias' | 'consultas', citas: Array<{ id: string; clave: string }>): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const mias = new Set<string>();
  await Promise.all(
    citas.map(async ({ id, clave }) => {
      const { data } = await supabase
        .from(tabla)
        .update({ recordatorio_para: clave })
        .eq('id', id)
        .or(`recordatorio_para.is.null,recordatorio_para.neq."${clave}"`)
        .select('id');
      if (data?.length) mias.add(id);
    }),
  );
  return mias;
}

/**
 * Recordatorio "Cirugía próxima" (MINUTOS_ANTES antes) al cirujano y a los
 * médicos del equipo quirúrgico. Incluye cirugías reagendadas a una nueva fecha;
 * excluye las que fueron sustituidas por otra (reagenda con cirugía nueva).
 */
export async function procesarRecordatoriosCirugia(): Promise<{ revisadas: number; enviadas: number }> {
  const supabase = getSupabaseAdmin();
  const ahora = ahoraTijuana();
  const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const columnas = 'id, doctor_id, nombre_paciente, procedimiento, ojo, fecha, hora, jornada, estado';
  const base = (cols: string) =>
    supabase
      .from('agenda_cirugias')
      .select(cols)
      .not('estado', 'in', '(aplazada,completada,cancelada)')
      .not('doctor_id', 'is', null)
      .not('hora', 'is', null)
      .gte('fecha', aFecha(ahora))
      .lte('fecha', aFecha(ahora + MINUTOS_ANTES * 60_000))
      .limit(200);

  let filas: Array<Record<string, any>> = [];
  if (!sinColumna.cirugias) {
    const r = await base(`${columnas}, recordatorio_para`);
    if (faltaColumna(r.error)) sinColumna.cirugias = true;
    else if (r.error) throw new Error('Error al consultar cirugías');
    else filas = (r.data ?? []) as unknown as Array<Record<string, any>>;
  }
  if (sinColumna.cirugias) {
    const r = await base(columnas).eq('notificado', false).eq('estado', 'agendada');
    if (r.error) throw new Error('Error al consultar cirugías');
    filas = (r.data ?? []) as unknown as Array<Record<string, any>>;
  }

  let proximas = filas
    .map((c) => ({ c, min: minutosParaCita(ahora, c.fecha, c.hora) }))
    .filter((x): x is { c: Record<string, any>; min: number } => x.min !== null)
    .filter(({ c }) => sinColumna.cirugias || c.recordatorio_para !== claveCita(c.fecha, c.hora));
  if (proximas.length === 0) return { revisadas: 0, enviadas: 0 };

  // Reagendadas que ya tienen una cirugía nueva que las sustituye: no se avisan.
  const reagendadas = proximas.filter(({ c }) => c.estado === 'reagendada').map(({ c }) => c.id as string);
  if (reagendadas.length) {
    const { data: sustitutas } = await supabase.from('agenda_cirugias').select('reagenda_de_id').in('reagenda_de_id', reagendadas);
    const sustituidas = new Set((sustitutas ?? []).map((s) => s.reagenda_de_id as string));
    proximas = proximas.filter(({ c }) => !sustituidas.has(c.id));
    if (proximas.length === 0) return { revisadas: 0, enviadas: 0 };
  }

  let mias: Set<string>;
  if (sinColumna.cirugias) {
    const { data: reclamadas } = await supabase
      .from('agenda_cirugias')
      .update({ notificado: true, updated_at: new Date().toISOString() })
      .in('id', proximas.map(({ c }) => c.id))
      .eq('notificado', false)
      .select('id');
    mias = new Set((reclamadas ?? []).map((r) => r.id as string));
  } else {
    mias = await reclamar('agenda_cirugias', proximas.map(({ c }) => ({ id: c.id, clave: claveCita(c.fecha, c.hora) })));
  }
  const aEnviar = proximas.filter(({ c }) => mias.has(c.id));
  if (aEnviar.length === 0) return { revisadas: 0, enviadas: 0 };

  // Equipo quirúrgico (ayudantes, anestesiólogo…) además del cirujano.
  const { data: participantes } = await supabase
    .from('cirugia_participantes')
    .select('cirugia_id, medico_id')
    .in('cirugia_id', aEnviar.map(({ c }) => c.id));
  const medicosPorCirugia = new Map<string, string[]>();
  for (const p of participantes ?? []) {
    medicosPorCirugia.set(p.cirugia_id, [...(medicosPorCirugia.get(p.cirugia_id) ?? []), p.medico_id]);
  }
  const usuarios = await usuariosDeDoctores([
    ...aEnviar.map(({ c }) => c.doctor_id),
    ...(participantes ?? []).map((p) => p.medico_id),
  ]);

  let enviadas = 0;
  for (const { c, min } of aEnviar) {
    const destinatarios = [c.doctor_id, ...(medicosPorCirugia.get(c.id) ?? [])].map((d) => usuarios.get(d));
    const detalle = detalleEvento({ tipo: 'cirugia', procedimiento: c.procedimiento, ojo: c.ojo });
    enviadas += await notificarUsuarios(destinatarios, {
      tipo: 'PROXIMA_CIRUGIA',
      titulo: `Cirugía a las ${String(c.hora).slice(0, 5)} · ${enCuanto(min)}`,
      mensaje: [c.nombre_paciente, detalle, c.jornada ? `Jornada ${c.jornada}` : null].filter(Boolean).join(' · '),
      entidadTipo: 'agenda_cirugia',
      entidadId: c.id,
    });
  }
  return { revisadas: aEnviar.length, enviadas };
}

/**
 * Recordatorio de la próxima consulta / estudio (MINUTOS_ANTES antes) al médico
 * asignado. Requiere sql/patch-push-notificaciones-supabase.sql.
 */
export async function procesarRecordatoriosConsulta(): Promise<{ revisadas: number; enviadas: number }> {
  if (sinColumna.consultas) return { revisadas: 0, enviadas: 0 };
  const supabase = getSupabaseAdmin();
  const ahora = ahoraTijuana();
  const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('consultas')
    .select(`id, doctor_id, fecha, hora_inicio, tipo_consulta, tipo_visita, procedimiento, estudio_1, estudio_2, estudio_3,
             recordatorio_para, especialidad:especialidad_id (nombre), pacientes:paciente_id (nombre_completo)`)
    .in('estatus', [...ESTATUS_ACTIVOS_CONSULTA])
    .not('doctor_id', 'is', null)
    .not('hora_inicio', 'is', null)
    .gte('fecha', aFecha(ahora))
    .lte('fecha', aFecha(ahora + MINUTOS_ANTES * 60_000))
    .limit(300);
  if (faltaColumna(error)) {
    sinColumna.consultas = true;
    return { revisadas: 0, enviadas: 0 };
  }
  if (error) throw new Error('Error al consultar consultas');

  const proximas = ((data ?? []) as Array<Record<string, any>>)
    .map((c) => ({ c, min: minutosParaCita(ahora, c.fecha, c.hora_inicio) }))
    .filter((x): x is { c: Record<string, any>; min: number } => x.min !== null)
    .filter(({ c }) => c.recordatorio_para !== claveCita(c.fecha, c.hora_inicio));
  if (proximas.length === 0) return { revisadas: 0, enviadas: 0 };

  const mias = await reclamar('consultas', proximas.map(({ c }) => ({ id: c.id, clave: claveCita(c.fecha, c.hora_inicio) })));
  const aEnviar = proximas.filter(({ c }) => mias.has(c.id));
  if (aEnviar.length === 0) return { revisadas: 0, enviadas: 0 };

  const usuarios = await usuariosDeDoctores(aEnviar.map(({ c }) => c.doctor_id));
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  let enviadas = 0;
  for (const { c, min } of aEnviar) {
    const userId = usuarios.get(c.doctor_id);
    if (!userId) continue;
    const esEstudio = String(c.tipo_consulta || '').toUpperCase().includes('ESTUDIO');
    const detalle = detalleEvento({
      tipo: esEstudio ? 'estudio' : 'consulta',
      tipo_consulta: c.tipo_consulta,
      tipo_consulta_label: etiquetaTipoConsulta(c.tipo_consulta, c.tipo_visita),
      especialidad: uno<{ nombre?: string }>(c.especialidad)?.nombre,
      procedimiento: c.procedimiento,
      estudios: [c.estudio_1, c.estudio_2, c.estudio_3],
    });
    const paciente = uno<{ nombre_completo?: string }>(c.pacientes)?.nombre_completo || 'Paciente';
    enviadas += await notificarUsuarios([userId], {
      tipo: 'RECORDATORIO_CONSULTA',
      titulo: `${esEstudio ? 'Estudio' : 'Consulta'} a las ${String(c.hora_inicio).slice(0, 5)} · ${enCuanto(min)}`,
      mensaje: [paciente, detalle].filter(Boolean).join(' · '),
      entidadTipo: 'consulta',
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
  enCurso = procesarTodosLosRecordatorios()
    .catch((e) => console.error('[recordatorios]', e))
    .finally(() => {
      enCurso = null;
    });
  await enCurso;
}

/** Todos los recordatorios (sondeo de la app y cron de Supabase). */
export async function procesarTodosLosRecordatorios() {
  const [cirugias, consultas, lentes] = await Promise.allSettled([
    procesarRecordatoriosCirugia(),
    procesarRecordatoriosConsulta(),
    procesarRecordatorioLentesCompraDirecta(),
  ]);
  for (const r of [cirugias, consultas, lentes]) if (r.status === 'rejected') console.error('[recordatorios]', r.reason);
  const valor = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  return { cirugias: valor(cirugias), consultas: valor(consultas), lentes: valor(lentes) };
}
