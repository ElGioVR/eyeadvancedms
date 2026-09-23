import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { resolveDoctorId, isModoFocus } from '@/lib/auth-helpers';
import { notificarCancelacion, notificarReagendado } from '@/services/notificaciones';
import { z } from 'zod';

const consultaUpdateSchema = z.object({
  estatus: z.enum(['BORRADOR', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'FINALIZADA']).optional(),
  estatus_pago: z.enum(['PENDIENTE_PAGO', 'PAGADO']).optional(),
  costo_total: z.number().min(0).optional(),
  monto_pagado: z.number().min(0).optional(),
  fecha_pago: z.string().optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  notas: z.string().optional().nullable(),
  metodo_pago: z.string().optional().nullable(),
  // Full edit fields
  doctor_id: z.string().uuid().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  tipo_consulta: z.string().optional().nullable(),
  tipo_visita: z.string().optional().nullable(),
  procedimiento: z.string().optional().nullable(),
  procedimiento_doctor_id: z.string().uuid().optional().nullable(),
  estudio_1: z.string().optional().nullable(),
  estudio_2: z.string().optional().nullable(),
  estudio_3: z.string().optional().nullable(),
  estudio_1_doctor_id: z.string().uuid().optional().nullable(),
  estudio_2_doctor_id: z.string().uuid().optional().nullable(),
  estudio_3_doctor_id: z.string().uuid().optional().nullable(),
}).strict();

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: consulta, error: consultaError } = await supabase
    .from('consultas')
    .select(`
      id, folio, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita, diagnostico, estudio_1, estudio_2, estudio_3, estudio_1_doctor_id, estudio_2_doctor_id, estudio_3_doctor_id, procedimiento, procedimiento_doctor_id, notas, estatus, estatus_pago, costo_total, monto_pagado, fecha_pago, metodo_pago, moneda, aseguranza_id, created_at, updated_at,
      pacientes:paciente_id (nombre_completo, fecha_nacimiento, telefono, sexo, email, numero_poliza, numero_afiliacion),
      doctores:doctor_id (nombre_completo),
      est1_doc:estudio_1_doctor_id (nombre_completo),
      est2_doc:estudio_2_doctor_id (nombre_completo),
      est3_doc:estudio_3_doctor_id (nombre_completo),
      proc_doc:procedimiento_doctor_id (nombre_completo)
    `)
    .eq('id', id)
    .maybeSingle();

  if (consultaError || !consulta) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 });
  }

  // RBAC: doctor solo ve sus propias consultas
  const userRole = (await supabase.from('usuarios').select('rol').eq('id', auth.user.id).maybeSingle()).data?.rol;
  if (userRole === 'doctor') {
    const doctorId = await resolveDoctorId(auth.user.id);
    const focus = await isModoFocus(auth.user.id);
    if (consulta.doctor_id !== doctorId && !(focus && doctorId)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  const [historialResult, conceptosResult, aseguranzaResult, coberturaResult] = await Promise.all([
    supabase
      .from('consulta_historial')
      .select('id, consulta_id, tipo_evento, usuario_id, payload, created_at')
      .eq('consulta_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('consulta_conceptos')
      .select('id, consulta_id, tipo_concepto, concepto_id, texto_original, precio_aplicado, doctor_id, created_at')
      .eq('consulta_id', id),
    consulta.aseguranza_id
      ? supabase.from('aseguranzas').select('id, nombre, telefono, direccion, notas, activo, created_at').eq('id', consulta.aseguranza_id).maybeSingle()
      : Promise.resolve({ data: null }),
    consulta.aseguranza_id
      ? supabase.from('coberturas_aseguranza').select('id, porcentaje_cobertura, monto_maximo, aplica_estudios, aplica_procedimientos').eq('aseguranza_id', consulta.aseguranza_id).eq('activo', true).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let historial = historialResult.data ?? [];
  const historialUserIds = [...new Set(historial.map((h: any) => h.usuario_id).filter(Boolean))];
  if (historialUserIds.length > 0) {
    const { data: historialUsuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', historialUserIds);
    const hUserMap = new Map((historialUsuarios || []).map((u: any) => [u.id, u.nombre]));
    historial = historial.map((h: any) => ({
      ...h,
      usuario_nombre: h.usuario_id ? hUserMap.get(h.usuario_id) || null : null,
    }));
  }

  interface PacienteJoin { nombre_completo: string; fecha_nacimiento: string | null; telefono: string | null; sexo: string | null; email: string | null; numero_poliza: string | null; numero_afiliacion: string | null }
  interface DoctorJoin { nombre_completo: string }

  const pacienteData = (consulta as Record<string, unknown>).pacientes as PacienteJoin | undefined;
  const doctorData = (consulta as Record<string, unknown>).doctores as DoctorJoin | undefined;
  const est1Doc = (consulta as Record<string, unknown>).est1_doc as DoctorJoin | undefined;
  const est2Doc = (consulta as Record<string, unknown>).est2_doc as DoctorJoin | undefined;
  const est3Doc = (consulta as Record<string, unknown>).est3_doc as DoctorJoin | undefined;
  const procDoc = (consulta as Record<string, unknown>).proc_doc as DoctorJoin | undefined;

  return NextResponse.json({
    consulta: {
      ...consulta,
      paciente: pacienteData?.nombre_completo || null,
      iniciales: (pacienteData?.nombre_completo || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase(),
      doctor: doctorData?.nombre_completo || null,
      est1_doctor: est1Doc?.nombre_completo || null,
      est2_doctor: est2Doc?.nombre_completo || null,
      est3_doctor: est3Doc?.nombre_completo || null,
      proc_doctor: procDoc?.nombre_completo || null,
      paciente_sexo: pacienteData?.sexo || null,
      paciente_telefono: pacienteData?.telefono || null,
      paciente_fecha_nacimiento: pacienteData?.fecha_nacimiento || null,
      paciente_email: pacienteData?.email || null,
      paciente_poliza: pacienteData?.numero_poliza || null,
      paciente_afiliacion: pacienteData?.numero_afiliacion || null,
    },
    historial,
    conceptos: conceptosResult.data ?? [],
    aseguranza: aseguranzaResult.data ?? null,
    cobertura: coberturaResult.data ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = consultaUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const { data: existing, error: checkError } = await supabase
    .from('consultas')
    .select('id, estatus, estatus_pago')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (data.costo_total !== undefined) updateData.costo_total = data.costo_total;
  if (data.monto_pagado !== undefined) updateData.monto_pagado = data.monto_pagado;
  if (data.fecha_pago !== undefined) updateData.fecha_pago = data.fecha_pago;
  if (data.diagnostico !== undefined) updateData.diagnostico = data.diagnostico;
  if (data.notas !== undefined) updateData.notas = data.notas;
  if (data.metodo_pago !== undefined) updateData.metodo_pago = data.metodo_pago;
  if (data.doctor_id !== undefined) updateData.doctor_id = data.doctor_id;
  if (data.fecha !== undefined) updateData.fecha = data.fecha;
  if (data.hora_inicio !== undefined) updateData.hora_inicio = data.hora_inicio;
  if (data.hora_fin !== undefined) updateData.hora_fin = data.hora_fin;
  if (data.tipo_consulta !== undefined) updateData.tipo_consulta = data.tipo_consulta;
  if (data.tipo_visita !== undefined) updateData.tipo_visita = data.tipo_visita;
  if (data.procedimiento !== undefined) updateData.procedimiento = data.procedimiento;
  if (data.procedimiento_doctor_id !== undefined) updateData.procedimiento_doctor_id = data.procedimiento_doctor_id;
  if (data.estudio_1 !== undefined) updateData.estudio_1 = data.estudio_1;
  if (data.estudio_2 !== undefined) updateData.estudio_2 = data.estudio_2;
  if (data.estudio_3 !== undefined) updateData.estudio_3 = data.estudio_3;
  if (data.estudio_1_doctor_id !== undefined) updateData.estudio_1_doctor_id = data.estudio_1_doctor_id;
  if (data.estudio_2_doctor_id !== undefined) updateData.estudio_2_doctor_id = data.estudio_2_doctor_id;
  if (data.estudio_3_doctor_id !== undefined) updateData.estudio_3_doctor_id = data.estudio_3_doctor_id;

  // Status transitions
  if (data.estatus !== undefined) {
    updateData.estatus = data.estatus;
    await registrarHistorial(supabase, id, 'CAMBIO_ESTATUS', auth.user.id, {
      de: existing.estatus,
      a: data.estatus,
    });

    // Get patient name for notifications
    const { data: consultaInfo } = await supabase
      .from('consultas')
      .select('doctor_id, pacientes:paciente_id(usuarios:usuario_id(id))')
      .eq('id', id)
      .maybeSingle();

    const pacienteNombre = ((consultaInfo as any)?.pacientes?.usuarios?.nombre_completo as string) || 'Paciente';
    const fecha = (await supabase.from('consultas').select('fecha').eq('id', id).maybeSingle()).data?.fecha || '';
  }

  if (data.estatus_pago !== undefined) {
    updateData.estatus_pago = data.estatus_pago;
    if (data.estatus_pago === 'PAGADO') {
      updateData.fecha_pago = new Date().toISOString();
      await registrarHistorial(supabase, id, 'PAGADO', auth.user.id, {
        monto: data.monto_pagado,
      });
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 });
  }

  // If any editable field changed (not just status), log as EDICION
  const hasFieldChanges = [data.diagnostico, data.notas, data.metodo_pago, data.doctor_id,
    data.fecha, data.hora_inicio, data.hora_fin, data.tipo_consulta, data.tipo_visita,
    data.procedimiento, data.procedimiento_doctor_id,
    data.estudio_1, data.estudio_2, data.estudio_3,
    data.estudio_1_doctor_id, data.estudio_2_doctor_id, data.estudio_3_doctor_id,
  ].some(v => v !== undefined);

  if (hasFieldChanges && !data.estatus) {
    await registrarHistorial(supabase, id, 'EDICION', auth.user.id, {
      campos_modificados: Object.keys(updateData).filter(k => !['estatus', 'estatus_pago', 'costo_total', 'monto_pagado', 'fecha_pago'].includes(k)),
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from('consultas')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Error al actualizar la consulta' }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: existing, error: checkError } = await supabase
    .from('consultas')
    .select('id, estatus')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  await supabase
    .from('consultas')
    .update({ estatus: 'FINALIZADA' })
    .eq('id', id);

  await supabase.from('consulta_historial').insert({
    consulta_id: id,
    tipo_evento: 'CANCELACION',
    usuario_id: auth.user.id,
    payload: { estatus_anterior: existing.estatus },
  });

  return NextResponse.json({ ok: true });
}
