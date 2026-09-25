import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { errorTranslations } from '@/lib/supabase/errors';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, email, nombre, rol, avatar_url, preferencias')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  }

  // Resolve doctor_id from doctores table (server-side with service_role)
  let doctor_id: string | null = null;
  if (data.rol === 'doctor' || data.rol === 'admin') {
    // 1. Try by usuario_id
    const { data: doctorRec } = await supabase
      .from('doctores')
      .select('id')
      .eq('usuario_id', auth.user.id)
      .maybeSingle();

    if (doctorRec) {
      doctor_id = doctorRec.id;
    } else {
      // 2. Fallback: match by email
      const { data: doctorByEmail } = await supabase
        .from('doctores')
        .select('id')
        .ilike('email', data.email || '')
        .maybeSingle();

      if (doctorByEmail) {
        doctor_id = doctorByEmail.id;
        // Auto-link server-side (has permission)
        await supabase
          .from('doctores')
          .update({ usuario_id: auth.user.id })
          .eq('id', doctorByEmail.id);
      }
    }
  }

  return NextResponse.json({
    ...data,
    doctor_id,
    modo_focus: ((data.preferencias as Record<string, unknown> | null)?.modo_focus === true),
    iniciales: data.nombre
      ? data.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
      : '?',
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: { preferencias?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.preferencias && typeof body.preferencias === 'object') {
    // Whitelist: solo claves conocidas; ignora el resto en vez de corromper la config
    const entradas = Object.entries(body.preferencias as Record<string, unknown>).filter(([clave]) =>
      ['modo_focus', 'theme', 'festividad'].includes(clave),
    );
    if (entradas.length === 0) {
      return NextResponse.json({ error: 'Ninguna preferencia válida para actualizar' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data: current } = await supabase
      .from('usuarios')
      .select('preferencias')
      .eq('id', auth.user.id)
      .maybeSingle();

    const merged = {
      ...((current?.preferencias as Record<string, unknown>) ?? {}),
      ...Object.fromEntries(entradas),
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
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
