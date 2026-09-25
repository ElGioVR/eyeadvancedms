import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  esTipoPeriodo,
  getPeriodRange,
  montoValidoParaPago,
  parseMontoManual,
  type TipoPeriodo,
} from '@/lib/productividad/periodo';
import { hoyTijuana, rangoPersonalizado } from '@/lib/rangos';
import type {
  HonorarioAgrupadoFila,
  HonorarioLigaFila,
  HonorariosListado,
  HonorariosResumen,
  TipoAgrupacionLiga,
  TipoPeriodoPago,
} from '@/types/productividad';

const ESTADOS_EXCLUIDOS = ['REVERSADO'];

type EstadoDb = 'PENDIENTE' | 'DEVENGADO' | 'REVERSADO' | 'LIQUIDADO' | 'PAGADO' | 'CANCELADO';

interface EventoRow {
  id: string;
  origen_tipo: string;
  origen_id: string;
  doctor_id: string;
  paciente_id: string | null;
  fecha_servicio: string;
  monto_devengado: number | string;
  estado: string;
  tarifa_snapshot: unknown;
  metricas_ligados: unknown;
}

export async function leerTipoPeriodo(): Promise<TipoPeriodo> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'honorarios')
    .maybeSingle();

  const valor = (data?.valor as Record<string, unknown> | null) || {};
  const periodo = valor.periodo_pago;
  return esTipoPeriodo(periodo) ? periodo : 'MENSUAL';
}

function normalizarEstadoPago(
  estado: string,
  monto: number
): HonorarioLigaFila['estado_pago'] {
  if (estado === 'CANCELADO') return 'CANCELADO';
  if (estado === 'PAGADO') return 'PAGADO';
  if (monto <= 0) return 'PENDIENTE_CONFIG';
  return 'POR_PAGAR';
}

function prioridadOrden(fila: HonorarioLigaFila): number {
  if (fila.estado_pago === 'CANCELADO') return 3;
  if (fila.estado_pago === 'PAGADO') return 2;
  return 1;
}

function ordenarFilas(filaA: HonorarioLigaFila, filaB: HonorarioLigaFila): number {
  const pa = prioridadOrden(filaA);
  const pb = prioridadOrden(filaB);
  if (pa !== pb) return pa - pb;
  if (pa === 1) {
    if (filaA.periodo_fin !== filaB.periodo_fin) {
      return filaA.periodo_fin.localeCompare(filaB.periodo_fin);
    }
    if (filaA.fecha !== filaB.fecha) return filaA.fecha.localeCompare(filaB.fecha);
    return filaA.doctor_nombre.localeCompare(filaB.doctor_nombre);
  }
  if (pa === 2) {
    return filaB.fecha.localeCompare(filaA.fecha);
  }
  return filaA.fecha.localeCompare(filaB.fecha);
}

function calcularResumen(filas: HonorarioLigaFila[]): HonorariosResumen {
  const resumen: HonorariosResumen = {
    por_pagar: 0,
    pagado: 0,
    sin_monto: 0,
    cancelado: 0,
    total_filtrado: 0,
    total_eventos: filas.length,
  };

  for (const f of filas) {
    if (f.estado_pago === 'CANCELADO') {
      resumen.cancelado += 1;
      continue;
    }
    resumen.total_filtrado += f.monto;
    if (f.estado_pago === 'PAGADO') resumen.pagado += f.monto;
    else if (f.estado_pago === 'PENDIENTE_CONFIG') resumen.sin_monto += 1;
    else resumen.por_pagar += f.monto;
  }

  return resumen;
}

