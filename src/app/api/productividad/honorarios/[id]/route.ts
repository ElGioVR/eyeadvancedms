import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { validarId } from '@/lib/api/validar';
import { editarMontoHonorario } from '@/lib/productividad';
import { leerJSONTolerante, MONTO_MAXIMO } from '@/lib/productividad/validacion';
import { z } from 'zod';

const patchSchema = z
  .object({
    monto: z
      .number({ invalid_type_error: 'Monto inválido' })
      .finite('Monto inválido')
      .min(0, 'El monto no puede ser negativo')
      .max(MONTO_MAXIMO, 'Monto demasiado alto'),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'Honorario');
  if (idError) return idError;

  // Tolerante: el panel envía el body sin cabecera Content-Type.
  const body = await leerJSONTolerante(request, patchSchema);
  if (body instanceof NextResponse) return body;

  try {
    const item = await editarMontoHonorario(id, body.monto);
    return NextResponse.json({ item });
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad.honorarios.[id]', 'Error interno del servidor');
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
