import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('lentes')
    .select(`
      *,
      categorias_lentes:categoria_id (nombre),
      proveedores:proveedor_id (nombre)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data.map((l) => ({
    id: l.id,
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
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data, error } = await supabase
    .from('lentes')
    .insert({
      marca: body.marca,
      modelo: body.modelo,
      codigo_barras: body.codigo_barras,
      grado_esferico: body.grado_esferico,
      grado_cilindrico: body.grado_cilindrico,
      eje: body.eje,
      color: body.color,
      material: body.material,
      stock: body.stock || 0,
      stock_minimo: body.stock_minimo || 5,
      precio_compra: body.precio_compra,
      precio_venta: body.precio_venta,
      lote: body.lote,
      fecha_caducidad: body.fecha_caducidad,
      estado: body.estado || 'DISPONIBLE',
      notas: body.notas,
      categoria_id: body.categoria_id,
      proveedor_id: body.proveedor_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();
  const { id, ...updates } = body;

  const { data, error } = await supabase
    .from('lentes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
