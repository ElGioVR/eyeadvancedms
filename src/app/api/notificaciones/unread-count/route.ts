import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .eq('leido', false);

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
