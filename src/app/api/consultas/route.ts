import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { resolveDoctorId, isModoFocus } from '@/lib/auth-helpers';
import { errorTranslations } from '@/lib/supabase/errors';
import { MotorDevengoService } from '@/services/honorarios';
import { notificarCancelacion, notificarReagendado, notificarAsignacionServicio } from '@/services/notificaciones';
import { z } from 'zod';

async function crearNotificacion(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  tipo: 'info' | 'warning' | 'error',
  titulo: string,
  mensaje: string,
  entidadTipo?: string,
  entidadId?: string,
) {
  await supabase.from('notificaciones').insert({
    user_id: userId,
    tipo,
    titulo,
    mensaje,
    entidad_tipo: entidadTipo ?? null,
    entidad_id: entidadId ?? null,
  });
}

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

const estudioConDoctorSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nombre: z.string().max(255),
  doctor_id: z.string().uuid().optional().nullable(),
});

const procedimientoConDoctorSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nombre: z.string().max(255),
  doctor_id: z.string().uuid().optional().nullable(),
  motivo: z.string().max(500).optional().nullable(),
});

const consultaCreateSchema = z.object({
  paciente_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  tipo_consulta: z.string().optional().nullable(),
  tipo_visita: z.string().optional().nullable(),
  aseguranza_id: z.string().uuid().optional().nullable(),
  consulta_servicio_id: z.string().uuid().optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  estudios: z.array(z.union([z.string().max(255), estudioConDoctorSchema])).max(3).optional().nullable(),
  procedimiento: z.string().optional().nullable(),
  procedimientos: z.array(procedimientoConDoctorSchema).optional().nullable(),
  procedimiento_doctor_id: z.string().uuid().optional().nullable(),
  notas: z.string().optional().nullable(),
  costo: z.union([z.string(), z.number()]).optional().nullable(),
  metodo_pago: z.string().optional().nullable(),
  moneda: z.string().optional().nullable(),
  pago_inmediato: z.boolean().optional().nullable(),
  doctor_costos: z.array(z.object({
    doctor_id: z.string().uuid(),
    tipo_costo: z.enum(['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO']),
    monto: z.number().min(0),
    descripcion: z.string().optional().nullable(),
  })).optional().nullable(),
}).strict();

