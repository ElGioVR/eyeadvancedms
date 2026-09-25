import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { listarHonorariosLiga } from '@/lib/productividad';

export async function GET(request: Request) {
  const startedAt = performance.now();
  const authStart = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;
  const authDur = performance.now() - authStart;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const doctorId = searchParams.get('doctor_id');
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  const referencia = searchParams.get('referencia');
  const fuente = searchParams.get('fuente');
  const estado = searchParams.get('estado');
  const agruparRaw = searchParams.get('agrupar_por');
  const agrupar_por =
    agruparRaw === 'dia' || agruparRaw === 'doctor' || agruparRaw === 'fuente'
      ? agruparRaw
      : null;

  const dbStart = performance.now();
  try {
    const data = await listarHonorariosLiga({
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      doctor_id: doctorId,
      desde,
      hasta,
      referencia,
      fuente,
      estado,
      agrupar_por,
    });
    const dbDur = performance.now() - dbStart;
    const dur = (performance.now() - startedAt).toFixed(1);
    const response = NextResponse.json(data);
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDur.toFixed(1)}, db;dur=${dbDur.toFixed(1)}, honorarios;dur=${dur}`
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
      `auth;dur=${authDur.toFixed(1)}, honorarios;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}
