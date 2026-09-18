import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { translateError } from '@/lib/supabase/errors';
import { z } from 'zod';

const movimientoCreateSchema = z.object({
  inventario_item_id: z.string().uuid(),
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION', 'SALIDA_CIRUGIA']),
  cantidad: z.number().int().min(1),
  motivo: z.string().max(500).optional().nullable(),
  costo_unitario: z.number().min(0).max(99999999.99).optional().nullable(),
  proveedor_id: z.string().uuid().optional().nullable(),
  referencia_tipo: z.enum(['CONSULTA', 'CIRUGIA', 'COMPRA', 'AJUSTE_MANUAL']).optional().nullable(),
  referencia_id: z.string().uuid().optional().nullable(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('item_id');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('inventario_movimientos')
    .select(`
      *,
      inventario_items:inventario_item_id (marca, modelo, folio),
      usuarios:usuario_id (nombre_completo)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (itemId) {
    query = query.eq('inventario_item_id', itemId);
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: translateError(error.message) || 'Error interno del servidor' }, { status: 500 });
  }

  const result = (data || []).map((m) => ({
    id: m.id,
    inventario_item_id: m.inventario_item_id,
    item_nombre: `${(m as any).inventario_items?.marca || ''} ${(m as any).inventario_items?.modelo || ''}`.trim(),
    item_folio: (m as any).inventario_items?.folio || '',
    tipo: m.tipo,
    cantidad: m.cantidad,
    stock_resultante: m.stock_resultante,
    usuario: (m as any).usuarios?.nombre_completo || '',
    referencia_tipo: m.referencia_tipo,
    referencia_id: m.referencia_id,
    motivo: m.motivo,
    costo_unitario: m.costo_unitario,
    proveedor_id: m.proveedor_id,
    created_at: m.created_at,
  }));

  return NextResponse.json({ data: result, total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = movimientoCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const { data: item, error: itemError } = await supabase
    .from('inventario_items')
    .select('id, stock')
    .eq('id', data.inventario_item_id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'Ítem de inventario no encontrado' }, { status: 404 });
  }

  let newStock = item.stock;
  if (data.tipo === 'ENTRADA' || data.tipo === 'DEVOLUCION') {
    newStock = item.stock + data.cantidad;
  } else if (data.tipo === 'SALIDA' || data.tipo === 'SALIDA_CIRUGIA') {
    if (item.stock < data.cantidad) {
      return NextResponse.json({ error: `Stock insuficiente. Disponible: ${item.stock}` }, { status: 400 });
    }
    newStock = item.stock - data.cantidad;
  } else if (data.tipo === 'AJUSTE') {
    newStock = item.stock + data.cantidad;
  }

  const { data: movimiento, error: movError } = await supabase
    .from('inventario_movimientos')
    .insert({
      inventario_item_id: data.inventario_item_id,
      tipo: data.tipo,
      cantidad: data.cantidad,
      stock_resultante: newStock,
      usuario_id: auth.user.id,
      referencia_tipo: data.referencia_tipo ?? null,
      referencia_id: data.referencia_id ?? null,
      motivo: data.motivo ?? null,
      costo_unitario: data.costo_unitario ?? null,
      proveedor_id: data.proveedor_id ?? null,
    })
    .select()
    .single();

  if (movError) {
    return NextResponse.json({ error: translateError(movError.message) || 'Error al registrar movimiento' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('inventario_items')
    .update({ stock: newStock })
    .eq('id', data.inventario_item_id);

  if (updateError) {
    console.error('Error actualizando stock:', updateError.message);
  }

  return NextResponse.json(movimiento, { status: 201 });
}
