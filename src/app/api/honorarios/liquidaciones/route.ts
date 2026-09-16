import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const periodoId = searchParams.get('periodo_id');
  const doctorId = searchParams.get('doctor_id');
  const estado = searchParams.get('estado');

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('liquidaciones_doctor')
    .select(`
      *,
      doctores:doctor_id (nombre_completo, especialidad),
      periodos_pago:periodo_id (codigo, fecha_desde, fecha_hasta)
    `)
    .order('created_at', { ascending: false });

  if (periodoId) query = query.eq('periodo_id', periodoId);
  if (doctorId) query = query.eq('doctor_id', doctorId);
  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error al obtener liquidaciones' }, { status: 500 });
  }

  const result = (data || []).map((l) => ({
    ...l,
    doctor_nombre: (l.doctores as Record<string, unknown>)?.nombre_completo || '',
    periodo_codigo: (l.periodos_pago as Record<string, unknown>)?.codigo || '',
    doctores: undefined,
    periodos_pago: undefined,
  }));

  return NextResponse.json(result);
}
