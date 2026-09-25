import { getSupabaseAdmin } from '@/lib/supabase/admin';

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

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

async function resolverOrigenEventos(
  supabase: SupabaseAdmin,
  eventos: Array<{
    origen_tipo: string;
    origen_id: string | null;
    paciente_id: string | null;
    tarifa_snapshot: unknown;
  }>
): Promise<Map<string, string | null>> {
  const origenMap = new Map<string, string | null>();
  const conceptoIds = new Set<string>();
  const cirugiaIds = new Set<string>();
  const pacienteIds = new Set<string>();
  const aseguranzaIds = new Set<string>();

  const conceptoToConsulta = new Map<string, string>();
  const cirugiaToAseg = new Map<string, string | null>();
  const cirugiaToConsulta = new Map<string, string | null>();
  const pacienteToAseg = new Map<string, string | null>();
  const asegNames = new Map<string, string>();

  const eventosPendientes: Array<{ key: string; snapOrigenId: string | null }> = [];

  for (const eh of eventos) {
    const key = `${eh.origen_tipo}:${eh.origen_id || ''}:${eh.paciente_id || ''}`;
    const snap = (eh.tarifa_snapshot || {}) as Record<string, unknown>;
    const snapNombre = typeof snap.origen_nombre === 'string' ? snap.origen_nombre : null;
    const snapOrigenId = typeof snap.origen_id === 'string' ? snap.origen_id : null;

    if (snapNombre) {
      origenMap.set(key, snapNombre);
      if (snapOrigenId) aseguranzaIds.add(snapOrigenId);
      continue;
    }

    eventosPendientes.push({ key, snapOrigenId });
    if (snapOrigenId) aseguranzaIds.add(snapOrigenId);

    if (eh.origen_tipo === 'OPERACION' && eh.origen_id) {
      cirugiaIds.add(eh.origen_id);
    } else if (eh.origen_id) {
      conceptoIds.add(eh.origen_id);
    }
    if (eh.paciente_id) pacienteIds.add(eh.paciente_id);
  }

  if (conceptoIds.size > 0) {
    const { data: conceptos } = await supabase
      .from('consulta_conceptos')
      .select('id, consulta_id')
      .in('id', [...conceptoIds]);
    for (const cc of conceptos || []) {
      conceptoToConsulta.set(cc.id, cc.consulta_id);
    }
  }

  const consultaIds = new Set<string>(conceptoToConsulta.values());

  if (cirugiaIds.size > 0) {
    const { data: cirugias } = await supabase
      .from('agenda_cirugias')
      .select('id, origen_id, consulta_id, paciente_id')
      .in('id', [...cirugiaIds]);
    for (const ac of cirugias || []) {
      cirugiaToAseg.set(ac.id, ac.origen_id ?? null);
      cirugiaToConsulta.set(ac.id, ac.consulta_id ?? null);
      if (ac.origen_id) aseguranzaIds.add(ac.origen_id);
      if (ac.consulta_id) consultaIds.add(ac.consulta_id);
      if (ac.paciente_id) pacienteIds.add(ac.paciente_id);
    }
  }

  if (consultaIds.size > 0) {
    const { data: consultas } = await supabase
      .from('consultas')
      .select('id, aseguranza_id')
      .in('id', [...consultaIds]);
    for (const c of consultas || []) {
      if (c.aseguranza_id) {
        aseguranzaIds.add(c.aseguranza_id);
        conceptoToConsulta.set(`consulta:${c.id}`, c.aseguranza_id);
      }
    }
  }

  if (pacienteIds.size > 0) {
    const { data: pacientes } = await supabase
      .from('pacientes')
      .select('id, aseguranza_id')
      .in('id', [...pacienteIds]);
    for (const p of pacientes || []) {
      pacienteToAseg.set(p.id, p.aseguranza_id ?? null);
      if (p.aseguranza_id) aseguranzaIds.add(p.aseguranza_id);
    }
  }

  if (aseguranzaIds.size > 0) {
    const { data: aseg } = await supabase
      .from('aseguranzas')
      .select('id, nombre')
      .in('id', [...aseguranzaIds]);
    for (const a of aseg || []) {
      asegNames.set(a.id, a.nombre);
    }
  }

  for (const pend of eventosPendientes) {
    let asegId: string | null = pend.snapOrigenId;

    if (!asegId) {
      const [tipo, origenId] = pend.key.split(':');
      if (tipo === 'OPERACION' && origenId) {
        asegId = cirugiaToAseg.get(origenId) ?? null;
        if (!asegId) {
          const consultaId = cirugiaToConsulta.get(origenId);
          if (consultaId) {
            asegId = conceptoToConsulta.get(`consulta:${consultaId}`) ?? null;
          }
        }
      } else if (origenId) {
        const consultaId = conceptoToConsulta.get(origenId);
        if (consultaId) {
          asegId = conceptoToConsulta.get(`consulta:${consultaId}`) ?? null;
        }
      }
    }

    if (!asegId) {
      const pacienteId = pend.key.split(':')[2];
      if (pacienteId) {
        asegId = pacienteToAseg.get(pacienteId) ?? null;
      }
    }

    origenMap.set(pend.key, asegId ? asegNames.get(asegId) ?? null : null);
  }

  return origenMap;
}

