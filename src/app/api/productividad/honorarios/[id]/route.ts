import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { editarMontoHonorario } from '@/lib/productividad';
import { z } from 'zod';

const patchSchema = z.object({
  monto: z.number().min(0),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = patchSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors[0]?.message || 'Datos inválidos' },
      { status: 400 }
    );
  }

  try {
    const item = await editarMontoHonorario(id, validation.data.monto);
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
