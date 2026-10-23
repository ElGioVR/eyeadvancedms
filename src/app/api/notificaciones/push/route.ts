import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { clavePublicaVapid, pushDisponible } from '@/services/push';

/**
 * Suscripción push del dispositivo actual (celular / computadora).
 * GET: clave pública y estado de este dispositivo · POST: alta (o reasigna el
 * dispositivo al usuario actual) · PATCH: modo discreto · DELETE: baja.
 */

const endpointSchema = z.string().url().max(1000);

const altaSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  discreta: z.boolean().optional(),
}).passthrough();

const cambioSchema = z.object({ endpoint: endpointSchema, discreta: z.boolean() }).strict();
const bajaSchema = z.object({ endpoint: endpointSchema }).strict();

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const endpoint = new URL(request.url).searchParams.get('endpoint');
  let registrada = false;
  let discreta = false;
  if (endpoint && pushDisponible()) {
    const { data } = await getSupabaseAdmin()
      .from('push_suscripciones')
      .select('*')
      .eq('endpoint', endpoint)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    // Registrada para ESTA sesión (si se registró con una sesión anterior, el
    // cliente la vuelve a registrar y queda ligada a la sesión actual).
    const fila = data as { discreta?: boolean; session_id?: string | null } | null;
    registrada = !!fila && (!('session_id' in fila) || !auth.user.sessionId || fila.session_id === auth.user.sessionId);
    discreta = !!fila?.discreta;
  }
  return NextResponse.json(
    { disponible: pushDisponible(), publicKey: clavePublicaVapid(), registrada, discreta },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!pushDisponible()) return NextResponse.json({ error: 'Las notificaciones push no están configuradas en el servidor' }, { status: 503 });

  const body = await leerJSON(request, altaSchema, { maxBytes: 4_000 });
  if (body instanceof NextResponse) return body;

  const supabase = getSupabaseAdmin();
  // Si el dispositivo ya estaba registrado se conserva su modo discreto salvo que venga explícito.
  const fila: Record<string, unknown> = {
    user_id: auth.user.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300) || null,
    updated_at: new Date().toISOString(),
  };
  if (body.discreta !== undefined) fila.discreta = body.discreta;
  let { error } = await supabase
    .from('push_suscripciones')
    .upsert({ ...fila, session_id: auth.user.sessionId ?? null }, { onConflict: 'endpoint' });
  // Sin la columna session_id (patch anterior): se guarda sin ella.
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    ({ error } = await supabase.from('push_suscripciones').upsert(fila, { onConflict: 'endpoint' }));
  }
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones.push.alta').mensaje }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const body = await leerJSON(request, cambioSchema, { maxBytes: 2_000 });
  if (body instanceof NextResponse) return body;

  const { error } = await getSupabaseAdmin()
    .from('push_suscripciones')
    .update({ discreta: body.discreta, updated_at: new Date().toISOString() })
    .eq('endpoint', body.endpoint)
    .eq('user_id', auth.user.id);
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones.push.cambio').mensaje }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const body = await leerJSON(request, bajaSchema, { maxBytes: 2_000 });
  if (body instanceof NextResponse) return body;

  const { error } = await getSupabaseAdmin()
    .from('push_suscripciones')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_id', auth.user.id);
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones.push.baja').mensaje }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = ruta('notificaciones/push#GET', manejarGET);
export const POST = ruta('notificaciones/push#POST', manejarPOST);
export const PATCH = ruta('notificaciones/push#PATCH', manejarPATCH);
export const DELETE = ruta('notificaciones/push#DELETE', manejarDELETE);
