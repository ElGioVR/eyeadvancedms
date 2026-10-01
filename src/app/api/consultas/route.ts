import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { fechaISO, horaHHMM, leerJSON, leerQuery, uuid } from '@/lib/api/validar';
import {
  doctorDelListado,
  esColisionFolio,
  inicialesDe,
  siguienteFolioConsulta,
} from '@/lib/consultas-acceso';
import { MotorDevengoService } from '@/services/productividad';
import { detectarConflictosAgenda, esEmpalmeAgenda, MENSAJE_EMPALME } from '@/lib/agenda-conflictos';
import { DURACION_CITA_MIN, duracionEntre, sumarMinutos } from '@/lib/agenda-slots';
import { notificarAsignacion } from '@/services/notificaciones';
import { z } from 'zod';

const tipoConsultaMap: Record<string, string> = {
  'Primera Consulta': 'CONSULTA',
  'Consulta de Urgencia': 'CONSULTA',
  'Revisión Pre-Operatoria': 'REVISION',
  'Control Post-Operatorio': 'REVISION',
  'Consulta': 'CONSULTA',
  'Estudio': 'ESTUDIO',
  'Revisión': 'REVISION',
  'Procedimiento': 'PROCEDIMIENTO',
};

const tipoVisitaMap: Record<string, string> = {
  'Visita de Retorno': 'SUBSECUENTE',
  'Primera Vez': 'PRIMERA_VEZ',
  'PRIMERA_VEZ': 'PRIMERA_VEZ',
  'SUBSECUENTE': 'SUBSECUENTE',
};

const metodoPagoMap: Record<string, string> = {
  'Efectivo': 'EFECTIVO',
  'Tarjeta de Crédito': 'TARJETA',
  'Tarjeta de Débito': 'TARJETA',
  'Transferencia': 'TRANSFERENCIA',
  'Seguro': 'SEGURO',
  'No aplica': 'NO_APLICA',
};

const ojoSchema = z.enum(['OD', 'OI', 'OU']);

const estudioConDoctorSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nombre: z.string().max(255),
  doctor_id: z.string().uuid().optional().nullable(),
  cantidad: z.number().int().min(1).max(99).optional().nullable(),
  ojo: ojoSchema.optional().nullable(),
}).strict();

const procedimientoConDoctorSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nombre: z.string().max(255),
  doctor_id: z.string().uuid().optional().nullable(),
  motivo: z.string().max(500).optional().nullable(),
  cantidad: z.number().int().min(1).max(99).optional().nullable(),
  ojo: ojoSchema.optional().nullable(),
}).strict();

const consultaCreateSchema = z.object({
  paciente_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  fecha: fechaISO,
  hora_inicio: horaHHMM,
  hora_fin: horaHHMM.optional().nullable(),
  tipo_consulta: z.string().max(60).optional().nullable(),
  tipo_visita: z.string().max(60).optional().nullable(),
  especialidad_id: z.string().uuid().optional().nullable(),
  aseguranza_id: z.string().uuid().optional().nullable(),
  consulta_servicio_id: z.string().uuid().optional().nullable(),
  consulta_origen_id: z.string().uuid().optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  estudios: z.array(z.union([z.string().max(255), estudioConDoctorSchema])).max(3).optional().nullable(),
  procedimiento: z.string().max(2000).optional().nullable(),
  procedimientos: z.array(procedimientoConDoctorSchema).max(20).optional().nullable(),
  procedimiento_doctor_id: z.string().uuid().optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  costo: z.union([z.string().max(20), z.number().min(0).max(10_000_000)]).optional().nullable(),
  metodo_pago: z.string().max(50).optional().nullable(),
  moneda: z.string().max(20).optional().nullable(),
  pago_inmediato: z.boolean().optional().nullable(),
  doctor_costos: z.array(z.object({
    doctor_id: z.string().uuid(),
    tipo_costo: z.enum(['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO']),
    monto: z.number().min(0).max(10_000_000),
    descripcion: z.string().max(500).optional().nullable(),
  }).strict()).max(20).optional().nullable(),
}).strict();

/** Quita los null (→ undefined) para que los campos opcionales de Zod funcionen. */
function quitarNulos(valor: unknown): unknown {
  return JSON.parse(JSON.stringify(valor), (_key, v) => (v === null ? undefined : v));
}

const consultaCreateSinNulos = z.preprocess(quitarNulos, consultaCreateSchema);

