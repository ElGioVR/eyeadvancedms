import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { procesarRecordatoriosSiToca } from '@/services/recordatorios';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Recordatorios de cirugía próxima sin depender de un cron externo (plan gratuito)
  await procesarRecordatoriosSiToca();

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .eq('leido', false);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones/unread-count').mensaje }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
