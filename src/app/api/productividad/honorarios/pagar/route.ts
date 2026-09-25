import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { pagarHonorarios } from '@/lib/productividad';
import { z } from 'zod';

const pagarSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = pagarSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors[0]?.message || 'Datos inválidos' },
      { status: 400 }
    );
  }

  try {
    const result = await pagarHonorarios(validation.data.ids, auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
