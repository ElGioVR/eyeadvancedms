import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('liquidaciones_doctor')
    .select(`
      id, doctor_id, periodo_id, total_devengado, total_ajustes, total_retenciones,
      neto_pagar, moneda, estado, aprobado_por, aprobado_at, pagado_at, created_at, updated_at,
      doctores:doctor_id(nombre_completo, especialidad),
      periodos_pago:periodo_id(codigo, fecha_desde, fecha_hasta),
      ajustes:ajustes_liquidacion(liquidacion_id, concepto, monto, tipo, justificacion)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Error al obtener liquidación' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 });

  return NextResponse.json(data);
}