export async function listarResumenHonorarios(
  query: ResumenQuery
): Promise<ResumenFila[]> {
  const supabase = getSupabaseAdmin();
  const { desde, hasta, doctor_id } = query;

  const eventosQuery = supabase
    .from('eventos_honorario')
    .select('id, origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, tarifa_snapshot, estado, metricas_ligados')
    .gte('fecha_servicio', desde)
    .lte('fecha_servicio', hasta)
    .neq('estado', 'REVERSADO');

  const { data: eventos } = await (doctor_id ? eventosQuery.eq('doctor_id', doctor_id) : eventosQuery);

  const filas: ResumenFila[] = [];
  const eventosFiltrados: typeof eventos = [];

  // Filtro de eventos de procedimientos cancelados: en batch (2 queries totales
  // en vez de 2 por fila).
  const procOrigenIds = (eventos || [])
    .filter((eh) => eh.origen_tipo === 'PROCEDIMIENTO' && eh.origen_id)
    .map((eh) => eh.origen_id as string);

  const consultasCanceladas = new Set<string>();
  if (procOrigenIds.length > 0) {
    const { data: ccRows } = await supabase
      .from('consulta_conceptos')
      .select('id, consulta_id')
      .in('id', procOrigenIds);
    const conceptosAConsulta = new Map((ccRows || []).map((cc) => [cc.id, cc.consulta_id]));
    const consultaIds = [...new Set([...conceptosAConsulta.values()].filter(Boolean))] as string[];
    if (consultaIds.length > 0) {
      const { data: acRows } = await supabase
        .from('agenda_cirugias')
        .select('id, estado')
        .in('id', consultaIds)
        .eq('estado', 'cancelada');
      for (const ac of acRows || []) consultasCanceladas.add(ac.id);
    }
    for (const eh of (eventos || [])) {
      if (eh.origen_tipo === 'PROCEDIMIENTO' && eh.origen_id) {
        const consultaId = conceptosAConsulta.get(eh.origen_id as string);
        if (consultaId && consultasCanceladas.has(consultaId)) continue;
      }
      eventosFiltrados.push(eh);
    }
  } else {
    eventosFiltrados.push(...(eventos || []));
  }

  const origenEventos = await resolverOrigenEventos(supabase, eventosFiltrados);

  for (const eh of eventosFiltrados) {
    let estado_pago: ResumenFila['estado_pago'] = 'POR_PAGAR';
    const snap = (eh.tarifa_snapshot || {}) as Record<string, unknown>;
    const monto = Number(eh.monto_devengado) || 0;
    if (eh.estado === 'CANCELADO') estado_pago = 'CANCELADO';
    else if (snap.sin_tarifa || monto <= 0) estado_pago = 'PENDIENTE_CONFIG';
    else if (eh.estado === 'PAGADO') estado_pago = 'PAGADO';

    const key = `${eh.origen_tipo}:${eh.origen_id || ''}:${eh.paciente_id || ''}`;
    const metricas = (eh.metricas_ligados || null) as ResumenFila['metricas_ligados'] | null;
    filas.push({
      id: eh.id,
      fuente: eh.origen_tipo === 'OPERACION' ? 'CIRUGIA' : eh.origen_tipo,
      doctor_id: eh.doctor_id,
      fecha: eh.fecha_servicio,
      monto,
      estado_pago,
      origen: origenEventos.get(key) ?? null,
      metricas_ligados: metricas || undefined,
    });
  }

  const { data: cpRows } = await supabase
    .from('cirugia_productividad')
    .select(`
      id, cirugia_id, monto, estado, regla_id, participante_id, origen_id,
      participante:cirugia_participantes(medico_id),
      agenda:agenda_cirugias(fecha, codigo, estado, origen_id, consulta_id, paciente_id)
    `)
    .neq('estado', 'ANULADO');

  const cpFiltrados: Array<{
    monto: number | null;
    estado: string;
    regla_id: string | null;
    origen_id: string | null;
    medico_id: string | null;
    fecha: string | null;
    agendaEstado: string | null;
    cirugiaOrigenId: string | null;
    consultaId: string | null;
    pacienteId: string | null;
  }> = [];

  for (const raw of (cpRows || [])) {
    const row = raw as unknown as {
      monto: number | null;
      estado: string;
      regla_id: string | null;
      origen_id: string | null;
      participante: { medico_id: string } | { medico_id: string }[] | null;
      agenda: {
        fecha: string;
        estado: string;
        origen_id: string | null;
        consulta_id: string | null;
        paciente_id: string | null;
      } | {
        fecha: string;
        estado: string;
        origen_id: string | null;
        consulta_id: string | null;
        paciente_id: string | null;
      }[] | null;
    };

    const part = Array.isArray(row.participante) ? row.participante[0] : row.participante;
    const agenda = Array.isArray(row.agenda) ? row.agenda[0] : row.agenda;
    if (!agenda) continue;
    if (agenda.estado === 'cancelada') continue;
    if (agenda.fecha < desde || agenda.fecha > hasta) continue;
    if (doctor_id && part?.medico_id !== doctor_id) continue;

    cpFiltrados.push({
      monto: row.monto,
      estado: row.estado,
      regla_id: row.regla_id,
      origen_id: row.origen_id,
      medico_id: part?.medico_id ?? null,
      fecha: agenda.fecha,
      agendaEstado: agenda.estado,
      cirugiaOrigenId: agenda.origen_id ?? null,
      consultaId: agenda.consulta_id ?? null,
      pacienteId: agenda.paciente_id ?? null,
    });
  }

  const cirugiaKeys = cpFiltrados.map((r) => `OPERACION:${r.cirugiaOrigenId || ''}:${r.pacienteId || ''}`);
  const cirugiaSnapshots = cpFiltrados.map((r) => ({
    origen_tipo: 'OPERACION',
    origen_id: r.cirugiaOrigenId,
    paciente_id: r.pacienteId,
    tarifa_snapshot: r.origen_id ? { origen_id: r.origen_id } : null,
  }));
  const origenCirugias = await resolverOrigenEventos(supabase, cirugiaSnapshots);

  for (let i = 0; i < cpFiltrados.length; i++) {
    const cp = cpFiltrados[i];
    const montoCp = Number(cp.monto) || 0;
    let estadoCp: ResumenFila['estado_pago'];
    if (cp.estado === 'ANULADO') estadoCp = 'CANCELADO';
    else if (cp.regla_id == null || cp.monto == null || montoCp <= 0) estadoCp = 'PENDIENTE_CONFIG';
    else if (cp.estado === 'PAGADO') estadoCp = 'PAGADO';
    else estadoCp = 'POR_PAGAR';

    filas.push({
      id: `cp:${cp.cirugiaOrigenId || ''}:${cp.medico_id || ''}`,
      fuente: 'CIRUGIA',
      doctor_id: cp.medico_id || '',
      fecha: cp.fecha || '',
      monto: montoCp,
      estado_pago: estadoCp,
      origen: origenCirugias.get(cirugiaKeys[i]) ?? null,
    });
  }

  filas.sort((a, b) => {
    if (a.fecha === b.fecha) return a.doctor_id.localeCompare(b.doctor_id);
    return a.fecha.localeCompare(b.fecha);
  });

  return filas;
}
