import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const pagoSchema = z.object({
  monto: z.number().min(0),
  metodo: z.string().optional(),
  referencia: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  const validation = pagoSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const { data: liquidacion, error: e1 } = await supabase
    .from('liquidaciones_doctor')
    .select('id, estado, neto_pagar')
    .eq('id', id)
    .maybeSingle();

  if (e1 || !liquidacion) return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 });
  if (liquidacion.estado !== 'APROBADA') {
    return NextResponse.json({ error: 'La liquidación debe estar aprobada primero' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('liquidaciones_doctor')
    .update({ estado: 'PAGADA', pagado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 });

  await supabase.from('bitacora_honorarios').insert({
    tabla: 'liquidaciones_doctor', registro_id: id, accion: 'PAGO',
    valor_anterior: { estado: liquidacion.estado }, valor_nuevo: { estado: 'PAGADA', monto: validation.data.monto },
    usuario_id: auth.user.id,
  });

  return NextResponse.json({ success: true, estado: 'PAGADA' });
}
