import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { translateError } from '@/lib/supabase/errors';
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

const lenteBaseSchema = z.object({
  manufacturer: z.string().min(1).max(255),
  product_name: z.string().max(255).optional().nullable(),
  model: z.string().min(1).max(255),
  sphere: z.number().min(-999.99).max(999.99).optional().nullable(),
  cylinder: z.number().min(-999.99).max(999.99).optional().nullable(),
  add_intermediate: z.number().min(0).max(20).optional().nullable(),
  add_near: z.number().min(0).max(20).optional().nullable(),
  nozzle: z.string().max(10).optional().nullable(),
  serial_number: z.string().max(100).optional().nullable(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  barcode_format: z.string().max(20).optional().nullable(),
  stock: z.number().int().min(0).optional(),
  stock_minimo: z.number().int().min(0).optional(),
  precio_compra: z.number().min(0).max(99999999.99).optional().nullable(),
  precio_venta: z.number().min(0).max(99999999.99).optional().nullable(),
  lote: z.string().max(100).optional().nullable(),
  notas: z.string().optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
  proveedor_id: z.string().uuid().optional().nullable(),
}).strict();

const lenteCreateSchema = lenteBaseSchema;

const lenteUpdateSchema = z.object({
  id: z.string().uuid(),
}).merge(lenteBaseSchema.partial()).strict();

function mapLente(l: any) {
  return {
    id: l.id,
    manufacturer: l.manufacturer,
    product_name: l.product_name,
    model: l.model,
    sphere: l.sphere,
    cylinder: l.cylinder,
    add_intermediate: l.add_intermediate,
    add_near: l.add_near,
    nozzle: l.nozzle,
    serial_number: l.serial_number,
    expiration_date: l.expiration_date,
    barcode: l.barcode,
    barcode_format: l.barcode_format,
    stock: l.stock,
    stock_minimo: l.stock_minimo,
    precio_compra: l.precio_compra,
    precio_venta: l.precio_venta,
    lote: l.lote,
    notas: l.notas,
    categoria: (l.categorias_lentes as any)?.nombre || '',
    proveedor: (l.proveedores as any)?.nombre || '',
    categoria_id: l.categoria_id,
    proveedor_id: l.proveedor_id,
    created_at: l.created_at,
  };
}

const SELECT = '*, categorias_lentes:categoria_id (nombre), proveedores:proveedor_id (nombre)';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get('barcode');
  const itemId = searchParams.get('id');

  if (itemId) {
    const { data, error } = await supabase
      .from('inventario_items')
      .select(SELECT)
      .eq('id', itemId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }
    return NextResponse.json(mapLente(data));
  }

  if (barcode) {
    const { data, error } = await supabase
      .from('inventario_items')
      .select(SELECT)
      .eq('codigo_barras', barcode)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'No se encontro el ítem con ese codigo de barras' }, { status: 404 });
    }
    return NextResponse.json(mapLente(data));
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('inventario_items')
    .select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ data: data.map(mapLente), total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Alta de ítem: también el doctor (solo inventario). PATCH/DELETE siguen
  // restringidos a admin/recepcionista.
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = lenteCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const year = new Date().getFullYear().toString().slice(-2);
  const { count } = await supabase
    .from('inventario_items')
    .select('id', { count: 'exact', head: true });
  const seq = ((count || 0) + 1).toString().padStart(5, '0');
  const folio = `LEN-${year}-${seq}`;

  const insert: Record<string, any> = {
    folio,
    manufacturer: data.manufacturer,
    product_name: data.product_name ?? null,
    model: data.model,
    sphere: data.sphere ?? null,
    cylinder: data.cylinder ?? null,
    add_intermediate: data.add_intermediate ?? null,
    add_near: data.add_near ?? null,
    nozzle: data.nozzle ?? null,
    serial_number: data.serial_number ?? null,
    expiration_date: data.expiration_date ?? null,
    barcode: data.barcode ?? null,
    barcode_format: data.barcode_format ?? null,
    stock: data.stock ?? 0,
    stock_minimo: data.stock_minimo ?? 5,
    precio_compra: data.precio_compra ?? null,
    precio_venta: data.precio_venta ?? null,
    lote: data.lote ?? null,
    notas: data.notas ?? null,
    categoria_id: data.categoria_id ?? null,
    proveedor_id: data.proveedor_id ?? null,
  };

  const { data: lente, error } = await supabase
    .from('inventario_items')
    .insert(insert)
    .select(SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  return NextResponse.json(mapLente(lente), { status: 201 });
}

export async function PATCH(request: Request) {
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

  const validation = lenteUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const { id, ...updates } = data;

  const cleanUpdates: Record<string, any> = {};
  const allowed = [
    'manufacturer', 'product_name', 'model', 'sphere', 'cylinder',
    'add_intermediate', 'add_near', 'nozzle', 'serial_number',
    'expiration_date', 'barcode', 'barcode_format',
    // PATCH permite: 'manufacturer', 'product_name', 'model', 'sphere', 'cylinder', 'add_intermediate', 'add_near', 'nozzle', 'serial_number', 'expiration_date', 'barcode', 'barcode_format'
    'stock', 'stock_minimo', 'precio_compra',
    'precio_venta', 'lote', 'notas',
    'categoria_id', 'proveedor_id',
  ];
  for (const key of allowed) {
    if (updates[key as keyof typeof updates] !== undefined) {
      cleanUpdates[key] = updates[key as keyof typeof updates];
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }

  // Fetch current stock before update if stock is changing
  let stockAnterior: number | null = null;
  if (cleanUpdates.stock !== undefined) {
    const { data: current } = await supabase
      .from('inventario_items')
      .select('stock')
      .eq('id', id)
      .single();
    stockAnterior = current?.stock ?? null;
  }

  const { data: lente, error } = await supabase
    .from('inventario_items')
    .update(cleanUpdates)
    .eq('id', id)
    .select(SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  // Register Kardex movement if stock changed
  if (stockAnterior !== null && cleanUpdates.stock !== undefined && cleanUpdates.stock !== stockAnterior) {
    const diff = cleanUpdates.stock - stockAnterior;
    const tipo = diff > 0 ? 'ENTRADA' : 'SALIDA';
    await supabase.from('inventario_movimientos').insert({
      inventario_item_id: id,
      tipo,
      cantidad: Math.abs(diff),
      stock_resultante: cleanUpdates.stock,
      usuario_id: auth.user.id,
      referencia_tipo: 'AJUSTE_MANUAL',
      motivo: `Ajuste manual de stock: ${stockAnterior} → ${cleanUpdates.stock}`,
    });
  }

  // Notify if stock is at or below minimum
  if (cleanUpdates.stock !== undefined && lente.stock_minimo && lente.stock <= lente.stock_minimo) {
    const { data: admins } = await supabase
      .from('usuarios')
      .select('id')
      .eq('rol', 'admin')
      .eq('activo', true);

    if (admins && admins.length > 0) {
      await supabase.from('notificaciones').insert(
        admins.map((admin) => ({
          user_id: admin.id,
          tipo: 'warning',
          titulo: 'Stock bajo',
          mensaje: `Stock mínimo alcanzado — ${lente.marca} ${lente.modelo} (Stock: ${lente.stock})`,
          entidad_tipo: 'inventario_item',
          entidad_id: lente.id,
        }))
      );
    }
  }

  return NextResponse.json(mapLente(lente));
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID es obligatorio' }, { status: 400 });
  }

  const { error } = await supabase.from('inventario_items').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
