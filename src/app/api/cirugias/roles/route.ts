import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
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

  return NextResponse.json(data || []);
}
