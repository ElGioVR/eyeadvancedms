import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { CLAVE_CONFIG_MENSAJES, type PlantillasMensaje } from '@/lib/mensajes-paciente';
import { ruta } from '@/lib/api/ruta';

/**
 * Plantillas del mensaje al paciente (WhatsApp / correo) en
 * configuracion_sistema, clave «mensajes_paciente». Cadena vacía o null =
 * volver al mensaje por defecto.
 */
const plantillasSchema = z.object({
  consulta: z.string().max(3000).nullable().optional(),
  cirugia: z.string().max(3000).nullable().optional(),
}).strict();

function normalizar(valor: unknown): PlantillasMensaje {
  const v = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const txt = (x: unknown) => (typeof x === 'string' && x.trim() ? x : null);
  return { consulta: txt(v.consulta), cirugia: txt(v.cirugia) };
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .select('valor, updated_at')
    .eq('clave', CLAVE_CONFIG_MENSAJES)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'mensajes.get').mensaje }, { status: 500 });
  }
  return NextResponse.json({ valor: normalizar(data?.valor), updated_at: data?.updated_at ?? null });
}

async function manejarPUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const validado = await leerJSON(request, plantillasSchema);
  if (validado instanceof NextResponse) return validado;

  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', CLAVE_CONFIG_MENSAJES)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: handleSupabaseError(readError, 'mensajes.put').mensaje }, { status: 500 });
  }

  const valor = normalizar({ ...normalizar(existing?.valor), ...validado });
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('configuracion_sistema')
    .upsert(
      { clave: CLAVE_CONFIG_MENSAJES, valor, updated_by: auth.user.id, updated_at: ahora },
      { onConflict: 'clave' }
    );
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'mensajes.put').mensaje }, { status: 500 });
  }
  return NextResponse.json({ valor, updated_at: ahora });
}

export const GET = ruta('configuracion/mensajes#GET', manejarGET);
export const PUT = ruta('configuracion/mensajes#PUT', manejarPUT);
