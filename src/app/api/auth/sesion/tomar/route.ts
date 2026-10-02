import { NextResponse } from 'next/server';
import { createClient, obtenerPerfil } from '@/lib/supabase/server';
import { etiquetaDispositivo, sessionIdDeToken } from '@/lib/sesion-unica';
import { registrarSesion } from '@/services/sesion-unica';

/**
 * «Trabajar aquí»: esta sesión (recién iniciada con usuario y contraseña) toma
 * la prioridad y las demás sesiones del usuario se cierran:
 *  1. `usuarios.sesion_activa_id` = esta sesión → requireAuth() rechaza al
 *     otro dispositivo con 401 SESION_REEMPLAZADA (≤15 s por la caché del perfil).
 *  2. signOut({ scope: 'others' }) revoca los refresh tokens de los demás.
 * No usa requireAuth(): esta sesión todavía no es la vigente.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: verif, error } = await supabase.auth.getClaims(token);
  const userId = verif?.claims?.sub;
  const sessionId = sessionIdDeToken(token);
  if (error || typeof userId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const perfil = await obtenerPerfil(userId);
  if (!perfil || !perfil.activo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const ok = await registrarSesion(userId, sessionId, etiquetaDispositivo(request.headers.get('user-agent')));
  if (!ok) return NextResponse.json({ error: 'No se pudo activar la sesión. Intenta de nuevo.' }, { status: 500 });

  const { error: errorOtras } = await supabase.auth.signOut({ scope: 'others' });
  if (errorOtras) console.error('[auth.sesion.tomar] signOut others', errorOtras.message);

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
