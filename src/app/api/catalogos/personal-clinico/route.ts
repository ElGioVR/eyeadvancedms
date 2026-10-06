import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';

/** GET /api/catalogos/personal-clinico — personal de apoyo activo (equipo quirúrgico). */
async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await getSupabaseAdmin()
    .from('personal_clinico')
    .select('id, nombre, rol_principal, activo')
    .eq('activo', true)
    .order('nombre')
    .limit(1000);
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogos.personal-clinico').mensaje }, { status: 500 });
  }
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, max-age=30' } });
}

export const GET = ruta('catalogos/personal-clinico#GET', manejarGET);
