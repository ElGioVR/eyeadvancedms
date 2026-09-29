import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { procesarRecordatoriosSiToca } from '@/services/recordatorios';

// Cada pestaña lo sondea cada 30 s: conteo `head` (sin filas) sobre el índice
// idx_notificaciones_leido (user_id, leido).
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();

  // Recordatorios de cirugía próxima sin depender de un cron externo (plan gratuito).
  // Corre en paralelo con el conteo (antes bloqueaba la respuesta); está
  // limitado por intervalo y nunca lanza. Lo que genere se verá en el siguiente sondeo.
  const [, { count, error }] = await Promise.all([
    procesarRecordatoriosSiToca().catch(() => undefined),
    supabase
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .eq('leido', false),
  ]);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones/unread-count').mensaje }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
}
