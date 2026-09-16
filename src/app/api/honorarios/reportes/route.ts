import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { HonorariosService } from '@/services/honorarios';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista', 'doctor']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const fecha_desde = searchParams.get('fecha_desde') || undefined;
  const fecha_hasta = searchParams.get('fecha_hasta') || undefined;
  const doctor_id = searchParams.get('doctor_id') || undefined;
  const moneda = searchParams.get('moneda') || undefined;

  const service = new HonorariosService();

  const reporte = await service.reporteGlobal({
    fecha_desde,
    fecha_hasta,
    doctor_id,
    moneda,
  });

  return NextResponse.json(reporte);
}