async function resolverOrigenBatch(
  eventos: EventoRow[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const consultaIds = new Set<string>();
  const consultaIdsQuery = new Set<string>();
  const cirugiaIds = new Set<string>();
  const conceptoIds = new Set<string>();

  for (const eh of eventos) {
    const key = `${eh.id}`;
    const snap = (eh.tarifa_snapshot || {}) as Record<string, unknown>;
    if (typeof snap.origen_nombre === 'string' && snap.origen_nombre) {
      map.set(key, snap.origen_nombre);
      continue;
    }
    if (eh.origen_tipo === 'OPERACION' && eh.origen_id) cirugiaIds.add(eh.origen_id);
    else if (eh.origen_tipo === 'CONSULTA' && eh.origen_id) {
      consultaIds.add(eh.origen_id);
      consultaIdsQuery.add(eh.origen_id);
    } else if (eh.origen_id) conceptoIds.add(eh.origen_id);
  }

  const supabase = getSupabaseAdmin();

  const asegIds = new Set<string>();
  const consultaToAseg = new Map<string, string | null>();
  const cirugiaRows: Array<{ id: string; origen_id: string | null; consulta_id: string | null }> = [];
  const cirugiaToAseg = new Map<string, string | null>();

  const cadenaAgenda = (async () => {
    if (cirugiaIds.size === 0) return;
    const { data } = await supabase
      .from('agenda_cirugias')
      .select('id, origen_id, consulta_id, codigo')
      .in('id', [...cirugiaIds]);
    for (const ac of data || []) {
      cirugiaRows.push(ac);
      if (ac.origen_id) asegIds.add(ac.origen_id);
      if (ac.consulta_id) consultaIds.add(ac.consulta_id);
    }
  })();

  const cadenaConsultas = (async () => {
    if (conceptoIds.size > 0) {
      const { data } = await supabase
        .from('consulta_conceptos')
        .select('id, consulta_id')
        .in('id', [...conceptoIds]);
      for (const c of data || []) {
        if (c.consulta_id) {
          consultaIds.add(c.consulta_id);
          consultaIdsQuery.add(c.consulta_id);
        }
      }
    }
    if (consultaIdsQuery.size > 0) {
      const { data } = await supabase
        .from('consultas')
        .select('id, aseguranza_id, paciente_id, folio')
        .in('id', [...consultaIdsQuery]);
      for (const c of data || []) {
        consultaToAseg.set(c.id, c.aseguranza_id ?? null);
        if (c.aseguranza_id) asegIds.add(c.aseguranza_id);
      }
    }
  })();

  await Promise.all([cadenaAgenda, cadenaConsultas]);

  const asegNames = new Map<string, string>();
  if (asegIds.size > 0) {
    const { data } = await supabase
      .from('aseguranzas')
      .select('id, nombre')
      .in('id', [...asegIds]);
    for (const a of data || []) asegNames.set(a.id, a.nombre);
  }

  for (const ac of cirugiaRows) {
    cirugiaToAseg.set(ac.id, ac.origen_id ?? null);
    if (ac.consulta_id) {
      const aseg = consultaToAseg.get(ac.consulta_id);
      if (!ac.origen_id && aseg) cirugiaToAseg.set(ac.id, aseg);
    }
  }

  const consultaIdDe = (eh: EventoRow): string | null => {
    if (eh.origen_tipo === 'CONSULTA') return eh.origen_id;
    return eh.origen_id && consultaIds.has(eh.origen_id) ? eh.origen_id : null;
  };

  // Fallback por concepto: antes 1 query por fila (N+1); ahora 1 sola query en lote.
  const pendientes: string[] = [];
  if (conceptoIds.size > 0) {
    const vistos = new Set<string>();
    for (const eh of eventos) {
      if (map.has(eh.id) || eh.origen_tipo === 'OPERACION') continue;
      const consultaId = consultaIdDe(eh);
      const asegId = consultaId ? consultaToAseg.get(consultaId) ?? null : null;
      if (!asegId && eh.origen_id && !vistos.has(eh.origen_id)) {
        vistos.add(eh.origen_id);
        pendientes.push(eh.origen_id);
      }
    }
  }
  const conceptoToConsulta = new Map<string, string>();
  if (pendientes.length > 0) {
    const { data } = await supabase
      .from('consulta_conceptos')
      .select('id, consulta_id')
      .in('id', pendientes);
    for (const c of data || []) {
      if (c.consulta_id) conceptoToConsulta.set(c.id, c.consulta_id);
    }
  }

  for (const eh of eventos) {
    const key = eh.id;
    if (map.has(key)) continue;
    let nombre: string | null = null;

    if (eh.origen_tipo === 'OPERACION' && eh.origen_id) {
      const asegId = cirugiaToAseg.get(eh.origen_id) ?? null;
      nombre = asegId ? asegNames.get(asegId) ?? null : null;
    } else {
      const consultaId = consultaIdDe(eh);
      let asegId = consultaId ? consultaToAseg.get(consultaId) ?? null : null;
      if (!asegId && conceptoIds.size > 0 && eh.origen_id) {
        const consultaDelConcepto = conceptoToConsulta.get(eh.origen_id);
        if (consultaDelConcepto) asegId = consultaToAseg.get(consultaDelConcepto) ?? null;
      }
      nombre = asegId ? asegNames.get(asegId) ?? null : null;
    }

    map.set(key, nombre);
  }

  return map;
}

export interface ListarLigaParams {
  desde?: string | null;
  hasta?: string | null;
  doctor_id?: string | null;
  page?: number;
  pageSize?: number;
  referencia?: string | null;
  soloDoctorId?: string | null;
  fuente?: string | null;
  estado?: string | null;
  agrupar_por?: TipoAgrupacionLiga | null;
}

function agruparFilas(
  filas: HonorarioLigaFila[],
  modo: TipoAgrupacionLiga
): HonorarioAgrupadoFila[] {
  const map = new Map<string, HonorarioAgrupadoFila>();
  for (const f of filas) {
    const label =
      modo === 'dia' ? f.fecha : modo === 'doctor' ? f.doctor_nombre : f.fuente || 'OTRO';
    const row =
      map.get(label) || { label, eventos: 0, monto: 0, pagado: 0, por_pagar: 0 };
    row.eventos += 1;
    row.monto += f.monto;
    if (f.estado_pago === 'PAGADO') row.pagado += f.monto;
    else if (f.estado_pago !== 'CANCELADO') row.por_pagar += f.monto;
    map.set(label, row);
  }
  const rows = [...map.values()];
  rows.sort((a, b) => (modo === 'dia' ? a.label.localeCompare(b.label) : b.monto - a.monto));
  return rows;
}

export async function listarHonorariosLiga(
  params: ListarLigaParams = {}
): Promise<HonorariosListado> {
  const supabase = getSupabaseAdmin();
  const periodoP = leerTipoPeriodo();

  let desde: string;
  let hasta: string;

  if (params.referencia) {
    const rango = getPeriodRange(params.referencia, await periodoP);
    desde = rango.inicio;
    hasta = rango.fin;
  } else {
    const rango = rangoPersonalizado(params.desde, params.hasta);
    desde = rango.desde;
    hasta = rango.hasta;
  }

  if (desde > hasta) {
    throw new Error('Rango de fechas inválido');
  }

  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(params.pageSize || 50)));

  let query = supabase
    .from('eventos_honorario')
    .select(
      'id, origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, estado, tarifa_snapshot, metricas_ligados'
    )
    .gte('fecha_servicio', desde)
    .lte('fecha_servicio', hasta)
    .not('estado', 'in', `(${ESTADOS_EXCLUIDOS.join(',')})`)
    .order('fecha_servicio', { ascending: true });

  const doctorFiltro = params.doctor_id || params.soloDoctorId || null;
  if (doctorFiltro) query = query.eq('doctor_id', doctorFiltro);

  // Consultas independientes que se resuelven en paralelo (eventos, doctores y
  // tipo de período) en lugar de en serie: 3 round-trips → 1.
  const doctoresQ = supabase
    .from('doctores')
    .select('id, alias')
    .limit(500);

  const [eventosRes, doctoresRes, periodoTipo] = await Promise.all([
    query,
    doctoresQ,
    periodoP,
  ]);

  if (eventosRes.error) {
    throw new Error(`Error al listar honorarios: ${eventosRes.error.message}`);
  }

  const rows = (eventosRes.data || []) as EventoRow[];

  const nombres = new Map(
    (doctoresRes.data || []).map((d) => [d.id as string, d.alias as string])
  );

  const todas: HonorarioLigaFila[] = rows.map((eh) => {
    const monto = Number(eh.monto_devengado) || 0;
    const estadoDb = (eh.estado as EstadoDb) || 'DEVENGADO';
    const estadoPago = normalizarEstadoPago(estadoDb, monto);
    const metricas = (eh.metricas_ligados || {}) as HonorarioLigaFila['metricas_ligados'];
    const rangoFila = getPeriodRange(eh.fecha_servicio, periodoTipo);

    return {
      id: eh.id,
      fuente: eh.origen_tipo === 'OPERACION' ? 'CIRUGIA' : eh.origen_tipo,
      doctor_id: eh.doctor_id,
      doctor_nombre: nombres.get(eh.doctor_id) || '—',
      fecha: eh.fecha_servicio,
      monto,
      estado_pago: estadoPago,
      estado_db: estadoDb,
      origen: null,
      metricas_ligados: {
        estudios_ligados: metricas.estudios_ligados || 0,
        procedimientos_ligados: metricas.procedimientos_ligados || 0,
        cirugias_ligadas: metricas.cirugias_ligadas || 0,
      },
      periodo_inicio: rangoFila.inicio,
      periodo_fin: rangoFila.fin,
    };
  });

  todas.sort(ordenarFilas);

  const filtradas = todas.filter((f) => {
    if (params.fuente && f.fuente !== params.fuente) return false;
    if (params.estado && f.estado_pago !== params.estado) return false;
    return true;
  });

  const resumen = calcularResumen(filtradas);
  const agrupado = params.agrupar_por ? agruparFilas(filtradas, params.agrupar_por) : undefined;
  const from = (page - 1) * pageSize;
  const items = filtradas.slice(from, from + pageSize);

  // `origen` solo se muestra en las filas visibles: se resuelve para la página
  // (pageSize filas) en vez de para todo el rango (round-trips proporcionales al total).
  const rawPorId = new Map(rows.map((r) => [r.id, r]));
  const rawPagina: EventoRow[] = [];
  for (const fila of items) {
    const raw = rawPorId.get(fila.id);
    if (raw) rawPagina.push(raw);
  }
  const origenPagina = await resolverOrigenBatch(rawPagina);
  for (const fila of items) fila.origen = origenPagina.get(fila.id) ?? null;

  return {
    items,
    total: filtradas.length,
    page,
    pageSize,
    resumen,
    periodo_tipo: periodoTipo as TipoPeriodoPago,
    rango: { desde, hasta },
    agrupado,
  };
}

