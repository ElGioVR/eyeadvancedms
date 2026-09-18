import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, email, nombre, rol, doctor_id, avatar_url, preferencias')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    iniciales: data.nombre
      ? data.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
      : '?',
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (body.preferencias && typeof body.preferencias === 'object') {
    const supabase = getSupabaseAdmin();
    const { data: current } = await supabase
      .from('usuarios')
      .select('preferencias')
      .eq('id', auth.user.id)
      .maybeSingle();

    const merged = {
      ...((current?.preferencias as Record<string, unknown>) ?? {}),
      ...body.preferencias,
    };
    update.preferencias = merged;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('usuarios')
    .update(update)
    .eq('id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
