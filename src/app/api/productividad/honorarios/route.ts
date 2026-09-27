import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { listarHonorariosLiga } from '@/lib/productividad';

export async function GET(request: Request) {
  const startedAt = performance.now();
  const authStart = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // El rol se verifica en paralelo con la lectura (ver leerConRol).
  const rolP = requireRole(auth.user, ['admin']);
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
    const r = await leerConRol(rolP, () => listarHonorariosLiga({
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      doctor_id: doctorId,
      desde,
      hasta,
      referencia,
      fuente,
      estado,
      agrupar_por,
    }));
    if ('denegado' in r) return r.denegado;
    const data = r.datos;
    const dbDur = performance.now() - dbStart;
    const dur = (performance.now() - startedAt).toFixed(1);
    const response = NextResponse.json(data);
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDur.toFixed(1)}, db;dur=${dbDur.toFixed(1)}, honorarios;dur=${dur}`
    );
    return response;
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad.honorarios', 'Error interno del servidor');
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
