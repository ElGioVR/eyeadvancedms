import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const fechaDesde = searchParams.get('fecha_desde');
  const fechaHasta = searchParams.get('fecha_hasta');
  const moneda = searchParams.get('moneda') || 'PESOS';

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('eventos_honorario')
    .select(`
      doctor_id, rol, monto_devengado, fecha_servicio, origen_tipo, estado,
      doctores:doctor_id (nombre_completo, especialidad)
    `)
    .not('estado', 'eq', 'REVERSADO')
    .eq('moneda', moneda);

  if (fechaDesde) query = query.gte('fecha_servicio', fechaDesde);
  if (fechaHasta) query = query.lte('fecha_servicio', fechaHasta);

  const { data: eventos } = await query;

  if (!eventos) return NextResponse.json([]);

  const agrupados = new Map<string, {
    doctor_id: string;
    doctor_nombre: string;
    especialidad: string;
    servicios: number;
    devengado: number;
  }>();

  for (const ev of eventos) {
    const id = ev.doctor_id;
    const actual = agrupados.get(id) || {
      doctor_id: id,
      doctor_nombre: ((ev.doctores as unknown as Record<string, unknown>)?.nombre_completo as string) || '',
      especialidad: ((ev.doctores as unknown as Record<string, unknown>)?.especialidad as string) || '',
      servicios: 0,
      devengado: 0,
    };
    actual.servicios++;
    actual.devengado += ev.monto_devengado || 0;
    agrupados.set(id, actual);
  }

  const ranking = [...agrupados.values()]
    .sort((a, b) => b.devengado - a.devengado)
    .map((d, i) => ({ ...d, ranking: i + 1 }));

  return NextResponse.json(ranking);
}
