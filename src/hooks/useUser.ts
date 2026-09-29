'use client';

import { useState, useEffect } from 'react';
import { mutate as mutateGlobal } from 'swr';
import { clearPrefetched } from '@/lib/prefetch';

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  iniciales: string;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  doctor_id: string | null;
  modo_focus: boolean;
  preferencias: Record<string, unknown>;
}

function getInitials(name: string, email: string): string {
  if (name) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/*
 * Store compartido a nivel módulo.
 * Antes cada componente que llamaba useUser() (Sidebar, TopBar, nav móvil y la
 * página) hacía su propio `auth.getUser()` (viaje a Supabase Auth) + GET
 * /api/usuarios/me → 4-8 requests por navegación. Ahora hay UNA sola request
 * deduplicada y cacheada para toda la sesión de la pestaña; el endpoint ya
 * valida la sesión en servidor.
 */
let cache: User | null | undefined; // undefined = aún no cargado
let inflight: Promise<User | null> | null = null;
const listeners = new Set<(u: User | null) => void>();

function emit(u: User | null) {
  cache = u;
  listeners.forEach((l) => l(u));
}

async function fetchUser(): Promise<User | null> {
  const res = await fetch('/api/usuarios/me', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (res.ok) {
    const me = await res.json();
    return {
      id: me.id,
      email: me.email || '',
      nombre: me.nombre || '',
      rol: me.rol || 'recepcionista',
      iniciales: me.iniciales || getInitials(me.nombre || '', me.email || ''),
      avatar_url: me.avatar_url ?? null,
      last_sign_in_at: me.last_sign_in_at ?? null,
      created_at: me.created_at ?? '',
      doctor_id: me.doctor_id ?? null,
      modo_focus: me.modo_focus === true,
      preferencias: (me.preferencias as Record<string, unknown>) ?? {},
    };
  }
  // Perfil no disponible: fallback con la sesión local (sin viaje de red)
  const { createClient } = await import('@/lib/supabase/client');
  const { data: { session } } = await createClient().auth.getSession();
  const authUser = session?.user;
  if (!authUser) return null;
  return {
    id: authUser.id,
    email: authUser.email || '',
    nombre: authUser.user_metadata?.nombre || '',
    rol: authUser.user_metadata?.rol || 'recepcionista',
    iniciales: getInitials(authUser.user_metadata?.nombre || '', authUser.email || ''),
    avatar_url: null,
    last_sign_in_at: authUser.last_sign_in_at ?? null,
    created_at: authUser.created_at,
    doctor_id: null,
    modo_focus: false,
    preferencias: {},
  };
}

function load(force = false): Promise<User | null> {
  if (!force && cache !== undefined) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = fetchUser()
    .catch((error) => {
      console.error('Error fetching user:', error);
      return null;
    })
    .then((u) => {
      emit(u);
      return u;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Vuelve a pedir el perfil (p. ej. tras cambiar avatar, nombre o preferencias). */
export function refreshUser(): Promise<User | null> {
  return load(true);
}

/**
 * Limpia la caché del perfil y la CacheStorage del service worker
 * (usar al iniciar/cerrar sesión: evita que datos de otro usuario persistan).
 */
export function clearUserCache(): void {
  cache = undefined;
  inflight = null;
  clearPrefetched();
  // Vacía la caché de datos de SWR (sin revalidar): el siguiente usuario no ve datos del anterior.
  void mutateGlobal(() => true, undefined, { revalidate: false });
  if (typeof window !== 'undefined' && 'caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

export function useUser() {
  // Estado inicial determinista (igual en servidor y cliente) → sin mismatch de hidratación
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const listener = (u: User | null) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    };
    listeners.add(listener);
    if (cache !== undefined) listener(cache);
    else load();
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return { user, loading };
}
