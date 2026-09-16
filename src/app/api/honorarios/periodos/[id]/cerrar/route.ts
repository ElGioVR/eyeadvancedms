import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { CierrePeriodoService } from '@/services/honorarios';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;

  try {
    const service = new CierrePeriodoService();
    const resultado = await service.cerrarPeriodo(id, auth.user.id);
    return NextResponse.json(resultado);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cerrar período';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
