import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const cobroUpdateSchema = z.object({
  pagado: z.boolean().optional(),
  notas: z.string().optional().nullable(),
  metodo_pago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NO_APLICA']).optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = cobroUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const { data: existing, error: checkError } = await supabase
    .from('cobros')
    .select('id, pagado')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'El cobro no existe' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (data.pagado !== undefined) {
    updateData.pagado = data.pagado;
    if (data.pagado && !existing.pagado) {
      updateData.fecha_pago = new Date().toISOString();
    }
  }
  if (data.notas !== undefined) updateData.notas = data.notas;
  if (data.metodo_pago !== undefined) updateData.metodo_pago = data.metodo_pago;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('cobros')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Error al actualizar el cobro' }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: existing, error: checkError } = await supabase
    .from('cobros')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'El cobro no existe' }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from('cobros')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: 'Error al eliminar el cobro' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
