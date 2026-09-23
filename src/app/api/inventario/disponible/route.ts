import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo');

  const supabase = getSupabaseAdmin();
  const hoy = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from('inventario_items')
    .select(`
      id, marca, modelo, tipo, grado_esferico, grado_cilindrico, eje,
      color, material, stock, precio_venta, categoria_id,
      potencia_dioptrias, tipo_lio, modelo_fabricante, lote, fecha_caducidad,
      categorias_lentes:categoria_id (nombre)
    `)
    .eq('estado', 'DISPONIBLE')
    .gt('stock', 0)
    .or(`fecha_caducidad.is.null,fecha_caducidad.gt.${hoy}`)
    .order('marca', { ascending: true });

  if (tipo) {
    query = query.eq('tipo', tipo);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  const result = (data || []).map((l) => ({
    id: l.id,
    marca: l.marca,
    modelo: l.modelo,
    tipo: l.tipo || 'LENTE_VISION',
    grado_esferico: l.grado_esferico,
    grado_cilindrico: l.grado_cilindrico,
    eje: l.eje,
    color: l.color,
    material: l.material,
    stock: l.stock,
    precio_venta: l.precio_venta,
    potencia_dioptrias: l.potencia_dioptrias,
    tipo_lio: l.tipo_lio,
    modelo_fabricante: l.modelo_fabricante,
    lote: l.lote,
    fecha_caducidad: l.fecha_caducidad,
    categoria: (l.categorias_lentes as any)?.nombre || '',
  }));

  return NextResponse.json(result);
}
