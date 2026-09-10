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
  marca: z.string().min(1).max(255),
  modelo: z.string().min(1).max(255),
  codigo_barras: z.string().max(100).optional().nullable(),
  grado_esferico: z.number().min(-999.99).max(999.99).optional().nullable(),
  grado_cilindrico: z.number().min(-999.99).max(999.99).optional().nullable(),
  eje: z.number().int().min(0).max(180).optional().nullable(),
  color: z.string().max(100).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  stock: z.number().int().min(0).optional(),
  stock_minimo: z.number().int().min(0).optional(),
  precio_compra: z.number().min(0).max(99999999.99).optional().nullable(),
  precio_venta: z.number().min(0).max(99999999.99).optional().nullable(),
  lote: z.string().max(100).optional().nullable(),
  fecha_caducidad: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  estado: z.enum(['DISPONIBLE', 'OCUPADO', 'DANADO', 'VENCIDO']).optional(),
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
    folio: l.folio || '',
    marca: l.marca,
    modelo: l.modelo,
    codigo_barras: l.codigo_barras,
    grado_esferico: l.grado_esferico,
    grado_cilindrico: l.grado_cilindrico,
    eje: l.eje,
    color: l.color,
    material: l.material,
    stock: l.stock,
    stock_minimo: l.stock_minimo,
    precio_compra: l.precio_compra,
    precio_venta: l.precio_venta,
    lote: l.lote,
    fecha_caducidad: l.fecha_caducidad,
    estado: l.estado,
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

  if (barcode) {
    const { data, error } = await supabase
      .from('lentes')
      .select(SELECT)
      .eq('codigo_barras', barcode)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'No se encontro lente con ese codigo de barras' }, { status: 404 });
    }
    return NextResponse.json(mapLente(data));
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('lentes')
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
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
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
    .from('lentes')
    .select('id', { count: 'exact', head: true });
  const seq = ((count || 0) + 1).toString().padStart(5, '0');
  const folio = `LEN-${year}-${seq}`;

  const insert: Record<string, any> = {
    folio,
    marca: data.marca,
    modelo: data.modelo,
    codigo_barras: data.codigo_barras ?? null,
    grado_esferico: data.grado_esferico ?? null,
    grado_cilindrico: data.grado_cilindrico ?? null,
    eje: data.eje ?? null,
    color: data.color ?? null,
    material: data.material ?? null,
    stock: data.stock ?? 0,
    stock_minimo: data.stock_minimo ?? 5,
    precio_compra: data.precio_compra ?? null,
    precio_venta: data.precio_venta ?? null,
    lote: data.lote ?? null,
    fecha_caducidad: data.fecha_caducidad ?? null,
    estado: data.estado ?? 'DISPONIBLE',
    notas: data.notas ?? null,
    categoria_id: data.categoria_id ?? null,
    proveedor_id: data.proveedor_id ?? null,
  };

  const { data: lente, error } = await supabase
    .from('lentes')
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
    'marca', 'modelo', 'codigo_barras', 'grado_esferico', 'grado_cilindrico',
    'eje', 'color', 'material', 'stock', 'stock_minimo', 'precio_compra',
    'precio_venta', 'lote', 'fecha_caducidad', 'estado', 'notas',
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

  const { data: lente, error } = await supabase
    .from('lentes')
    .update(cleanUpdates)
    .eq('id', id)
    .select(SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
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
          entidad_tipo: 'lente',
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

  const { error } = await supabase.from('lentes').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
