import { NextResponse } from 'next/server';
import { notificarPagoHonorarios } from '@/services/notificaciones';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { pagarHonorarios } from '@/lib/productividad';
import { z } from 'zod';

const pagarSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = pagarSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors[0]?.message || 'Datos inválidos' },
      { status: 400 }
    );
  }

  try {
    const result = await pagarHonorarios(validation.data.ids, auth.user.id);

    // Notifica a cada doctor el total pagado (best-effort)
    if (result.pagados > 0) {
      try {
        const { data: pagados } = await getSupabaseAdmin()
          .from('eventos_honorario')
          .select('doctor_id, monto_devengado')
          .in('id', validation.data.ids)
          .eq('estado', 'PAGADO');
        const porDoctor = new Map<string, { monto: number; eventos: number }>();
        for (const e of pagados ?? []) {
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
