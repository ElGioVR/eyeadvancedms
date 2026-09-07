import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export type UserRole = 'admin' | 'doctor' | 'recepcionista';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value,
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            });
          } catch {
            // Server component — can't set cookies
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value: '',
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 0,
            });
          } catch {
            // Server component — can't set cookies
          }
        },
      },
    }
  );
}

export async function requireAuth(): Promise<{ user: User } | NextResponse> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  return { user };
}

export async function requireRole(
  user: User,
  allowedRoles: readonly UserRole[]
): Promise<NextResponse | null> {
  const supabase = createClient();
  const { data: profile, error } = await supabase
    .from('usuarios')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle();

  if (
    error ||
    !profile ||
    profile.activo !== true ||
    !allowedRoles.includes(profile.rol as UserRole)
  ) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  return null;
}
