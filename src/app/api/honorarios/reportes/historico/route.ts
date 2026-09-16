import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { HonorariosService } from '@/services/honorarios';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista', 'doctor']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const doctor_id = searchParams.get('doctor_id');
  const granularidad = (searchParams.get('granularidad') || 'mes') as 'dia' | 'semana' | 'mes' | 'year';
  const meses = parseInt(searchParams.get('meses') || '24', 10);

  if (!doctor_id) {
    return NextResponse.json({ error: 'doctor_id es requerido' }, { status: 400 });
  }

  // RBAC: doctor solo ve su propio histórico
  if (auth.user.role === 'doctor') {
    const supabase = getSupabaseAdmin();
    const { data: doctor } = await supabase
      .from('doctores')
      .select('id')
      .eq('usuario_id', auth.user.id)
      .maybeSingle();

    if (!doctor || doctor.id !== doctor_id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  const service = new HonorariosService();
  const historico = await service.historicoDoctor(doctor_id, granularidad, meses);

  return NextResponse.json(historico);
}
