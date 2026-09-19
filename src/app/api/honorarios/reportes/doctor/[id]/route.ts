import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { HonorariosService } from '@/services/honorarios';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista', 'doctor']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // RBAC: doctor solo ve sus propios honorarios
  const { data: userProfile } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (userProfile?.rol === 'doctor') {
    const { data: doctor } = await supabase
      .from('doctores')
      .select('id')
      .eq('usuario_id', auth.user.id)
      .maybeSingle();

    if (!doctor || doctor.id !== id) {
      return NextResponse.json({ error: 'No autorizado para ver honorarios de otro doctor' }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const fecha_desde = searchParams.get('fecha_desde') || undefined;
  const fecha_hasta = searchParams.get('fecha_hasta') || undefined;
  const tipo_concepto = searchParams.get('tipo_concepto') as 'ESTUDIO' | 'PROCEDIMIENTO' | 'CONSULTA' | undefined;

  const service = new HonorariosService();

  const reporte = await service.reporteDoctor(id, {
    fecha_desde,
    fecha_hasta,
    tipo_concepto,
  });

  return NextResponse.json(reporte);
}
