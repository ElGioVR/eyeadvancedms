import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';

/** GET /api/catalogos/especialidades — catálogo activo, ordenado (punto II). */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabaseAdmin()
    .from('cat_especialidades')
    .select('id, clave, nombre')
    .eq('activo', true)
    .order('orden')
    .order('nombre');

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogos.especialidades').mensaje }, { status: 500 });
  }
  // Catálogo casi estático: caché privada corta en el navegador.
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, max-age=60' } });
}
