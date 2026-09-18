import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
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