export async function editarMontoHonorario(
  id: string,
  montoRaw: unknown
): Promise<HonorarioLigaFila> {
  const monto = parseMontoManual(montoRaw);
  if (monto === null) {
    throw Object.assign(new Error('Monto inválido'), { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: evento, error } = await supabase
    .from('eventos_honorario')
    .select('id, estado, monto_devengado')
    .eq('id', id)
    .maybeSingle();

  if (error || !evento) {
    throw Object.assign(new Error('Honorario no encontrado'), { status: 404 });
  }
  if (evento.estado === 'PAGADO' || evento.estado === 'CANCELADO') {
    throw Object.assign(
      new Error('No se puede editar un honorario pagado o cancelado'),
      { status: 409 }
    );
  }

  const { error: upd } = await supabase
    .from('eventos_honorario')
    .update({ monto_devengado: monto })
    .eq('id', id);

  if (upd) {
    throw Object.assign(new Error('Error al actualizar monto'), { status: 500 });
  }

  await supabase.from('bitacora_honorarios').insert({
    tabla: 'eventos_honorario',
    registro_id: id,
    accion: 'MONTO',
    valor_anterior: { monto_devengado: Number(evento.monto_devengado) || 0 },
    valor_nuevo: { monto_devengado: monto },
  });

  const { data: actualizado, error: errLeer } = await supabase
    .from('eventos_honorario')
    .select(
      'id, origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, estado, tarifa_snapshot, metricas_ligados'
    )
    .eq('id', id)
    .maybeSingle();

  if (errLeer || !actualizado) {
    throw Object.assign(new Error('Honorario no encontrado tras actualizar'), {
      status: 404,
    });
  }

  const { data: doctor } = await supabase
    .from('doctores')
    .select('alias')
    .eq('id', actualizado.doctor_id)
    .maybeSingle();

  const periodoTipoActual = await leerTipoPeriodo();
  const rangoFila = getPeriodRange(actualizado.fecha_servicio, periodoTipoActual);
  const origenBatch = await resolverOrigenBatch([actualizado as EventoRow]);
  const montoNuevo = Number(actualizado.monto_devengado) || 0;
  const metricas = (actualizado.metricas_ligados || {}) as HonorarioLigaFila['metricas_ligados'];

  return {
    id: actualizado.id,
    fuente: actualizado.origen_tipo === 'OPERACION' ? 'CIRUGIA' : actualizado.origen_tipo,
    doctor_id: actualizado.doctor_id,
    doctor_nombre: doctor?.alias || '—',
    fecha: actualizado.fecha_servicio,
    monto: montoNuevo,
    estado_pago: normalizarEstadoPago(actualizado.estado, montoNuevo),
    estado_db: actualizado.estado,
    origen: origenBatch.get(actualizado.id) ?? null,
    metricas_ligados: {
      estudios_ligados: metricas.estudios_ligados || 0,
      procedimientos_ligados: metricas.procedimientos_ligados || 0,
      cirugias_ligadas: metricas.cirugias_ligadas || 0,
    },
    periodo_inicio: rangoFila.inicio,
    periodo_fin: rangoFila.fin,
  };
}

export async function pagarHonorarios(
  ids: string[],
  pagadoPor: string
): Promise<{ pagados: number; omitidos: Array<{ id: string; motivo: string }> }> {
  if (!ids.length) {
    throw Object.assign(new Error('Ids vacíos'), { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: eventos, error } = await supabase
    .from('eventos_honorario')
    .select('id, estado, monto_devengado')
    .in('id', ids);

  if (error) {
    throw Object.assign(new Error('Error al leer honorarios'), { status: 500 });
  }

  const omitidos: Array<{ id: string; motivo: string }> = [];
  const aPagar: string[] = [];
  const fechaPago = hoyTijuana();

  for (const e of eventos || []) {
    const monto = Number(e.monto_devengado) || 0;
    if (e.estado === 'PAGADO') {
      omitidos.push({ id: e.id, motivo: 'ya_pagado' });
      continue;
    }
    if (e.estado === 'CANCELADO' || e.estado === 'REVERSADO') {
      omitidos.push({ id: e.id, motivo: 'cancelado' });
      continue;
    }
    if (!montoValidoParaPago(monto)) {
      omitidos.push({ id: e.id, motivo: 'monto_cero' });
      continue;
    }
    aPagar.push(e.id);
  }

  const idsNoEncontrados = ids.filter(
    (id) => !(eventos || []).some((e) => e.id === id)
  );
  for (const id of idsNoEncontrados) {
    omitidos.push({ id, motivo: 'no_encontrado' });
  }

  let pagados = 0;
  if (aPagar.length > 0) {
    const { error: upd } = await supabase
      .from('eventos_honorario')
      .update({
        estado: 'PAGADO',
        fecha_pago: fechaPago,
        pagado_por: pagadoPor,
      })
      .in('id', aPagar);

    if (upd) {
      throw Object.assign(new Error('Error al pagar honorarios'), { status: 500 });
    }

    pagados = aPagar.length;

    for (const id of aPagar) {
      await supabase.from('bitacora_honorarios').insert({
        tabla: 'eventos_honorario',
        registro_id: id,
        accion: 'PAGO',
        valor_anterior: { estado: 'DEVENGADO' },
        valor_nuevo: { estado: 'PAGADO', fecha_pago: fechaPago },
        usuario_id: pagadoPor,
      });
    }
  }

  return { pagados, omitidos };
}

export async function panelDoctorHonorarios(
  doctorId: string,
  referencia?: string | null,
  page = 1,
  pageSize = 10,
  rango?: { desde?: string | null; hasta?: string | null }
): Promise<HonorariosListado> {
  const supabase = getSupabaseAdmin();
  const conRango = !!(rango?.desde && rango?.hasta);
  // El guard del doctor y la consulta de la liga corren en paralelo: si el doctor
  // no existe se descarta la liga (caso raro) y se ahorra 1 round-trip en el camino normal.
  const doctorP = supabase.from('doctores').select('id').eq('id', doctorId).maybeSingle();
  const ligaP = listarHonorariosLiga({
    soloDoctorId: doctorId,
    ...(conRango
      ? { desde: rango?.desde as string, hasta: rango?.hasta as string }
      : { referencia: referencia || hoyTijuana() }),
    page,
    pageSize,
  });

  const { data: doctor } = await doctorP;

  if (!doctor) {
    void ligaP.catch(() => undefined);
    throw Object.assign(new Error('Doctor no encontrado'), { status: 404 });
  }

  return ligaP;
}

export function esTipoPagoValido(v: unknown): v is TipoPeriodo {
  return esTipoPeriodo(v);
}
