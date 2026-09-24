import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { listarProductividadCirugia } from '@/lib/productividad';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  try {
    const rows = await listarProductividadCirugia(id);
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
