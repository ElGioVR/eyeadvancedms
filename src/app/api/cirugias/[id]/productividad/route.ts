import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
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
    const message = mensajeSeguro(err, 'cirugias.[id].productividad', 'Error interno del servidor');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
