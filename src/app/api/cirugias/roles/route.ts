import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('cat_roles_participante')
    .select('id, clave, nombre, descripcion, orden')
    .eq('activo', true)
    .order('orden', { ascending: true });

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'cirugias.roles').mensaje }, { status: 500 });
  }

  // Catálogo casi estático: caché privada corta en el navegador.
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, max-age=60' } });
}

export const GET = ruta('cirugias/roles#GET', manejarGET);
