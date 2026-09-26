import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { VERIFIED_USER_HEADER } from './constants';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

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
            ...options,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reenvía a los Server Components el id verificado para que no repitan
  // auth.getUser() (otro viaje a Supabase Auth). Siempre se borra el valor que
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
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}
