import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { panelDoctorHonorarios } from '@/lib/productividad';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ doctorId: string }> }
) {
  const startedAt = performance.now();
  const authStart = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;
  const authDur = performance.now() - authStart;

  const { doctorId } = await params;
  const { searchParams } = new URL(request.url);
  const referencia = searchParams.get('referencia');
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  const fechaValida = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const conRango = fechaValida(desde) && fechaValida(hasta);
  const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
  const pageSize = Math.min(
    200,
    Math.max(1, Math.floor(Number(searchParams.get('pageSize')) || 10))
  );

  if (conRango && desde > hasta) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  const dbStart = performance.now();
  try {
    const data = await panelDoctorHonorarios(
      doctorId,
      referencia,
      page,
      pageSize,
      conRango ? { desde, hasta } : undefined
    );
    const response = NextResponse.json(data);
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDur.toFixed(1)}, db;dur=${(performance.now() - dbStart).toFixed(1)}, panel;dur=${(performance.now() - startedAt).toFixed(1)}`
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
      `auth;dur=${authDur.toFixed(1)}, panel;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}