function defaultHoraFin(horaInicio: string): string {
  const [h, m, s] = horaInicio.split(':').map(Number);
  const totalMin = h * 60 + m + 30;
  const nh = Math.floor(totalMin / 60) % 24;
  const nm = totalMin % 60;
  return s !== undefined
    ? `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}:00`
    : `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

async function registrarHistorial(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  consultaId: string,
  tipoEvento: string,
  userId: string,
  payload?: Record<string, unknown>,
) {
  await supabase.from('consulta_historial').insert({
    consulta_id: consultaId,
    tipo_evento: tipoEvento,
    usuario_id: userId,
    payload: payload ?? {},
  });
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('consultas')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      doctores:doctor_id (nombre_completo),
      est1_doc:estudio_1_doctor_id (nombre_completo),
      est2_doc:estudio_2_doctor_id (nombre_completo),
      est3_doc:estudio_3_doctor_id (nombre_completo),
      proc_doc:procedimiento_doctor_id (nombre_completo)
    `, { count: 'exact' });

  // Filtros opcionales
  const pacienteId = searchParams.get('paciente_id');
  const tipo = searchParams.get('tipo');

  if (pacienteId) {
    query = query.eq('paciente_id', pacienteId);
  }
  if (tipo) {
    query = query.eq('tipo_consulta', tipo);
  }

  // RBAC: doctor solo ve sus consultas; doctor_jefe con modo_focus también
  const profileRes = await supabase.from('usuarios').select('rol, preferencias').eq('id', auth.user.id).maybeSingle();
  const userRole = profileRes.data?.rol;
  const doctorId = await resolveDoctorId(auth.user.id);
  const focus = await isModoFocus(auth.user.id);

  if (userRole === 'doctor' || (userRole === 'admin' && focus && doctorId)) {
    query = query.eq('doctor_id', doctorId);
  }

  const { data, error, count } = await query
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  const result = data.map((c) => {
    const nombrePaciente = (c.pacientes as any)?.nombre_completo || '';
    const nombreDoctor = (c.doctores as any)?.nombre_completo || '';
    const iniciales = nombrePaciente
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const estudiosDetalle = [
      c.estudio_1 ? { nombre: c.estudio_1, doctor: (c as any).est1_doc?.nombre_completo || null } : null,
      c.estudio_2 ? { nombre: c.estudio_2, doctor: (c as any).est2_doc?.nombre_completo || null } : null,
      c.estudio_3 ? { nombre: c.estudio_3, doctor: (c as any).est3_doc?.nombre_completo || null } : null,
    ].filter(Boolean);

    return {
      id: c.id,
      folio: c.folio || null,
      paciente_id: c.paciente_id,
      paciente: nombrePaciente,
      iniciales,
      doctor_id: c.doctor_id,
      doctor: nombreDoctor,
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      diagnostico: c.diagnostico,
      estudios: c.estudios,
      estudios_detalle: estudiosDetalle,
      procedimiento: c.procedimiento,
      procedimiento_doctor: (c as any).proc_doc?.nombre_completo || null,
      notas: c.notas,
      estatus: c.estatus || 'BORRADOR',
      estatus_pago: (c as any).estatus_pago || 'PENDIENTE_PAGO',
      costo_total: c.costo_total || 0,
      monto_pagado: c.monto_pagado || 0,
      aseguranza_id: (c as any).aseguranza_id || null,
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

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Strip null values → undefined so Zod optional fields work
  const clean = JSON.parse(JSON.stringify(body), (_key, value) =>
    value === null ? undefined : value
  );

  const validation = consultaCreateSchema.safeParse(clean);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  // IDOR-10: Verify referenced entities exist before insert
  const [pacienteCheck, doctorCheck] = await Promise.all([
    supabase.from('pacientes').select('id').eq('id', data.paciente_id).maybeSingle(),
    supabase.from('doctores').select('id, activo').eq('id', data.doctor_id).maybeSingle(),
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

  const tipoConsulta = tipoConsultaMap[data.tipo_consulta || ''] || data.tipo_consulta || 'CONSULTA';
  const tipoVisita = tipoVisitaMap[data.tipo_visita || ''] || data.tipo_visita || 'PRIMERA_VEZ';

  // Generate folio: CON-YY-NNNNN
  const year = new Date().getFullYear().toString().slice(-2);
  const { count } = await supabase
    .from('consultas')
    .select('id', { count: 'exact', head: true });
  const seq = ((count || 0) + 1).toString().padStart(5, '0');
  const folio = `CON-${year}-${seq}`;

  // Parse estudios - support both string and {id, nombre, doctor_id} formats
  const parseEstudio = (e: string | { id?: string | null; nombre: string; doctor_id?: string | null }) => {
    if (typeof e === 'string') return { id: null, nombre: e, doctor_id: null };
    return { id: 'id' in e ? e.id || null : null, nombre: e.nombre, doctor_id: e.doctor_id || null };
  };
  const est0 = data.estudios?.[0] ? parseEstudio(data.estudios[0]) : null;
  const est1 = data.estudios?.[1] ? parseEstudio(data.estudios[1]) : null;
  const est2 = data.estudios?.[2] ? parseEstudio(data.estudios[2]) : null;
  const procedimientos = data.procedimientos?.length
    ? data.procedimientos
    : data.procedimiento
      ? [{ id: null, nombre: data.procedimiento, doctor_id: data.procedimiento_doctor_id || null, motivo: null }]
      : [];

  // Resolve selected origin and server-side prices
  const { data: pacienteInfo } = await supabase
    .from('pacientes')
    .select('aseguranza_id')
    .eq('id', data.paciente_id)
    .maybeSingle();
  const aseguranzaId = data.aseguranza_id || pacienteInfo?.aseguranza_id || null;

  if (aseguranzaId) {
    const { data: aseguranzaCheck } = await supabase
      .from('aseguranzas')
      .select('id, activo')
      .eq('id', aseguranzaId)
      .maybeSingle();

    if (!aseguranzaCheck) {
      return NextResponse.json({ error: 'El origen seleccionado no existe' }, { status: 404 });
    }
    if (!aseguranzaCheck.activo) {
      return NextResponse.json({ error: 'El origen seleccionado no está activo' }, { status: 400 });
    }
  }

  async function resolverServicio(
    tipo: 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO',
    servicioId?: string | null,
    nombre?: string | null,
  ): Promise<{ id: string | null; nombre: string | null; costo: number; cobertura: number }> {
    if (!aseguranzaId) return { id: servicioId || null, nombre: nombre || null, costo: 0, cobertura: 0 };

    let query = supabase
      .from('aseguranza_servicios')
      .select('id, nombre, costo, porcentaje_cobertura')
      .eq('aseguranza_id', aseguranzaId)
      .eq('activo', true)
      .eq('tipo', tipo);

    if (servicioId) query = query.eq('id', servicioId);
    else if (nombre) query = query.ilike('nombre', nombre);
    else return { id: null, nombre: null, costo: 0, cobertura: 0 };

    const { data: svc } = await query.maybeSingle();
    return {
      id: svc?.id || servicioId || null,
      nombre: svc?.nombre || nombre || null,
      costo: svc?.costo || 0,
      cobertura: svc?.porcentaje_cobertura || 0,
    };
  }

  // 1. Create consulta
  const horaFin = data.hora_fin || defaultHoraFin(data.hora_inicio);

  const { data: consultaData, error: consultaError } = await supabase
    .from('consultas')
    .insert({
      folio,
      paciente_id: data.paciente_id,
      doctor_id: data.doctor_id,
      fecha: data.fecha,
      hora_inicio: data.hora_inicio,
      hora_fin: horaFin,
      tipo_consulta: tipoConsulta,
      tipo_visita: tipoVisita,
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
      estatus: 'BORRADOR',
      estatus_pago: 'PENDIENTE_PAGO',
      aseguranza_id: aseguranzaId,
    })
    .select()
    .single();

  if (consultaError) {
    return NextResponse.json(
      { error: errorTranslations[consultaError.message] || 'Error interno del servidor' },
      { status: 500 }
    );
  }

  // 2. Create clinical concepts from selected origin services
  const conceptosRows: Array<{
    consulta_id: string;
    doctor_id: string;
    tipo_concepto: 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO';
    concepto_id: string | null;
    texto_original: string | null;
    precio_aplicado: number;
  }> = [];

  const servicioConsulta = await resolverServicio('CONSULTA', data.consulta_servicio_id || null, data.tipo_consulta || 'Consulta');
  if (servicioConsulta.nombre || servicioConsulta.id) {
    conceptosRows.push({
      consulta_id: consultaData.id,
      doctor_id: data.doctor_id,
      tipo_concepto: 'CONSULTA',
      concepto_id: servicioConsulta.id,
      texto_original: servicioConsulta.nombre || data.tipo_consulta || 'Consulta',
      precio_aplicado: servicioConsulta.costo,
    });
  }

  for (const estudio of [est0, est1, est2].filter(Boolean)) {
    const servicio = await resolverServicio('ESTUDIO', estudio?.id || null, estudio?.nombre || null);
    conceptosRows.push({
      consulta_id: consultaData.id,
      doctor_id: estudio?.doctor_id || data.doctor_id,
      tipo_concepto: 'ESTUDIO',
      concepto_id: servicio.id,
      texto_original: servicio.nombre || estudio?.nombre || null,
      precio_aplicado: servicio.costo,
    });
  }

  for (const procedimiento of procedimientos) {
    const servicio = await resolverServicio('PROCEDIMIENTO', procedimiento.id || null, procedimiento.nombre || null);
    conceptosRows.push({
      consulta_id: consultaData.id,
      doctor_id: procedimiento.doctor_id || data.doctor_id,
      tipo_concepto: 'PROCEDIMIENTO',
      concepto_id: servicio.id,
      texto_original: servicio.nombre || procedimiento.nombre || null,
      precio_aplicado: servicio.costo,
    });
  }

  if (conceptosRows.length > 0) {
    const { error: conceptosError } = await supabase
      .from('consulta_conceptos')
      .insert(conceptosRows);

    if (conceptosError) {
      await supabase.from('consultas').delete().eq('id', consultaData.id);
      return NextResponse.json(
        { error: errorTranslations[conceptosError.message] || 'Error al registrar los servicios de la consulta' },
        { status: 500 }
      );
    }
  }

  // 3. Create doctor cost distribution if provided
  if (data.doctor_costos && data.doctor_costos.length > 0) {
    const rows = data.doctor_costos.map((dc) => ({
      consulta_id: consultaData.id,
      doctor_id: dc.doctor_id,
      tipo_costo: dc.tipo_costo,
      monto: dc.monto,
      descripcion: dc.descripcion || null,
    }));

    const { error: doctorCostoError } = await supabase
      .from('consulta_doctor_costo')
      .insert(rows);

    if (doctorCostoError) {
      console.error('Error al insertar costos de doctor:', doctorCostoError);
    }
  }

  // 4. Calculate total cost from server-side resolved prices
  let costoTotal = conceptosRows.reduce((sum, concepto) => sum + concepto.precio_aplicado, 0);
  // Fallback: if no server prices, use client cost (legacy mode)
  if (costoTotal === 0 && data.costo) {
    costoTotal = typeof data.costo === 'string' ? parseFloat(data.costo) || 0 : (data.costo || 0);
  }

  // 5. Determine payment status
  const pagoInmediato = data.pago_inmediato ?? false;
  const estatusPago = pagoInmediato ? 'PAGADO' : (costoTotal > 0 ? 'PENDIENTE_PAGO' : 'PAGADO');

  // 6. Update consulta with cost and payment status
  if (costoTotal > 0 || pagoInmediato) {
    await supabase
      .from('consultas')
      .update({
        costo_total: costoTotal,
        estatus_pago: estatusPago,
        estatus: pagoInmediato ? 'COMPLETADA' : 'PROCESADA',
        monto_pagado: pagoInmediato ? costoTotal : 0,
        fecha_pago: pagoInmediato ? new Date().toISOString() : null,
      })
      .eq('id', consultaData.id);
  } else {
    // No cost: mark as PROCESADA
    await supabase
      .from('consultas')
      .update({ estatus: 'PROCESADA' })
      .eq('id', consultaData.id);
  }

  // Register historial event
  await registrarHistorial(supabase, consultaData.id, 'CREACION', auth.user.id, { motivo: 'Creación de consulta' });
  if (pagoInmediato) {
    await registrarHistorial(supabase, consultaData.id, 'PAGADO', auth.user.id, { monto: costoTotal });
  }

  // 7. Generate honorarios automatically (devengo) — respects devengo_automatico config
  try {
    const { data: honorariosConfig } = await supabase
      .from('configuracion_sistema')
      .select('valor')
      .eq('clave', 'honorarios')
      .maybeSingle();

    const configValor = (honorariosConfig?.valor as Record<string, unknown>) || {};
    const devengoAutomatico = configValor.devengo_automatico !== false;

    if (devengoAutomatico) {
      const motorDevengo = new MotorDevengoService();
      await motorDevengo.generarDesdeConsulta(consultaData.id);
    }
  } catch (err) {
    console.error('Error al generar honorarios:', err);
  }

  // 8. Generate notification for the doctor
  if (consultaData.doctor_id) {
    const nombrePaciente = pacienteCheck.data
      ? (await supabase.from('pacientes').select('nombre_completo').eq('id', data.paciente_id).maybeSingle())?.data?.nombre_completo ?? 'un paciente'
      : 'un paciente';

    await crearNotificacion(
      supabase,
      consultaData.doctor_id,
      'info',
      'Nueva consulta asignada',
      `Consulta ${folio} registrada para ${nombrePaciente} el ${data.fecha}`,
      'consulta',
      consultaData.id,
    );
  }

  return NextResponse.json(consultaData, { status: 201 });
}
