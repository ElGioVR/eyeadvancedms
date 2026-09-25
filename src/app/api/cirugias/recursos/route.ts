import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('cat_recursos')
    .select('id, nombre, tipo, ubicacion')
    .eq('activo', true)
    .eq('tipo', 'QUIROFANO')
    .order('nombre');

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'cirugias.recursos').mensaje }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
