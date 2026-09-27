import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { inEnLotes, leerTodo } from './lotes';

export interface ResumenFila {
  fuente: string;
  doctor_id: string;
  fecha: string;
  monto: number;
  estado_pago: 'PENDIENTE_CONFIG' | 'POR_PAGAR' | 'PAGADO' | 'CANCELADO';
  origen: string | null;
  id?: string;
  metricas_ligados?: {
    estudios_ligados: number;
    procedimientos_ligados: number;
    cirugias_ligadas: number;
  };
}

export interface ResumenQuery {
  desde: string;
  hasta: string;
  doctor_id?: string;
}

interface EventoResumenRow {
  id: string;
  origen_tipo: string;
  origen_id: string | null;
  doctor_id: string;
  paciente_id: string | null;
  fecha_servicio: string;
  monto_devengado: number | string | null;
  tarifa_snapshot: unknown;
  estado: string;
  metricas_ligados: unknown;
}

interface AgendaEmbebida {
  fecha: string;
  estado: string;
  origen_id: string | null;
  paciente_id: string | null;
}

interface CpRow {
  monto: number | null;
  estado: string;
  regla_id: string | null;
  origen_id: string | null;
  participante: { medico_id: string } | { medico_id: string }[] | null;
  agenda: AgendaEmbebida | AgendaEmbebida[] | null;
}

const uno = <T>(v: T | T[] | null | undefined): T | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

function snapshotDe(eh: EventoResumenRow): { nombre: string | null; origenId: string | null } {
  const snap = (eh.tarifa_snapshot || {}) as Record<string, unknown>;
  return {
    nombre: typeof snap.origen_nombre === 'string' ? snap.origen_nombre : null,
    origenId: typeof snap.origen_id === 'string' ? snap.origen_id : null,
  };
}

/**
 * Resumen de honorarios (eventos_honorario + cirugia_productividad) del rango.
 *
 * Rendimiento: antes ~12 viajes en serie a la BD (y `cirugia_productividad`
 * completa sin filtro de fecha). Ahora 3 rondas, cada una en paralelo:
 *   1) eventos ‖ cirugías del rango (filtradas en BD) ‖ catálogo de aseguranzas
 *   2) conceptos ‖ agenda (cirugías de eventos) ‖ pacientes
 *   3) consultas ‖ verificación de cirugías canceladas
 * La semántica de `origen` y de filtros es la misma que la versión anterior.
 */
