import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';

/**
 * GET /api/catalogos/modelos-lio — modelos de LIO activos (todos los roles).
 * El filtrado por diseño/tórico se hace en el cliente (catálogo pequeño).
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabaseAdmin()
    .from('cat_modelos_lio')
    .select('id, fabricante, modelo, diseno, torico, verificado, origen, notas, activo')
    .eq('activo', true)
    .order('fabricante')
    .order('modelo')
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogos.modelos-lio').mensaje }, { status: 500 });
  }
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, max-age=60' } });
}
