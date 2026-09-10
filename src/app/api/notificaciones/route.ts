import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { z } from 'zod';

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
}).refine((data) => data.ids || data.all, {
  message: 'Debe proporcionar "ids" o "all: true"',
});

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notificaciones')
    .select('id,tipo,titulo,mensaje,entidad_tipo,entidad_id,leido,created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('notificaciones')
    .update({ leido: true })
    .eq('user_id', auth.user.id);

  if (parsed.data.all) {
    query = query.eq('leido', false);
  } else if (parsed.data.ids) {
    query = query.in('id', parsed.data.ids);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
