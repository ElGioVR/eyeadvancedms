import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { SESION_TEMPORAL_COOKIE, VERIFIED_USER_HEADER, opcionesCookieAuth } from './constants';

/**
 * Las redirecciones deben llevar las cookies que Supabase actualizó en esta
 * petición. Sin esto, cuando el refresh token ya no existe (sesión cerrada en
 * otro lado, sesión única, logout) Supabase borra las cookies pero el borrado
 * se perdía en el redirect: el navegador las volvía a mandar y en cada petición
 * salía «Invalid Refresh Token: Refresh Token Not Found».
 */
function conCookies(destino: NextResponse, origen: NextResponse): NextResponse {
  origen.cookies.getAll().forEach((c) => destino.cookies.set(c));
  return destino;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const temporal = request.cookies.has(SESION_TEMPORAL_COOKIE);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({
            name,
            value,
            ...opcionesCookieAuth(options, temporal),
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({
            name,
            value: '',
            ...options,
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 0,
          });
        },
      },
    }
  );

  // getClaims(): verifica la firma del JWT localmente (JWKS) cuando el proyecto
  // usa llaves asimétricas; si no, cae a getUser(). Refresca el token si expiró.
  const { data: claimsData } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub;
  const user = typeof sub === 'string' ? { id: sub } : null;

  // Reenvía a los Server Components el id verificado para que no repitan
  // la verificación. Siempre se borra el valor que
  // venga del cliente, así no se puede falsificar.
  const forwarded = new Headers(request.headers);
  forwarded.delete(VERIFIED_USER_HEADER);
  if (user) forwarded.set(VERIFIED_USER_HEADER, user.id);
  const refreshed = response;
  response = NextResponse.next({ request: { headers: forwarded } });
  refreshed.cookies.getAll().forEach((c) => response.cookies.set(c));

  // Redirect unauthenticated users to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/bienvenida') &&
    !request.nextUrl.pathname.startsWith('/api')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return conCookies(NextResponse.redirect(url), response);
  }

  // Redirect authenticated users away from login (salvo «Ir a login» desde una
  // ventana cuya sesión se cerró: ?motivo=otra-ventana / otra-sesion)
  if (user && request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.searchParams.has('motivo')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return conCookies(NextResponse.redirect(url), response);
  }

  return response;
}