export async function listarResumenHonorarios(
  query: ResumenQuery
): Promise<ResumenFila[]> {
  const supabase = getSupabaseAdmin();
  const { desde, hasta, doctor_id } = query;

  // ── Ronda 1 ────────────────────────────────────────────────────────────
  const eventosP = leerTodo<EventoResumenRow>((a, b) => {
    let q = supabase
      .from('eventos_honorario')
      .select(
        'id, origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, tarifa_snapshot, estado, metricas_ligados'
      )
      .gte('fecha_servicio', desde)
      .lte('fecha_servicio', hasta)
      .neq('estado', 'REVERSADO');
    if (doctor_id) q = q.eq('doctor_id', doctor_id);
    return q.order('fecha_servicio', { ascending: true }).order('id', { ascending: true }).range(a, b);
  });

  // Filtro de rango, cancelación y doctor resuelto en la BD (antes se leía la
  // tabla completa y se filtraba en memoria).
  const cpP = leerTodo<CpRow>((a, b) => {
    let q = supabase
      .from('cirugia_productividad')
      .select(
        `id, monto, estado, regla_id, origen_id,
         participante:cirugia_participantes${doctor_id ? '!inner' : ''}(medico_id),
         agenda:agenda_cirugias!inner(fecha, estado, origen_id, paciente_id)`
      )
      .neq('estado', 'ANULADO')
      .gte('agenda.fecha', desde)
      .lte('agenda.fecha', hasta)
      .neq('agenda.estado', 'cancelada');
    if (doctor_id) q = q.eq('participante.medico_id', doctor_id);
    return q.order('id', { ascending: true }).range(a, b);
  });

  const asegP = leerTodo<{ id: string; nombre: string }>((a, b) =>
    supabase.from('aseguranzas').select('id, nombre').order('id').range(a, b)
  );

  const [eventos, cpRows, aseguranzas] = await Promise.all([eventosP, cpP, asegP]);
  const asegNames = new Map(aseguranzas.map((a) => [a.id, a.nombre]));

  // ── Ronda 2 ────────────────────────────────────────────────────────────
  const conceptoIds = new Set<string>();
  const cirugiaIds = new Set<string>();
  const pacienteIds = new Set<string>();

  for (const eh of eventos) {
    // Para descartar procedimientos de cirugías canceladas.
    if (eh.origen_tipo === 'PROCEDIMIENTO' && eh.origen_id) conceptoIds.add(eh.origen_id);
    const snap = snapshotDe(eh);
    if (snap.nombre || snap.origenId) continue; // origen ya resuelto por el snapshot
    if (eh.origen_tipo === 'OPERACION' && eh.origen_id) cirugiaIds.add(eh.origen_id);
    else if (eh.origen_id) conceptoIds.add(eh.origen_id);
    if (eh.paciente_id) pacienteIds.add(eh.paciente_id);
  }

  const cps = cpRows
    .map((row) => ({ row, part: uno(row.participante), agenda: uno(row.agenda) }))
    .filter((c): c is typeof c & { agenda: AgendaEmbebida } => !!c.agenda)
    .filter((c) => c.agenda.estado !== 'cancelada' && c.agenda.fecha >= desde && c.agenda.fecha <= hasta)
    .filter((c) => !doctor_id || c.part?.medico_id === doctor_id);

  for (const c of cps) {
    if (!c.row.origen_id && c.agenda.paciente_id) pacienteIds.add(c.agenda.paciente_id);
  }

  const [conceptos, cirugias, pacientes] = await Promise.all([
    inEnLotes<{ id: string; consulta_id: string | null }>(conceptoIds, (l) =>
      supabase.from('consulta_conceptos').select('id, consulta_id').in('id', l)
    ),
    inEnLotes<{ id: string; origen_id: string | null; consulta_id: string | null }>(cirugiaIds, (l) =>
      supabase.from('agenda_cirugias').select('id, origen_id, consulta_id').in('id', l)
    ),
    inEnLotes<{ id: string; aseguranza_id: string | null }>(pacienteIds, (l) =>
      supabase.from('pacientes').select('id, aseguranza_id').in('id', l)
    ),
  ]);

  const conceptoToConsulta = new Map(conceptos.map((c) => [c.id, c.consulta_id]));
  const cirugiaPorId = new Map(cirugias.map((c) => [c.id, c]));
  const pacienteToAseg = new Map(pacientes.map((p) => [p.id, p.aseguranza_id ?? null]));

  // ── Ronda 3 ────────────────────────────────────────────────────────────
  const consultaIdsConceptos = new Set(
    conceptos.map((c) => c.consulta_id).filter((v): v is string => !!v)
  );
  const consultaIds = new Set<string>(consultaIdsConceptos);
  for (const c of cirugias) if (c.consulta_id) consultaIds.add(c.consulta_id);

  const [consultas, canceladas] = await Promise.all([
    inEnLotes<{ id: string; aseguranza_id: string | null }>(consultaIds, (l) =>
      supabase.from('consultas').select('id, aseguranza_id').in('id', l)
    ),
    // Mismo criterio que la versión anterior (id de agenda = consulta del concepto).
    inEnLotes<{ id: string }>(consultaIdsConceptos, (l) =>
      supabase.from('agenda_cirugias').select('id').in('id', l).eq('estado', 'cancelada')
    ),
  ]);

  const consultaToAseg = new Map(consultas.map((c) => [c.id, c.aseguranza_id ?? null]));
  const consultasCanceladas = new Set(canceladas.map((c) => c.id));

  const nombreAseg = (id: string | null) => (id ? asegNames.get(id) ?? null : null);

  const origenEvento = (eh: EventoResumenRow): string | null => {
    const snap = snapshotDe(eh);
    if (snap.nombre) return snap.nombre;
    let asegId: string | null = snap.origenId;
    if (!asegId && eh.origen_id) {
      if (eh.origen_tipo === 'OPERACION') {
        const ac = cirugiaPorId.get(eh.origen_id);
        asegId = ac?.origen_id ?? null;
        if (!asegId && ac?.consulta_id) asegId = consultaToAseg.get(ac.consulta_id) ?? null;
      } else {
        const consultaId = conceptoToConsulta.get(eh.origen_id);
        if (consultaId) asegId = consultaToAseg.get(consultaId) ?? null;
      }
    }
    if (!asegId && eh.paciente_id) asegId = pacienteToAseg.get(eh.paciente_id) ?? null;
    return nombreAseg(asegId);
  };

  const filas: ResumenFila[] = [];

  for (const eh of eventos) {
    if (eh.origen_tipo === 'PROCEDIMIENTO' && eh.origen_id) {
      const consultaId = conceptoToConsulta.get(eh.origen_id);
      if (consultaId && consultasCanceladas.has(consultaId)) continue;
    }

    let estado_pago: ResumenFila['estado_pago'] = 'POR_PAGAR';
    const snap = (eh.tarifa_snapshot || {}) as Record<string, unknown>;
    const monto = Number(eh.monto_devengado) || 0;
    if (eh.estado === 'CANCELADO') estado_pago = 'CANCELADO';
    else if (snap.sin_tarifa || monto <= 0) estado_pago = 'PENDIENTE_CONFIG';
    else if (eh.estado === 'PAGADO') estado_pago = 'PAGADO';

    const metricas = (eh.metricas_ligados || null) as ResumenFila['metricas_ligados'] | null;
    filas.push({
      id: eh.id,
      fuente: eh.origen_tipo === 'OPERACION' ? 'CIRUGIA' : eh.origen_tipo,
      doctor_id: eh.doctor_id,
      fecha: eh.fecha_servicio,
      monto,
      estado_pago,
      origen: origenEvento(eh),
      metricas_ligados: metricas || undefined,
    });
  }

  for (const { row, part, agenda } of cps) {
    const montoCp = Number(row.monto) || 0;
    let estadoCp: ResumenFila['estado_pago'];
    if (row.estado === 'ANULADO') estadoCp = 'CANCELADO';
    else if (row.regla_id == null || row.monto == null || montoCp <= 0) estadoCp = 'PENDIENTE_CONFIG';
    else if (row.estado === 'PAGADO') estadoCp = 'PAGADO';
    else estadoCp = 'POR_PAGAR';

    const asegId =
      row.origen_id ?? (agenda.paciente_id ? pacienteToAseg.get(agenda.paciente_id) ?? null : null);

    filas.push({
      id: `cp:${agenda.origen_id || ''}:${part?.medico_id || ''}`,
      fuente: 'CIRUGIA',
      doctor_id: part?.medico_id || '',
      fecha: agenda.fecha || '',
      monto: montoCp,
      estado_pago: estadoCp,
      origen: nombreAseg(asegId),
    });
  }

  filas.sort((a, b) => {
    if (a.fecha === b.fecha) return a.doctor_id.localeCompare(b.doctor_id);
    return a.fecha.localeCompare(b.fecha);
  });

  return filas;
}
