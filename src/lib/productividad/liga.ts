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
import { inEnLotes, leerTodo } from './lotes';

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

/**
 * Nombre de la aseguranza (origen) de cada evento, resuelto en lote.
 * 2 rondas máximo: agenda ‖ (conceptos → consultas) ‖ catálogo de aseguranzas.
 * Antes: agenda ‖ consultas, luego aseguranzas y un 2º lookup de conceptos (4 rondas).
 */
async function resolverOrigenBatch(
  eventos: EventoRow[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const consultaIdsQuery = new Set<string>();
  const cirugiaIds = new Set<string>();
  const conceptoIds = new Set<string>();

  for (const eh of eventos) {
    const snap = (eh.tarifa_snapshot || {}) as Record<string, unknown>;
    if (typeof snap.origen_nombre === 'string' && snap.origen_nombre) {
      map.set(eh.id, snap.origen_nombre);
      continue;
    }
    if (eh.origen_tipo === 'OPERACION' && eh.origen_id) cirugiaIds.add(eh.origen_id);
    else if (eh.origen_tipo === 'CONSULTA' && eh.origen_id) consultaIdsQuery.add(eh.origen_id);
    else if (eh.origen_id) conceptoIds.add(eh.origen_id);
  }

  if (map.size === eventos.length) return map;

  const supabase = getSupabaseAdmin();
  const consultaToAseg = new Map<string, string | null>();
  const conceptoToConsulta = new Map<string, string>();
  const cirugiaToAseg = new Map<string, string | null>();
  const asegNames = new Map<string, string>();

  const cadenaAgenda = (async () => {
    if (cirugiaIds.size === 0) return;
    const { data } = await supabase
      .from('agenda_cirugias')
      .select('id, origen_id, consulta_id')
      .in('id', [...cirugiaIds]);
    for (const ac of data || []) cirugiaToAseg.set(ac.id, ac.origen_id ?? null);
  })();

  const cadenaConsultas = (async () => {
    if (conceptoIds.size > 0) {
      const { data } = await supabase
        .from('consulta_conceptos')
        .select('id, consulta_id')
        .in('id', [...conceptoIds]);
      for (const c of data || []) {
        if (c.consulta_id) {
          conceptoToConsulta.set(c.id, c.consulta_id);
          consultaIdsQuery.add(c.consulta_id);
        }
      }
    }
    if (consultaIdsQuery.size > 0) {
      const { data } = await supabase
        .from('consultas')
        .select('id, aseguranza_id')
        .in('id', [...consultaIdsQuery]);
      for (const c of data || []) consultaToAseg.set(c.id, c.aseguranza_id ?? null);
    }
  })();

  // Catálogo pequeño: se lee completo en paralelo en vez de esperar los ids.
  const cadenaAseg = (async () => {
    const { data } = await supabase.from('aseguranzas').select('id, nombre').limit(1000);
    for (const a of data || []) asegNames.set(a.id, a.nombre);
  })();

  await Promise.all([cadenaAgenda, cadenaConsultas, cadenaAseg]);

  for (const eh of eventos) {
    if (map.has(eh.id)) continue;
    let asegId: string | null = null;
    if (eh.origen_tipo === 'OPERACION' && eh.origen_id) {
      asegId = cirugiaToAseg.get(eh.origen_id) ?? null;
    } else if (eh.origen_tipo === 'CONSULTA' && eh.origen_id) {
      asegId = consultaToAseg.get(eh.origen_id) ?? null;
    } else if (eh.origen_id) {
      const consultaId = conceptoToConsulta.get(eh.origen_id);
      asegId = consultaId ? consultaToAseg.get(consultaId) ?? null : null;
    }
    map.set(eh.id, asegId ? asegNames.get(asegId) ?? null : null);
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

const TIPOS_PERIODO: TipoPeriodo[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL'];

/** Rango que contiene el periodo de `referencia` sea cual sea el tipo configurado. */
function rangoEnvolvente(referencia: string): { desde: string; hasta: string } {
  let desde = '';
  let hasta = '';
  for (const t of TIPOS_PERIODO) {
    const r = getPeriodRange(referencia, t);
    if (!desde || r.inicio < desde) desde = r.inicio;
    if (!hasta || r.fin > hasta) hasta = r.fin;
  }
  return { desde, hasta };
}

export async function listarHonorariosLiga(
  params: ListarLigaParams = {}
): Promise<HonorariosListado> {
  const supabase = getSupabaseAdmin();
  const periodoP = leerTipoPeriodo();

  // Con `referencia` el rango depende del tipo de periodo configurado. Para no
  // esperar esa lectura antes de pedir los eventos, se consulta un rango que
  // envuelve cualquier tipo y se recorta en memoria al llegar el tipo real.
  const rangoConsulta = params.referencia
    ? rangoEnvolvente(params.referencia)
    : rangoPersonalizado(params.desde, params.hasta);

  if (rangoConsulta.desde > rangoConsulta.hasta) {
    throw new Error('Rango de fechas inválido');
  }

  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(params.pageSize || 50)));
  const doctorFiltro = params.doctor_id || params.soloDoctorId || null;

  const eventosP = leerTodo<EventoRow>((a, b) => {
    let q = supabase
      .from('eventos_honorario')
      .select(
        'id, origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, estado, tarifa_snapshot, metricas_ligados'
      )
      .gte('fecha_servicio', rangoConsulta.desde)
      .lte('fecha_servicio', rangoConsulta.hasta)
      .not('estado', 'in', `(${ESTADOS_EXCLUIDOS.join(',')})`);
    if (doctorFiltro) q = q.eq('doctor_id', doctorFiltro);
    return q
      .order('fecha_servicio', { ascending: true })
      .order('id', { ascending: true })
      .range(a, b);
  });

  // Con doctor fijo solo hace falta su alias (no los 500 doctores).
  const doctoresQ = doctorFiltro
    ? supabase.from('doctores').select('id, alias').eq('id', doctorFiltro)
    : supabase.from('doctores').select('id, alias').limit(500);

  // eventos ‖ doctores ‖ tipo de periodo: 1 sola ronda.
  const [eventosTodos, doctoresRes, periodoTipo] = await Promise.all([
    eventosP.catch((err: Error) => {
      throw new Error(`Error al listar honorarios: ${err.message}`);
    }),
    doctoresQ,
    periodoP,
  ]);

  let desde = rangoConsulta.desde;
  let hasta = rangoConsulta.hasta;
  if (params.referencia) {
    const rango = getPeriodRange(params.referencia, periodoTipo);
    desde = rango.inicio;
    hasta = rango.fin;
  }
  const rows = params.referencia
    ? eventosTodos.filter((r) => r.fecha_servicio >= desde && r.fecha_servicio <= hasta)
    : eventosTodos;

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

  const periodoP = leerTipoPeriodo();

  // UPDATE condicionado al estado (evita editar un honorario que se pagó o
  // canceló entre la lectura y la escritura) y que devuelve la fila: se ahorra
  // la relectura posterior.
  const { data: actualizado, error: upd } = await supabase
    .from('eventos_honorario')
    .update({ monto_devengado: monto })
    .eq('id', id)
    .not('estado', 'in', '(PAGADO,CANCELADO)')
    .select(
      'id, origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, estado, tarifa_snapshot, metricas_ligados'
    )
    .maybeSingle();

  if (upd) {
    void periodoP.catch(() => undefined);
    throw Object.assign(new Error('Error al actualizar monto'), { status: 500 });
  }
  if (!actualizado) {
    void periodoP.catch(() => undefined);
    throw Object.assign(
      new Error('No se puede editar un honorario pagado o cancelado'),
      { status: 409 }
    );
  }

  const bitacoraP = supabase.from('bitacora_honorarios').insert({
    tabla: 'eventos_honorario',
    registro_id: id,
    accion: 'MONTO',
    valor_anterior: { monto_devengado: Number(evento.monto_devengado) || 0 },
    valor_nuevo: { monto_devengado: monto },
  });

  const [{ data: doctor }, periodoTipoActual, origenBatch] = await Promise.all([
    supabase.from('doctores').select('alias').eq('id', actualizado.doctor_id).maybeSingle(),
    periodoP,
    resolverOrigenBatch([actualizado as EventoRow]),
    bitacoraP,
  ]);
  const rangoFila = getPeriodRange(actualizado.fecha_servicio, periodoTipoActual);
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

export interface PagoRealizado {
  id: string;
  doctor_id: string;
  monto_devengado: number | string | null;
}

export async function pagarHonorarios(
  idsEntrada: string[],
  pagadoPor: string
): Promise<{
  pagados: number;
  omitidos: Array<{ id: string; motivo: string }>;
  /** Filas efectivamente marcadas como pagadas (para notificar sin releer). */
  detalle: PagoRealizado[];
}> {
  const ids = [...new Set(idsEntrada)];
  if (!ids.length) {
    throw Object.assign(new Error('Ids vacíos'), { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Por lotes: cientos de uuids en un solo `.in()` exceden el largo de URL.
  let eventos: Array<{ id: string; estado: string; monto_devengado: number | string | null }>;
  try {
    eventos = await inEnLotes<{ id: string; estado: string; monto_devengado: number | string | null }>(ids, (l) =>
      supabase.from('eventos_honorario').select('id, estado, monto_devengado').in('id', l)
    );
  } catch {
    throw Object.assign(new Error('Error al leer honorarios'), { status: 500 });
  }

  const omitidos: Array<{ id: string; motivo: string }> = [];
  let aPagar: string[] = [];
  const fechaPago = hoyTijuana();

  for (const e of eventos) {
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

  const encontrados = new Set(eventos.map((e) => e.id));
  const idsNoEncontrados = ids.filter((id) => !encontrados.has(id));
  for (const id of idsNoEncontrados) {
    omitidos.push({ id, motivo: 'no_encontrado' });
  }

  let pagados = 0;
  let detalle: PagoRealizado[] = [];
  if (aPagar.length > 0) {
    // Condicionado al estado y al monto: si otro admin pagó/canceló/editó a 0
    // entre la lectura y este UPDATE, esa fila no se toca (antes se volvía a
    // pagar y se duplicaba la bitácora).
    // Lotes en serie: si uno falla, los ya aplicados se conservan y se registran
    // en la bitácora; los del lote fallido se reportan como omitidos 'error'.
    const actualizados: PagoRealizado[] = [];
    const fallidos = new Set<string>();
    for (let i = 0; i < aPagar.length; i += 150) {
      const lote = aPagar.slice(i, i + 150);
      const { data: filas, error } = await supabase
        .from('eventos_honorario')
        .update({
          estado: 'PAGADO',
          fecha_pago: fechaPago,
          pagado_por: pagadoPor,
        })
        .in('id', lote)
        .not('estado', 'in', '(PAGADO,CANCELADO,REVERSADO)')
        .gt('monto_devengado', 0)
        .select('id, doctor_id, monto_devengado');
      if (error) {
        console.error('[honorarios.pagar] lote fallido', { message: error.message, code: error.code });
        for (const id of lote) fallidos.add(id);
        continue;
      }
      actualizados.push(...((filas ?? []) as PagoRealizado[]));
    }
    if (actualizados.length === 0 && fallidos.size > 0) {
      throw Object.assign(new Error('Error al pagar honorarios'), { status: 500 });
    }
    for (const id of fallidos) omitidos.push({ id, motivo: 'error' });
    aPagar = aPagar.filter((id) => !fallidos.has(id));

    detalle = actualizados;
    const pagadosIds = new Set(detalle.map((e) => e.id));
    for (const id of aPagar) {
      if (!pagadosIds.has(id)) omitidos.push({ id, motivo: 'ya_pagado' });
    }
    aPagar = aPagar.filter((id) => pagadosIds.has(id));
    pagados = aPagar.length;
    if (pagados === 0) return { pagados, omitidos, detalle };

    // Bitácora en un solo INSERT (antes 1 viaje por honorario pagado).
    await supabase.from('bitacora_honorarios').insert(
      aPagar.map((id) => ({
        tabla: 'eventos_honorario',
        registro_id: id,
        accion: 'PAGO',
        valor_anterior: { estado: 'DEVENGADO' },
        valor_nuevo: { estado: 'PAGADO', fecha_pago: fechaPago },
        usuario_id: pagadoPor,
      }))
    );
  }

  return { pagados, omitidos, detalle };
}

export async function panelDoctorHonorarios(
  doctorId: string,
  referencia?: string | null,
  page = 1,
  pageSize = 10,
  rango?: { desde?: string | null; hasta?: string | null },
  opciones?: { doctorVerificado?: boolean }
): Promise<HonorariosListado> {
  const supabase = getSupabaseAdmin();
  const conRango = !!(rango?.desde && rango?.hasta);
  const ligaP = listarHonorariosLiga({
    soloDoctorId: doctorId,
    ...(conRango
      ? { desde: rango?.desde as string, hasta: rango?.hasta as string }
      : { referencia: referencia || hoyTijuana() }),
    page,
    pageSize,
  });

  // Quien ya resolvió el doctor (p. ej. /mis-honorarios) se ahorra el guard.
  if (opciones?.doctorVerificado) return ligaP;

  // El guard del doctor y la liga corren en paralelo: si el doctor no existe se
  // descarta la liga (caso raro) y se ahorra 1 round-trip en el camino normal.
  const { data: doctor } = await supabase.from('doctores').select('id').eq('id', doctorId).maybeSingle();

  if (!doctor) {
    void ligaP.catch(() => undefined);
    throw Object.assign(new Error('Doctor no encontrado'), { status: 404 });
  }

  return ligaP;
}

export function esTipoPagoValido(v: unknown): v is TipoPeriodo {
  return esTipoPeriodo(v);
}
