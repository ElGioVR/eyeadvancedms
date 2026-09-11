import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const consultaUpdateSchema = z.object({
  costo_total: z.number().min(0).optional(),
  estado_pago: z.enum(['PENDIENTE', 'PAGADO', 'CANCELADO']).optional(),
  monto_pagado: z.number().min(0).optional(),
  fecha_pago: z.string().optional().nullable(),
}).strict();

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
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (data.costo_total !== undefined) updateData.costo_total = data.costo_total;
  if (data.estado_pago !== undefined) updateData.estado_pago = data.estado_pago;
  if (data.monto_pagado !== undefined) updateData.monto_pagado = data.monto_pagado;
  if (data.fecha_pago !== undefined) updateData.fecha_pago = data.fecha_pago;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 });
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
