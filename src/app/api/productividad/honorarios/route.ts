import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { esquemaPaginacion, leerQuery } from '@/lib/api/validar';
import { rangoPersonalizado } from '@/lib/rangos';
import { listarHonorariosLiga } from '@/lib/productividad';
import { fechaReal, uuidOpcional, validarRango } from '@/lib/productividad/validacion';
import { ruta } from '@/lib/api/ruta';

/** Filtros en memoria (fuente/estado): solo mayúsculas y guion bajo. */
const codigo = z.string().regex(/^[A-Z_]{1,30}$/, 'Filtro no válido');

const querySchema = z.object({
  ...esquemaPaginacion(50, 200),
  doctor_id: uuidOpcional,
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  referencia: fechaReal.optional(),
  fuente: codigo.optional(),
  estado: codigo.optional(),
  agrupar_por: z.string().max(20).optional(),
});

async function manejarGET(request: Request) {
  const startedAt = performance.now();
  const authStart = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // requireRole ya no cuesta un viaje extra (perfil cacheado): se espera antes
  // de leer para no gastar BD en usuarios sin permiso.
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;
  const authDur = performance.now() - authStart;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const { page, pageSize, fuente, estado, referencia } = q;
  const doctorId = q.doctor_id ?? null;
  const agrupar_por =
    q.agrupar_por === 'dia' || q.agrupar_por === 'doctor' || q.agrupar_por === 'fuente'
      ? q.agrupar_por
      : null;

  // Con `referencia` el rango lo define el periodo; si no, desde/hasta (o el mes actual).
  if (!referencia) {
    const { desde, hasta } = rangoPersonalizado(q.desde, q.hasta);
    const rangoError = validarRango(desde, hasta);
    if (rangoError) return rangoError;
  }

  const dbStart = performance.now();
  try {
    const data = await listarHonorariosLiga({
      page,
      pageSize,
      doctor_id: doctorId,
      desde: q.desde ?? null,
      hasta: q.hasta ?? null,
      referencia: referencia ?? null,
      fuente: fuente ?? null,
      estado: estado ?? null,
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

export const GET = ruta('productividad/honorarios#GET', manejarGET);
