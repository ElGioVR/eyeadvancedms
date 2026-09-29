import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerQuery, validarId } from '@/lib/api/validar';
import { panelDoctorHonorarios } from '@/lib/productividad';
import { fechaReal, validarRango } from '@/lib/productividad/validacion';

const querySchema = z.object({
  referencia: fechaReal.optional(),
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  page: z.string().max(10).optional(),
  pageSize: z.string().max(10).optional(),
});

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
  const idError = validarId(doctorId, 'Doctor');
  if (idError) return idError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const referencia = q.referencia ?? null;
  const desde = q.desde ?? null;
  const hasta = q.hasta ?? null;
  const conRango = !!desde && !!hasta;
  const page = Math.min(100_000, Math.max(1, Math.floor(Number(q.page) || 1)));
  const pageSize = Math.min(
    200,
    Math.max(1, Math.floor(Number(q.pageSize) || 10))
  );

  if (conRango) {
    const rangoError = validarRango(desde, hasta);
    if (rangoError) return rangoError;
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
    const message = mensajeSeguro(err, 'productividad.honorarios.doctor.[doctorId]', 'Error interno del servidor');
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
