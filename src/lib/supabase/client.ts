import { createBrowserClient, type CookieOptions } from '@supabase/ssr';
import { SESION_TEMPORAL_COOKIE, opcionesCookieAuth } from './constants';

function leerCookie(nombre: string): string | undefined {
  const par = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${encodeURIComponent(nombre)}=`));
  return par ? decodeURIComponent(par.slice(par.indexOf('=') + 1)) : undefined;
}

function escribirCookie(nombre: string, valor: string, o: CookieOptions) {
  let c = `${encodeURIComponent(nombre)}=${encodeURIComponent(valor)}; Path=${o.path || '/'}`;
  if (typeof o.maxAge === 'number') c += `; Max-Age=${Math.floor(o.maxAge)}`;
  if (o.expires) c += `; Expires=${new Date(o.expires).toUTCString()}`;
  if (o.domain) c += `; Domain=${o.domain}`;
  c += `; SameSite=${typeof o.sameSite === 'string' ? o.sameSite : 'Lax'}`;
  if (o.secure || window.location.protocol === 'https:') c += '; Secure';
  document.cookie = c;
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Igual que el comportamiento por defecto, pero respetando «Recordarme»:
      // sin él, los tokens refrescados siguen siendo cookies de sesión.
      cookies: {
        get: (name: string) => leerCookie(name),
        set: (name: string, value: string, options: CookieOptions) => {
          const temporal = leerCookie(SESION_TEMPORAL_COOKIE) !== undefined;
          escribirCookie(name, value, opcionesCookieAuth(options, temporal));
        },
        remove: (name: string, options: CookieOptions) => {
          escribirCookie(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );
}
