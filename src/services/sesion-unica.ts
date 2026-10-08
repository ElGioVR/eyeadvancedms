import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { invalidarPerfil, type createClient } from '@/lib/supabase/server';
import { sessionIdDeToken } from '@/lib/sesion-unica';

/**
 * Persistencia de la sesión única (columnas de `usuarios`, migración 450).
 * Las reglas viven en lib/sesion-unica.ts. Si la migración aún no se aplica,
 * las funciones devuelven null / no hacen nada: el login sigue funcionando.
 */

export interface SesionRegistrada {
  activaId: string | null;
  desde: string | null;
  vistaAt: string | null;
  dispositivo: string | null;
}

export async function leerSesionUsuario(userId: string): Promise<SesionRegistrada | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('usuarios')
    .select('sesion_activa_id, sesion_activa_desde, sesion_vista_at, sesion_dispositivo')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null; // 42703 (sin migración) o sin fila → sin control de sesión
  return {
    activaId: (data.sesion_activa_id as string | null) ?? null,
    desde: (data.sesion_activa_desde as string | null) ?? null,
    vistaAt: (data.sesion_vista_at as string | null) ?? null,
    dispositivo: (data.sesion_dispositivo as string | null) ?? null,
  };
}

/** Deja esta sesión como la que tiene prioridad (login libre o «Trabajar aquí»). */
export async function registrarSesion(userId: string, sessionId: string, dispositivo: string): Promise<boolean> {
  const ahora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from('usuarios')
    .update({ sesion_activa_id: sessionId, sesion_activa_desde: ahora, sesion_vista_at: ahora, sesion_dispositivo: dispositivo.slice(0, 120) })
    .eq('id', userId);
  invalidarPerfil(userId);
  if (error) console.error('[sesion.registrar]', error.message);
  return !error;
}

/** Al cerrar sesión: libera la prioridad solo si la tenía esta sesión. */
export async function liberarSesion(userId: string, sessionId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('usuarios')
    // sesion_vista_at se conserva: es la «última conexión» que muestra el dashboard.
    // Sin sesion_activa_id la sesión ya queda libre (decidirSesion).
    .update({ sesion_activa_id: null })
    .eq('id', userId)
    .eq('sesion_activa_id', sessionId);
  invalidarPerfil(userId);
  if (error && error.code !== '42703') console.error('[sesion.liberar]', error.message);
}

/**
 * Cierre de sesión de ESTE dispositivo (logout de la API y server action):
 * libera la sesión única si era la vigente y revoca solo esta sesión
 * (scope 'local'; antes signOut() era global y cerraba todos los dispositivos).
 */
export async function cerrarSesionActual(supabase: ReturnType<typeof createClient>): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const sessionId = sessionIdDeToken(token);
    if (token && sessionId) {
      const { data: verif } = await supabase.auth.getClaims(token);
      const userId = verif?.claims?.sub;
      if (typeof userId === 'string') await liberarSesion(userId, sessionId);
    }
  } catch (err) {
    console.error('[sesion.cerrar]', err);
  }
  try {
    // Sin sesión (o token ya revocado) signOut devuelve error: igual se limpian cookies.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) console.error('[auth.logout]', error.message);
  } catch (err) {
    console.error('[auth.logout]', err);
  }
}

/** Revoca una sesión concreta (por su access token) sin tocar las demás. */
export async function revocarSesion(accessToken: string): Promise<void> {
  const { error } = await getSupabaseAdmin().auth.admin.signOut(accessToken, 'local');
  if (error) console.error('[sesion.revocar]', error.message);
}

/**
 * «Trabajar aquí» entre ventanas del MISMO navegador. Las ventanas comparten la
 * cookie, así que para cerrar de verdad la sesión de la ventana anterior se
 * emite una sesión NUEVA para esta ventana (enlace mágico generado y
 * verificado en el servidor; no se envía correo) y se revoca la anterior.
 * La ventana desplazada ya no tiene un token válido propio.
 */
export async function renovarSesionVentana(
  supabase: ReturnType<typeof createClient>,
  dispositivo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const tokenAnterior = data.session?.access_token;
  if (!tokenAnterior) return { ok: false, error: 'No autenticado' };
  const { data: verif, error: errVerif } = await supabase.auth.getClaims(tokenAnterior);
  const claims = verif?.claims;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  const sesionAnterior = sessionIdDeToken(tokenAnterior);
  if (errVerif || !userId || !email) return { ok: false, error: 'No autenticado' };

  const admin = getSupabaseAdmin();
  const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = enlace?.properties?.hashed_token;
  if (errEnlace || !tokenHash) {
    console.error('[sesion.renovar] generateLink', errEnlace?.message);
    return { ok: false, error: 'No se pudo renovar la sesión' };
  }
  // verifyOtp escribe las cookies de la sesión nueva en la respuesta.
  const { data: nueva, error: errOtp } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  const sesionNueva = sessionIdDeToken(nueva?.session?.access_token);
  if (errOtp || !sesionNueva) {
    console.error('[sesion.renovar] verifyOtp', errOtp?.message);
    return { ok: false, error: 'No se pudo renovar la sesión' };
  }

  // La sesión única pasa a la nueva solo si era de este navegador (o no había).
  const actual = await leerSesionUsuario(userId);
  if (actual && (!actual.activaId || actual.activaId === sesionAnterior)) {
    await registrarSesion(userId, sesionNueva, dispositivo);
  }
  await revocarSesion(tokenAnterior);
  return { ok: true };
}
