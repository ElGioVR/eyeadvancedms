import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({
  preferencias: z.array(z.object({
    tipo_evento: z.string(),
    canal: z.enum(['IN_APP', 'EMAIL', 'PUSH']),
    activo: z.boolean(),
  })),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notificacion_preferencias')
    .select('id, tipo_evento, canal, activo')
    .eq('user_id', auth.user.id)
    .order('tipo_evento');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  for (const pref of validation.data.preferencias) {
    await supabase
      .from('notificacion_preferencias')
      .upsert({
        user_id: auth.user.id,
        tipo_evento: pref.tipo_evento,
        canal: pref.canal,
        activo: pref.activo,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,tipo_evento,canal' });
  }

  return NextResponse.json({ ok: true });
}
