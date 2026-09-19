import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

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

  const { data: liquidacion, error: e1 } = await supabase
    .from('liquidaciones_doctor')
    .select('id, periodo_id, doctor_id, total_devengado, total_ajustes, total_retenciones, neto_pagar, moneda, estado, aprobado_por, aprobado_at, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (e1 || !liquidacion) {
    return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 });
  }

  if (liquidacion.estado === 'APROBADA' || liquidacion.estado === 'PAGADA') {
    return NextResponse.json({ error: 'La liquidación ya fue aprobada' }, { status: 400 });
  }

  if (liquidacion.estado === 'RECHAZADA') {
    return NextResponse.json({ error: 'No se puede aprobar una liquidación rechazada' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('liquidaciones_doctor')
    .update({
      estado: 'APROBADA',
      aprobado_por: auth.user.id,
      aprobado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Error al aprobar' }, { status: 500 });
  }

  await supabase
    .from('bitacora_honorarios')
    .insert({
      tabla: 'liquidaciones_doctor',
      registro_id: id,
      accion: 'APROBACION',
      valor_anterior: { estado: liquidacion.estado },
      valor_nuevo: { estado: 'APROBADA' },
      usuario_id: auth.user.id,
    });

  return NextResponse.json({ success: true, estado: 'APROBADA' });
}
