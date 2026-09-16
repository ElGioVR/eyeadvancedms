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
  const fechaDesde = searchParams.get('fecha_desde');
  const fechaHasta = searchParams.get('fecha_hasta');
  const tipoConcepto = searchParams.get('tipo_concepto');

  const supabase = getSupabaseAdmin();

  const { data: doctor } = await supabase
    .from('doctores')
    .select('id, nombre_completo, especialidad')
    .eq('id', id)
    .maybeSingle();

  if (!doctor) {
    return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 });
  }

  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError && auth.user.id !== doctor.id) {
    return roleError;
  }

  let query = supabase
    .from('eventos_honorario')
    .select('origen_tipo, monto_devengado, fecha_servicio, estado, moneda')
    .eq('doctor_id', id)
    .not('estado', 'eq', 'REVERSADO');

  if (fechaDesde) query = query.gte('fecha_servicio', fechaDesde);
  if (fechaHasta) query = query.lte('fecha_servicio', fechaHasta);
  if (tipoConcepto) query = query.eq('origen_tipo', tipoConcepto);

  const { data: eventos } = await query;

  const evts = eventos || [];

  const servicios_ejecutados = evts.length;
  const ingreso_generado = evts.reduce((s, e) => s + (e.monto_devengado || 0), 0);
  const ticket_promedio = servicios_ejecutados > 0
    ? Math.round(ingreso_generado / servicios_ejecutados * 100) / 100
    : 0;

  const porTipo = new Map<string, { cantidad: number; total: number }>();
  for (const ev of evts) {
    const actual = porTipo.get(ev.origen_tipo) || { cantidad: 0, total: 0 };
    actual.cantidad++;
    actual.total += ev.monto_devengado || 0;
    porTipo.set(ev.origen_tipo, actual);
  }

  const { count: totalConsultas } = await supabase
    .from('consultas')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', id)
    .gte('fecha', fechaDesde || '2000-01-01')
    .lte('fecha', fechaHasta || '2099-12-31');

  const { count: canceladas } = await supabase
    .from('agenda_cirugias')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', id)
    .eq('estado', 'cancelada')
    .gte('fecha', fechaDesde || '2000-01-01')
    .lte('fecha', fechaHasta || '2099-12-31');

  return NextResponse.json({
    doctor: { id: doctor.id, nombre: doctor.nombre_completo, especialidad: doctor.especialidad },
    kpis: {
      servicios_ejecutados,
      ingreso_generado,
      honorario_devengado: ingreso_generado,
      ticket_promedio,
      consultas_totales: totalConsultas || 0,
      cancelaciones: canceladas || 0,
    },
    por_tipo: [...porTipo.entries()].map(([tipo, datos]) => ({
      origen_tipo: tipo,
      cantidad: datos.cantidad,
      total: datos.total,
    })),
  });
}
