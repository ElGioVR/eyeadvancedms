import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { listarProductividadCirugia } from '@/lib/productividad';
import { validarId } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';

async function manejarGET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Rol restringido (solo agenda propia): sin acceso a métricas, montos ni catálogo de precios
  if (auth.perfil?.rol === 'enfermero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const rows = await listarProductividadCirugia(id);
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const message = mensajeSeguro(err, 'cirugias.[id].productividad', 'Error interno del servidor');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = ruta('cirugias/[id]/productividad#GET', manejarGET);
