import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { listarProductividadCirugia } from '@/lib/productividad';
import { validarId } from '@/lib/api/validar';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await listarProductividadCirugia(id);
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const message = mensajeSeguro(err, 'cirugias.[id].productividad', 'Error interno del servidor');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
