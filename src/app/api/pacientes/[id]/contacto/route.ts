import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { errorInterno, validarId } from '@/lib/api/validar';
import { ROLES_GESTION_AGENDA } from '@/lib/permisos-agenda';
import { leerTelefonos } from '@/lib/telefonos-paciente-db';
import { ruta } from '@/lib/api/ruta';

/**
 * Contacto del paciente (teléfono y correo) para los botones de WhatsApp/correo
 * de la ventana rápida de la agenda. Mínimo payload: 1 fila, 3 columnas.
 */
async function manejarGET(_request: Request, { params }: { params: { id: string } }) {
  const idError = validarId(params.id, 'ID de paciente');
  if (idError) return idError;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const rolP = requireRole(auth.user, ROLES_GESTION_AGENDA);

  const r = await leerConRol(rolP, async () =>
    getSupabaseAdmin().from('pacientes').select('nombre_completo, telefono, email').eq('id', params.id).maybeSingle()
  );
  if ('denegado' in r) return r.denegado;
  const { data, error } = r.datos;
  if (error) return errorInterno(error, 'pacientes.contacto');
  if (!data) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
  const telefonos = (await leerTelefonos([params.id])).get(params.id) ?? [];

  return NextResponse.json(
    { nombre_completo: data.nombre_completo, telefono: data.telefono ?? null, telefonos, email: data.email ?? null },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}

export const GET = ruta('pacientes/[id]/contacto#GET', manejarGET);
