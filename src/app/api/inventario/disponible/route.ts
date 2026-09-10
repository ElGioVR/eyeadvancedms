import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('lentes')
    .select(`
      id, marca, modelo, grado_esferico, grado_cilindrico, eje,
      color, material, stock, precio_venta, categoria_id,
      categorias_lentes:categoria_id (nombre)
    `)
    .eq('estado', 'DISPONIBLE')
    .gt('stock', 0)
    .order('marca', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  const result = (data || []).map((l) => ({
    id: l.id,
    marca: l.marca,
    modelo: l.modelo,
    grado_esferico: l.grado_esferico,
    grado_cilindrico: l.grado_cilindrico,
    eje: l.eje,
    color: l.color,
    material: l.material,
    stock: l.stock,
    precio_venta: l.precio_venta,
    categoria: (l.categorias_lentes as any)?.nombre || '',
  }));

  return NextResponse.json(result);
}
