import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { panelDoctorHonorarios } from '@/lib/productividad';

async function resolverDoctorPropio(usuarioId: string, email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: porUsuario } = await supabase
    .from('doctores')
    .select('id')
    .eq('usuario_id', usuarioId)
    .maybeSingle();

  if (porUsuario) return porUsuario.id;

  if (!email) return null;

  const { data: porEmail } = await supabase
    .from('doctores')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (!porEmail) return null;

  // Auto-vinculación servidor → servidor (mismo criterio que /api/usuarios/me).
  await supabase.from('doctores').update({ usuario_id: usuarioId }).eq('id', porEmail.id);
  return porEmail.id;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const authStart = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const authDur = performance.now() - authStart;

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  const fechaValida = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const conRango = fechaValida(desde) && fechaValida(hasta);

  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta)) || (desde && hasta && !conRango)) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }
  if (conRango && desde > hasta) {
    return NextResponse.json({ error: 'El inicio no puede ser posterior al fin' }, { status: 400 });
  }

  const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
  const pageSize = Math.min(
    200,
    Math.max(1, Math.floor(Number(searchParams.get('pageSize')) || 15))
  );

  const dbStart = performance.now();
  try {
    const supabase = getSupabaseAdmin();
    const { data: perfil, error: perfilError } = await supabase
      .from('usuarios')
      .select('id, email')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (perfilError || !perfil) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
    }

    const doctorId = await resolverDoctorPropio(auth.user.id, perfil.email || '');
    if (!doctorId) {
      return NextResponse.json(
        { error: 'Tu usuario no está vinculado a un doctor' },
        { status: 403 }
      );
    }

    const { data: doctor } = await supabase
      .from('doctores')
      .select('id, alias')
      .eq('id', doctorId)
      .maybeSingle();

    // Sin `desde/hasta` usa el periodo vigente (misma lógica que el panel admin).
    const data = await panelDoctorHonorarios(
      doctorId,
      null,
      page,
      pageSize,
      conRango ? { desde, hasta } : undefined
    );

    const response = NextResponse.json({
      ...data,
      doctor_id: doctorId,
      doctor_nombre: doctor?.alias ?? null,
    });
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDur.toFixed(1)}, db;dur=${(performance.now() - dbStart).toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDur.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}
