import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { leerQuery } from '@/lib/api/validar';
import { panelDoctorHonorarios } from '@/lib/productividad';
import { escaparLike, fechaReal, validarRango } from '@/lib/productividad/validacion';
import { z } from 'zod';

// Solo el doctor autenticado: el doctor_id NUNCA se toma del cliente.
const querySchema = z.object({
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  page: z.string().max(10).optional(),
  pageSize: z.string().max(10).optional(),
});

type DoctorPropio = { id: string; alias: string | null };

/**
 * Doctor vinculado al usuario. Camino normal: 1 query por `usuario_id` (id + alias).
 * Solo si no hay vínculo se usa el email del perfil (ya leído en paralelo) como fallback.
 */
async function resolverDoctorPropio(
  usuarioId: string,
  porUsuario: DoctorPropio | null,
  email: string
): Promise<DoctorPropio | null> {
  if (porUsuario) return porUsuario;

  const supabase = getSupabaseAdmin();

  if (!email) return null;

  // Comparación literal sin distinguir mayúsculas: se escapan `%`/`_` para que
  // un email con comodines no empate con el doctor de otra persona.
  const { data: porEmail } = await supabase
    .from('doctores')
    .select('id, alias, usuario_id')
    .ilike('email', escaparLike(email))
    .maybeSingle();

  if (!porEmail) return null;
  // Un doctor ya vinculado a OTRO usuario no se reasigna por coincidir el email.
  if (porEmail.usuario_id && porEmail.usuario_id !== usuarioId) return null;

  // Auto-vinculación servidor → servidor (mismo criterio que /api/usuarios/me).
  await supabase.from('doctores').update({ usuario_id: usuarioId }).eq('id', porEmail.id).is('usuario_id', null);
  return { id: porEmail.id, alias: porEmail.alias ?? null };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const authStart = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const authDur = performance.now() - authStart;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }
  const desde = q.desde ?? null;
  const hasta = q.hasta ?? null;
  const conRango = !!desde && !!hasta;

  if (conRango && desde > hasta) {
    return NextResponse.json({ error: 'El inicio no puede ser posterior al fin' }, { status: 400 });
  }
  if (conRango) {
    const rangoError = validarRango(desde, hasta);
    if (rangoError) return rangoError;
  }

  const page = Math.min(100_000, Math.max(1, Math.floor(Number(q.page) || 1)));
  const pageSize = Math.min(
    200,
    Math.max(1, Math.floor(Number(q.pageSize) || 15))
  );

  // El email del perfil ya viene en la sesión (antes: 1 query a `usuarios`).
  const perfil = auth.perfil;
  if (!perfil) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  }

  const dbStart = performance.now();
  try {
    const supabase = getSupabaseAdmin();
    let { data: porUsuario, error: errFicha } = await supabase
      .from('doctores')
      .select('id, alias, cobra_honorarios')
      .eq('usuario_id', auth.user.id)
      .maybeSingle();
    if (errFicha) {
      // BD sin la columna cobra_honorarios (mig. 390): se lee como antes.
      ({ data: porUsuario } = await supabase.from('doctores').select('id, alias').eq('usuario_id', auth.user.id).maybeSingle());
    }
    if ((porUsuario as { cobra_honorarios?: boolean } | null)?.cobra_honorarios === false) {
      return NextResponse.json({ error: 'Tu perfil no tiene honorarios activos' }, { status: 403 });
    }

    const doctor = await resolverDoctorPropio(
      auth.user.id,
      (porUsuario as DoctorPropio | null) ?? null,
      perfil.email || ''
    );
    if (!doctor) {
      return NextResponse.json(
        { error: 'Tu usuario no está vinculado a un doctor' },
        { status: 403 }
      );
    }
    const doctorId = doctor.id;

    // Sin `desde/hasta` usa el periodo vigente (misma lógica que el panel admin).
    const data = await panelDoctorHonorarios(
      doctorId,
      null,
      page,
      pageSize,
      conRango ? { desde, hasta } : undefined,
      { doctorVerificado: true }
    );

    const response = NextResponse.json({
      ...data,
      doctor_id: doctorId,
      doctor_nombre: doctor.alias ?? null,
    });
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDur.toFixed(1)}, db;dur=${(performance.now() - dbStart).toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad.mis-honorarios', 'Error interno del servidor');
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
