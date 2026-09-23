import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const fechaDesde = searchParams.get('fecha_desde');
  const fechaHasta = searchParams.get('fecha_hasta');
  const estado = searchParams.get('estado');
  const tipoConcepto = searchParams.get('tipo_concepto');

  const supabase = getSupabaseAdmin();

  const { data: doctor } = await supabase
    .from('doctores')
    .select('id, nombre_completo')
    .eq('id', id)
    .maybeSingle();

  if (!doctor) {
    return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 });
  }

  let query = supabase
    .from('eventos_honorario')
    .select(`
      id, origen_tipo, origen_id, doctor_id, rol, fecha_servicio,
      monto_base, tarifa_snapshot, monto_devengado, moneda, estado, notas, created_at,
      pacientes:paciente_id (nombre_completo)
    `, { count: 'exact' })
    .eq('doctor_id', id)
    .order('fecha_servicio', { ascending: false });

  if (fechaDesde) query = query.gte('fecha_servicio', fechaDesde);
  if (fechaHasta) query = query.lte('fecha_servicio', fechaHasta);
  if (estado) query = query.eq('estado', estado);
  if (tipoConcepto) query = query.eq('origen_tipo', tipoConcepto);

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error al obtener eventos' }, { status: 500 });
  }

  const result = (data || []).map((ev) => {
    const snapshot = (ev.tarifa_snapshot as Record<string, unknown>) || {};
    return {
      ...ev,
      paciente_nombre: (ev.pacientes as unknown as Record<string, unknown>)?.nombre_completo || (snapshot.paciente_nombre as string | null) || null,
      origen_nombre: (snapshot.origen_nombre as string | null) || null,
      servicio_nombre: (snapshot.servicio_nombre as string | null) || null,
      precio_servicio: Number(snapshot.precio_servicio ?? ev.monto_base ?? 0) || 0,
      porcentaje_cobertura: snapshot.porcentaje_cobertura != null ? Number(snapshot.porcentaje_cobertura) : null,
      pacientes: undefined,
    };
  });

  return NextResponse.json({ data: result, total: count || 0, page, pageSize, doctor });
}
