'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface User {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  iniciales: string;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  doctor_id: string | null;
}

function getInitials(name: string, email: string): string {
  if (name) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();

        let finalAuthUser = authUser;

        if (!finalAuthUser) {
          const { data: { session } } = await supabase.auth.getSession();
          finalAuthUser = session?.user ?? null;
        }

        if (!finalAuthUser) {
          setLoading(false);
          return;
        }

        // Get full profile + doctor_id from server endpoint (has service_role)
        const meRes = await fetch('/api/usuarios/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser({
            id: meData.id,
            email: meData.email || finalAuthUser.email || '',
            nombre: meData.nombre || finalAuthUser.user_metadata?.nombre || '',
            rol: meData.rol || 'recepcionista',
            iniciales: meData.iniciales || getInitials(meData.nombre || '', meData.email || ''),
            avatar_url: meData.avatar_url ?? null,
            last_sign_in_at: finalAuthUser.last_sign_in_at ?? null,
            created_at: finalAuthUser.created_at,
            doctor_id: meData.doctor_id ?? null,
          });
        } else {
          // Fallback without doctor_id
          setUser({
            id: finalAuthUser.id,
            email: finalAuthUser.email || '',
            nombre: finalAuthUser.user_metadata?.nombre || '',
            rol: finalAuthUser.user_metadata?.rol || 'recepcionista',
            iniciales: getInitials(finalAuthUser.user_metadata?.nombre || '', finalAuthUser.email || ''),
            avatar_url: null,
            last_sign_in_at: finalAuthUser.last_sign_in_at ?? null,
            created_at: finalAuthUser.created_at,
            doctor_id: null,
          });
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setLoading(false);
      }
    }

    getUser();
  }, []);

  return { user, loading };
}
