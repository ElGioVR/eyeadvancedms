import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { errorTranslations } from '@/lib/supabase/errors';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  // Perfil y vínculo doctor por usuario_id en paralelo (antes: 2-3 viajes en serie)
  const [perfilRes, doctorRes] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, email, nombre, rol, avatar_url, preferencias, activo')
      .eq('id', auth.user.id)
      .maybeSingle(),
    supabase
      .from('doctores')
      .select('id')
      .eq('usuario_id', auth.user.id)
      .maybeSingle(),
  ]);
  const { data, error } = perfilRes;

  if (error || !data) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  }
  if (data.activo === false) {
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 });
  }

  let doctor_id: string | null = null;
  if (data.rol === 'doctor' || data.rol === 'admin') {
    if (doctorRes.data) {
      doctor_id = doctorRes.data.id;
    } else if (data.email) {
      // Fallback: coincidencia exacta por email (sin comodines de ILIKE)
      const emailEscapado = data.email.replace(/[\\%_]/g, (c: string) => `\\${c}`);
      const { data: doctorByEmail } = await supabase
        .from('doctores')
        .select('id')
        .ilike('email', emailEscapado)
        .is('usuario_id', null)
        .maybeSingle();

      if (doctorByEmail) {
        doctor_id = doctorByEmail.id;
        // Auto-vincula en servidor (solo doctores aún sin usuario)
        await supabase
          .from('doctores')
          .update({ usuario_id: auth.user.id })
          .eq('id', doctorByEmail.id)
          .is('usuario_id', null);
      }
    }
  }

  const { activo: _activo, ...perfil } = data;
  void _activo;
  return NextResponse.json({
    ...perfil,
    doctor_id,
    created_at: auth.user.created_at,
    last_sign_in_at: auth.user.last_sign_in_at ?? null,
    modo_focus: ((data.preferencias as Record<string, unknown> | null)?.modo_focus === true),
    iniciales: data.nombre
      ? data.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
      : '?',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
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