const ESTATUS_CONSULTA = ['BORRADOR', 'AGENDADA', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'APLAZADA', 'REAGENDADA', 'COMPLETADA', 'CANCELADA', 'FINALIZADA'] as const;

/** pageSize se recorta a [1, 100] como antes (p. ej. el detalle pide 200 → 100). */
const listadoQuerySchema = z.object({
  page: z.coerce.number().int().catch(1).default(1).transform((n) => Math.min(100_000, Math.max(1, n))),
  pageSize: z.coerce.number().int().catch(15).default(15).transform((n) => Math.min(100, Math.max(1, n))),
  paciente_id: uuid.optional(),
  doctor_id: uuid.optional(),
  tipo: z.string().max(40).regex(/^[A-Z_]+$/, 'Tipo no válido').optional(),
  estatus: z.enum(ESTATUS_CONSULTA).optional(),
  fecha_desde: fechaISO.optional(),
  fecha_hasta: fechaISO.optional(),
}).refine((q) => !q.fecha_desde || !q.fecha_hasta || q.fecha_desde <= q.fecha_hasta, {
  message: 'El rango de fechas no es válido',
});

function defaultHoraFin(horaInicio: string): string {
  // Intervalo estándar de agenda: 1 paciente cada DURACION_CITA_MIN (15 min).
  return sumarMinutos(horaInicio, DURACION_CITA_MIN, horaInicio.split(':').length === 3);
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const filtros = leerQuery(request, listadoQuerySchema);
  if (filtros instanceof NextResponse) return filtros;
  const { page, pageSize } = filtros;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // RBAC: doctor solo ve sus consultas; doctor_jefe (admin) con modo_focus también.
  // Rol y preferencias vienen de auth.perfil (sin volver a leer `usuarios`).
  const doctorForzado = await doctorDelListado(auth.user.id, auth.perfil);
  if (doctorForzado === null) {
    // Doctor sin registro en `doctores`: no tiene consultas propias.
    return NextResponse.json({ data: [], total: 0, page, pageSize });
  }
  if (doctorForzado && filtros.doctor_id && filtros.doctor_id !== doctorForzado) {
    return NextResponse.json({ data: [], total: 0, page, pageSize });
  }

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('consultas')
    .select(`
      id, folio, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita,
      diagnostico, estudio_1, estudio_2, estudio_3, procedimiento, notas, estatus, estatus_pago,
      costo_total, monto_pagado, aseguranza_id, created_at,
      pacientes:paciente_id (nombre_completo),
      doctores:doctor_id (alias),
      est1_doc:estudio_1_doctor_id (alias),
      est2_doc:estudio_2_doctor_id (alias),
      est3_doc:estudio_3_doctor_id (alias),
      proc_doc:procedimiento_doctor_id (alias)
    `, { count: 'exact' });

  if (filtros.paciente_id) query = query.eq('paciente_id', filtros.paciente_id);
  if (filtros.tipo) query = query.eq('tipo_consulta', filtros.tipo);
  if (filtros.estatus) query = query.eq('estatus', filtros.estatus);
  if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
  if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
  const doctorFiltro = doctorForzado ?? filtros.doctor_id;
  if (doctorFiltro) query = query.eq('doctor_id', doctorFiltro);

  const { data, error, count } = await query
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'consultas.listar').mensaje }, { status: 500 });
  }

  type AliasJoin = { alias?: string | null } | null;
  const result = (data || []).map((fila) => {
    const c = fila as typeof fila & {
      pacientes: { nombre_completo?: string | null } | null;
      doctores: AliasJoin;
      est1_doc: AliasJoin;
      est2_doc: AliasJoin;
      est3_doc: AliasJoin;
      proc_doc: AliasJoin;
    };
    const nombrePaciente = c.pacientes?.nombre_completo || '';
    const nombreDoctor = c.doctores?.alias || '';

    const estudiosDetalle = [
      c.estudio_1 ? { nombre: c.estudio_1, doctor: c.est1_doc?.alias || null } : null,
      c.estudio_2 ? { nombre: c.estudio_2, doctor: c.est2_doc?.alias || null } : null,
      c.estudio_3 ? { nombre: c.estudio_3, doctor: c.est3_doc?.alias || null } : null,
    ].filter(Boolean);

    return {
      id: c.id,
      folio: c.folio || null,
      paciente_id: c.paciente_id,
      paciente: nombrePaciente,
      iniciales: inicialesDe(nombrePaciente),
      doctor_id: c.doctor_id,
      doctor: nombreDoctor,
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      diagnostico: c.diagnostico,
      // `consultas.estudios` no existe en el esquema: antes salía undefined (omitido en JSON)
      estudios: undefined,
      estudios_detalle: estudiosDetalle,
      procedimiento: c.procedimiento,
      procedimiento_doctor: c.proc_doc?.alias || null,
      notas: c.notas,
      estatus: c.estatus || 'BORRADOR',
      estatus_pago: c.estatus_pago || 'PENDIENTE_PAGO',
      costo_total: c.costo_total || 0,
      monto_pagado: c.monto_pagado || 0,
      aseguranza_id: c.aseguranza_id || null,
      created_at: c.created_at,
    };
  });

  return NextResponse.json({ data: result, total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  // Nulls → undefined antes de validar (los campos opcionales de Zod no aceptan null en arrays anidados)
  const data = await leerJSON(request, consultaCreateSinNulos, { maxBytes: 100_000 });
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

  // ── Ronda 1 (paralelo): verificaciones y lecturas independientes ──────────
  // IDOR-10: el paciente, el doctor y la consulta de origen deben existir.
  // Empalmes: el mismo médico no puede tener dos citas que se traslapen (se consulta en paralelo).
  const horaFinPropuesta = data.hora_fin || defaultHoraFin(data.hora_inicio);
  const [pacienteCheck, doctorCheck, origenCheck, aseguranzaPedida, folioInicial, honorariosConfig, conflictos] = await Promise.all([
    supabase.from('pacientes').select('id, aseguranza_id, nombre_completo').eq('id', data.paciente_id).maybeSingle(),
    // Personal unificado (mig. 390): tipo y honorarios; sin esas columnas, como antes.
    (async () => {
      const r = await supabase.from('doctores').select('id, activo, tipo_personal, cobra_honorarios').eq('id', data.doctor_id).maybeSingle();
      if (!r.error) return r as { data: { id: string; activo: boolean; tipo_personal?: string; cobra_honorarios?: boolean } | null };
      return (await supabase.from('doctores').select('id, activo').eq('id', data.doctor_id).maybeSingle()) as {
        data: { id: string; activo: boolean; tipo_personal?: string; cobra_honorarios?: boolean } | null;
      };
    })(),
    data.consulta_origen_id
      ? supabase.from('consultas').select('id').eq('id', data.consulta_origen_id).maybeSingle()
      : Promise.resolve({ data: { id: null as string | null } }),
    data.aseguranza_id
      ? supabase.from('aseguranzas').select('id, activo').eq('id', data.aseguranza_id).maybeSingle()
      : Promise.resolve(null),
    siguienteFolioConsulta(),
    supabase.from('configuracion_sistema').select('valor').eq('clave', 'honorarios').maybeSingle(),
    detectarConflictosAgenda({
      fecha: data.fecha,
      hora: data.hora_inicio,
      duracion_min: duracionEntre(data.hora_inicio, horaFinPropuesta),
      medicos: [data.doctor_id],
    }),
  ]);

  if (!pacienteCheck.data) {
    return NextResponse.json({ error: 'El paciente referenciado no existe' }, { status: 404 });
  }
  if (!doctorCheck.data) {
    return NextResponse.json({ error: 'El doctor referenciado no existe' }, { status: 404 });
  }
  if (doctorCheck.data && !doctorCheck.data.activo) {
    return NextResponse.json({ error: 'El doctor seleccionado no está activo' }, { status: 400 });
  }
  if (doctorCheck.data?.tipo_personal === 'ENFERMERO') {
    const esEstudio = /ESTUDIO/i.test(data.tipo_consulta || '');
    if (!esEstudio || doctorCheck.data.cobra_honorarios === false) {
      return NextResponse.json(
        { error: 'Enfermería solo puede atender consultas de tipo Estudios y debe tener honorarios activos' },
        { status: 400 }
      );
    }
  }
  if (!origenCheck.data) {
    return NextResponse.json({ error: 'La consulta de origen referenciada no existe' }, { status: 404 });
  }
  if (conflictos.length > 0) {
    return NextResponse.json(
      { error: MENSAJE_EMPALME, conflictos },
      { status: 409 }
    );
  }

  const tipoConsulta = tipoConsultaMap[data.tipo_consulta || ''] || data.tipo_consulta || 'CONSULTA';
  const tipoVisita = tipoVisitaMap[data.tipo_visita || ''] || data.tipo_visita || 'PRIMERA_VEZ';

  // Parse estudios - support both string and {id, nombre, doctor_id} formats
  const parseEstudio = (e: string | { id?: string | null; nombre: string; doctor_id?: string | null; cantidad?: number | null; ojo?: 'OD' | 'OI' | 'OU' | null }) => {
    if (typeof e === 'string') return { id: null, nombre: e, doctor_id: null, cantidad: 1, ojo: null };
    return {
      id: 'id' in e ? e.id || null : null,
      nombre: e.nombre,
      doctor_id: e.doctor_id || null,
      cantidad: Math.max(1, Number(e.cantidad) || 1),
      ojo: e.ojo || null,
    };
  };
  const est0 = data.estudios?.[0] ? parseEstudio(data.estudios[0]) : null;
  const est1 = data.estudios?.[1] ? parseEstudio(data.estudios[1]) : null;
  const est2 = data.estudios?.[2] ? parseEstudio(data.estudios[2]) : null;
  const estudios = [est0, est1, est2].filter((e): e is NonNullable<typeof e> => !!e);
  const procedimientos = data.procedimientos?.length
    ? data.procedimientos
    : data.procedimiento
      ? [{ id: null, nombre: data.procedimiento, doctor_id: data.procedimiento_doctor_id || null, motivo: null, cantidad: 1, ojo: null }]
      : [];

  // Origen (aseguranza): el enviado o el del paciente
  const aseguranzaId = data.aseguranza_id || pacienteCheck.data.aseguranza_id || null;
  if (aseguranzaId) {
    const { data: aseguranzaCheck } = aseguranzaPedida
      ?? await supabase.from('aseguranzas').select('id, activo').eq('id', aseguranzaId).maybeSingle();

    if (!aseguranzaCheck) {
      return NextResponse.json({ error: 'El origen seleccionado no existe' }, { status: 404 });
    }
    if (!aseguranzaCheck.activo) {
      return NextResponse.json({ error: 'El origen seleccionado no está activo' }, { status: 400 });
    }
  }

  // Cache de resolución de servicios (evita N+1 cuando la consulta repite estudios)
  type ServicioResuelto = { id: string | null; nombre: string | null; costo: number; cobertura: number };
  const servicioCache = new Map<string, Promise<ServicioResuelto>>();

  function resolverServicio(
    tipo: 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO',
    servicioId?: string | null,
    nombre?: string | null,
  ): Promise<ServicioResuelto> {
    if (!aseguranzaId) return Promise.resolve({ id: servicioId || null, nombre: nombre || null, costo: 0, cobertura: 0 });

    const clave = `${tipo}|${servicioId || ''}|${nombre || ''}`;
    const cacheado = servicioCache.get(clave);
    if (cacheado) return cacheado;

    let query = supabase
      .from('aseguranza_servicios')
      .select('id, nombre, costo, porcentaje_cobertura')
      .eq('aseguranza_id', aseguranzaId)
      .eq('activo', true)
      .eq('tipo', tipo);

    if (servicioId) query = query.eq('id', servicioId);
    // Coincidencia exacta sin distinguir mayúsculas: se escapan comodines de ILIKE
    else if (nombre) query = query.ilike('nombre', nombre.replace(/[\\%_]/g, (c) => `\\${c}`));
    else return Promise.resolve({ id: null, nombre: null, costo: 0, cobertura: 0 });

    const promesa = Promise.resolve(query.limit(1).maybeSingle()).then(({ data: svc }) => ({
      id: svc?.id || servicioId || null,
      nombre: svc?.nombre || nombre || null,
      costo: Number(svc?.costo) || 0,
      cobertura: Number(svc?.porcentaje_cobertura) || 0,
    }));
    servicioCache.set(clave, promesa);
    return promesa;
  }

  // ── Ronda 2: precios del servidor (consulta + estudios + procedimientos en paralelo)
  const [servicioConsulta, serviciosEstudios, serviciosProcedimientos] = await Promise.all([
    resolverServicio('CONSULTA', data.consulta_servicio_id || null, data.tipo_consulta || 'Consulta'),
    Promise.all(estudios.map((estudio) => resolverServicio('ESTUDIO', estudio.id || null, estudio.nombre || null))),
    Promise.all(procedimientos.map((procedimiento) => resolverServicio('PROCEDIMIENTO', procedimiento.id || null, procedimiento.nombre || null))),
  ]);

  // Conceptos clínicos (consulta_id se asigna tras el insert)
  const conceptos: Array<{
    doctor_id: string;
    tipo_concepto: 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO';
    concepto_id: string | null;
    texto_original: string | null;
    precio_aplicado: number;
    cantidad: number;
    ojo: string | null;
  }> = [];

  if (servicioConsulta.nombre || servicioConsulta.id) {
    conceptos.push({
      doctor_id: data.doctor_id,
      tipo_concepto: 'CONSULTA',
      concepto_id: servicioConsulta.id,
      texto_original: servicioConsulta.nombre || data.tipo_consulta || 'Consulta',
      precio_aplicado: servicioConsulta.costo,
      cantidad: 1,
      ojo: null,
    });
  }

  estudios.forEach((estudio, i) => {
    const servicio = serviciosEstudios[i];
    conceptos.push({
      doctor_id: estudio.doctor_id || data.doctor_id,
      tipo_concepto: 'ESTUDIO',
      concepto_id: servicio.id,
      texto_original: servicio.nombre || estudio.nombre || null,
      precio_aplicado: servicio.costo,
      cantidad: estudio.cantidad ?? 1,
      ojo: estudio.ojo ?? null,
    });
  });

  procedimientos.forEach((procedimiento, i) => {
    const servicio = serviciosProcedimientos[i];
    conceptos.push({
      doctor_id: procedimiento.doctor_id || data.doctor_id,
      tipo_concepto: 'PROCEDIMIENTO',
      concepto_id: servicio.id,
      texto_original: servicio.nombre || procedimiento.nombre || null,
      precio_aplicado: servicio.costo,
      cantidad: Math.max(1, Number(procedimiento.cantidad) || 1),
      ojo: procedimiento.ojo || null,
    });
  });

  // Costo total con precios del servidor (unitario × cantidad)
  let costoTotal = conceptos.reduce(
    (sum, concepto) => sum + concepto.precio_aplicado * concepto.cantidad,
    0
  );
  // Fallback: if no server prices, use client cost (legacy mode)
  if (costoTotal === 0 && data.costo) {
    const costoCliente = typeof data.costo === 'string' ? parseFloat(data.costo) || 0 : (data.costo || 0);
    costoTotal = Number.isFinite(costoCliente) && costoCliente > 0 ? costoCliente : 0;
  }

  // Estatus de pago. Las consultas nacen AGENDADA (visibles como "Agendada" en agenda);
  // pasan a COMPLETADA manualmente desde el detalle cuando se atienden.
  // Antes se insertaba BORRADOR y luego un UPDATE fijaba costo/estatus: ahora va en el insert.
  const pagoInmediato = data.pago_inmediato ?? false;
  const estatusPago = pagoInmediato ? 'PAGADO' : (costoTotal > 0 ? 'PENDIENTE_PAGO' : 'PAGADO');
  const camposCosto: Record<string, unknown> = costoTotal > 0 || pagoInmediato
    ? {
        costo_total: costoTotal,
        estatus_pago: estatusPago,
        monto_pagado: pagoInmediato ? costoTotal : 0,
        fecha_pago: pagoInmediato ? new Date().toISOString() : null,
      }
    : { estatus_pago: 'PENDIENTE_PAGO' };

  const horaFin = horaFinPropuesta;
  const fila = {
    paciente_id: data.paciente_id,
    doctor_id: data.doctor_id,
    fecha: data.fecha,
    hora_inicio: data.hora_inicio,
    hora_fin: horaFin,
    tipo_consulta: tipoConsulta,
    tipo_visita: tipoVisita,
    // Punto II: especialidad elegida en la agenda (FK cat_especialidades; mig. 1800000000330).
    ...(data.especialidad_id ? { especialidad_id: data.especialidad_id } : {}),
    diagnostico: data.diagnostico?.trim() || null,
    estudio_1: est0?.nombre || null,
    estudio_2: est1?.nombre || null,
    estudio_3: est2?.nombre || null,
    estudio_1_doctor_id: est0?.doctor_id || null,
    estudio_2_doctor_id: est1?.doctor_id || null,
    estudio_3_doctor_id: est2?.doctor_id || null,
    procedimiento: data.procedimiento?.trim() || null,
    procedimiento_doctor_id: data.procedimiento_doctor_id || null,
    notas: data.notas?.trim() || null,
    metodo_pago: metodoPagoMap[data.metodo_pago || ''] || null,
    estatus: 'AGENDADA',
    aseguranza_id: aseguranzaId,
    consulta_origen_id: data.consulta_origen_id || null,
    ...camposCosto,
  };

  // ── Ronda 3: insert con folio CON-YY-NNNNN (reintenta si otro request tomó el mismo)
  let folio = folioInicial;
  let insertado = await supabase.from('consultas').insert({ ...fila, folio }).select().single();
  for (let intento = 1; intento <= 3 && esColisionFolio(insertado.error); intento++) {
    folio = await siguienteFolioConsulta(intento - 1);
    insertado = await supabase.from('consultas').insert({ ...fila, folio }).select().single();
  }
  const { data: consultaData, error: consultaError } = insertado;

  // Carrera cerrada en BD: otro request tomó el horario entre la verificación y el insert.
  if (esEmpalmeAgenda(consultaError)) {
    return NextResponse.json({ error: MENSAJE_EMPALME, conflictos: [] }, { status: 409 });
  }

  if (consultaError || !consultaData) {
    return NextResponse.json(
      { error: handleSupabaseError(consultaError, 'consultas.crear').mensaje },
      { status: 500 }
    );
  }

  // ── Ronda 4: conceptos clínicos (un solo insert); si falla se revierte la consulta
  const conceptosRows = conceptos.map((concepto) => ({ consulta_id: consultaData.id, ...concepto }));
  if (conceptosRows.length > 0) {
    const { error: conceptosError } = await supabase
      .from('consulta_conceptos')
      .insert(conceptosRows);

    if (conceptosError) {
      await supabase.from('consultas').delete().eq('id', consultaData.id);
      const { mensaje, traducido } = handleSupabaseError(conceptosError, 'consultas.crear.conceptos');
      return NextResponse.json(
        { error: traducido ? mensaje : 'Error al registrar los servicios de la consulta' },
        { status: 500 }
      );
    }
  }

  // ── Ronda 5 (paralelo): costos por doctor, historial, honorarios y notificación
  const eventosHistorial: Array<Record<string, unknown>> = [
    { consulta_id: consultaData.id, tipo_evento: 'CREACION', usuario_id: auth.user.id, payload: { motivo: 'Creación de consulta' } },
  ];
  if (pagoInmediato) {
    eventosHistorial.push({ consulta_id: consultaData.id, tipo_evento: 'PAGADO', usuario_id: auth.user.id, payload: { monto: costoTotal } });
  }

  const configValor = (honorariosConfig.data?.valor as Record<string, unknown>) || {};
  const devengoAutomatico = configValor.devengo_automatico !== false;

  await Promise.all([
    data.doctor_costos && data.doctor_costos.length > 0
      ? Promise.resolve(
          supabase.from('consulta_doctor_costo').insert(
            data.doctor_costos.map((dc) => ({
              consulta_id: consultaData.id,
              doctor_id: dc.doctor_id,
              tipo_costo: dc.tipo_costo,
              monto: dc.monto,
              descripcion: dc.descripcion || null,
            })),
          ),
        ).then(({ error }) => {
          if (error) handleSupabaseError(error, 'consultas.crear.doctor_costos');
        })
      : null,
    Promise.resolve(supabase.from('consulta_historial').insert(eventosHistorial)).then(({ error }) => {
      if (error) handleSupabaseError(error, 'consultas.crear.historial');
    }),
    // Honorarios automáticos (devengo) — respeta devengo_automatico
    devengoAutomatico
      ? new MotorDevengoService().generarDesdeConsulta(consultaData.id).catch((err) => {
          console.error('Error al generar honorarios:', err);
        })
      : null,
    // Notificación al doctor (best-effort)
    consultaData.doctor_id
      ? notificarAsignacion({
          doctorId: consultaData.doctor_id,
          tipoServicio: tipoConsulta === 'ESTUDIO' ? 'Estudio' : 'Consulta',
          paciente: `${pacienteCheck.data.nombre_completo ?? 'un paciente'} (${folio})`,
          fecha: data.fecha,
          hora: data.hora_inicio,
          entidadTipo: 'consulta',
          entidadId: consultaData.id,
          actorUserId: auth.user.id,
        }).catch(() => 0)
      : null,
  ]);

  return NextResponse.json(consultaData, { status: 201 });
}
