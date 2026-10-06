import { NextResponse } from 'next/server';
import { notificarPagoHonorarios } from '@/services/notificaciones';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { pagarHonorarios } from '@/lib/productividad';
import { leerJSONTolerante, MAX_IDS_PAGO } from '@/lib/productividad/validacion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const pagarSchema = z
  .object({
    ids: z
      .array(z.string().uuid('ID no válido'))
      .min(1, 'Selecciona al menos un honorario')
      .max(MAX_IDS_PAGO, `Máximo ${MAX_IDS_PAGO} honorarios por pago`),
  })
  .strict();

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  // Tolerante: el panel envía el body sin cabecera Content-Type.
  const body = await leerJSONTolerante(request, pagarSchema);
  if (body instanceof NextResponse) return body;

  try {
    const { detalle, ...result } = await pagarHonorarios(body.ids, auth.user.id);

    // Notifica a cada doctor el total pagado (best-effort). Usa las filas que
    // devolvió el UPDATE (antes se releían de la BD).
    if (result.pagados > 0) {
      try {
        const porDoctor = new Map<string, { monto: number; eventos: number }>();
        for (const e of detalle) {
          const acc = porDoctor.get(e.doctor_id) ?? { monto: 0, eventos: 0 };
          acc.monto += Number(e.monto_devengado) || 0;
          acc.eventos += 1;
          porDoctor.set(e.doctor_id, acc);
        }
        await Promise.all(
          Array.from(porDoctor.entries()).map(([doctorId, v]) =>
            notificarPagoHonorarios({ doctorId, monto: v.monto, eventos: v.eventos, actorUserId: auth.user.id }),
          ),
        );
      } catch (e) {
        console.error('[honorarios.pagar] notificación', e);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad.honorarios.pagar', 'Error interno del servidor');
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = ruta('productividad/honorarios/pagar#POST', manejarPOST);
