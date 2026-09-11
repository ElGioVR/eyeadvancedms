import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const cobroUpdateSchema = z.object({
  pagado: z.boolean().optional(),
  notas: z.string().optional().nullable(),
  metodo_pago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NO_APLICA']).optional(),
  estado: z.enum(['PENDIENTE', 'PAGADO', 'CANCELADO']).optional(),
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
    .select('id, pagado, consulta_id')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'El cobro no existe' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  // Handle estado field
  if (data.estado !== undefined) {
    updateData.estado = data.estado;
    if (data.estado === 'PAGADO') {
      updateData.pagado = true;
      updateData.fecha_pago = new Date().toISOString();
    } else if (data.estado === 'CANCELADO') {
      updateData.pagado = false;
      updateData.fecha_pago = null;

      // Restore lens stock on cancelation
      if (existing.consulta_id) {
        const { data: lentesAsignados } = await supabase
          .from('lentes_x_consulta')
          .select('lente_id, cantidad')
          .eq('consulta_id', existing.consulta_id);

        if (lentesAsignados && lentesAsignados.length > 0) {
          for (const lx of lentesAsignados) {
            const { data: lente } = await supabase
              .from('lentes')
              .select('stock')
              .eq('id', lx.lente_id)
              .maybeSingle();

            if (lente) {
              await supabase
                .from('lentes')
                .update({
                  stock: lente.stock + lx.cantidad,
                  estado: 'DISPONIBLE',
                })
                .eq('id', lx.lente_id);
            }
          }

          // Remove lens assignments
          await supabase
            .from('lentes_x_consulta')
            .delete()
            .eq('consulta_id', existing.consulta_id);
        }
      }
    } else if (data.estado === 'PENDIENTE') {
      updateData.pagado = false;
      updateData.fecha_pago = null;
    }
  } else {
    // Legacy pagado field support
    if (data.pagado !== undefined) {
      updateData.pagado = data.pagado;
      if (data.pagado && !existing.pagado) {
        updateData.fecha_pago = new Date().toISOString();
      }
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
    .select('id, consulta_id')
    .eq('id', id)
    .maybeSingle();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'El cobro no existe' }, { status: 404 });
  }

  // Restore lens stock on deletion
  if (existing.consulta_id) {
    const { data: lentesAsignados } = await supabase
      .from('lentes_x_consulta')
      .select('lente_id, cantidad')
      .eq('consulta_id', existing.consulta_id);

    if (lentesAsignados && lentesAsignados.length > 0) {
      for (const lx of lentesAsignados) {
        const { data: lente } = await supabase
          .from('lentes')
          .select('stock')
          .eq('id', lx.lente_id)
          .maybeSingle();

        if (lente) {
          await supabase
            .from('lentes')
            .update({
              stock: lente.stock + lx.cantidad,
              estado: 'DISPONIBLE',
            })
            .eq('id', lx.lente_id);
        }
      }

      // Remove lens assignments
      await supabase
        .from('lentes_x_consulta')
        .delete()
        .eq('consulta_id', existing.consulta_id);
    }
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
