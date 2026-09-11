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
        const { data: { user: authUser }, error: getUserError } = await supabase.auth.getUser();

        let finalAuthUser = authUser;

        if (!finalAuthUser) {
          const { data: { session } } = await supabase.auth.getSession();
          finalAuthUser = session?.user ?? null;
        }

        if (!finalAuthUser) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('usuarios')
          .select('id,nombre,rol,activo,avatar_url')
          .eq('id', finalAuthUser.id)
          .single();

        const nombre = profile?.nombre || finalAuthUser.user_metadata?.nombre || '';
        const rol = profile?.rol || finalAuthUser.user_metadata?.rol || 'recepcionista';

        setUser({
          id: finalAuthUser.id,
          email: finalAuthUser.email || '',
          nombre,
          rol,
          iniciales: getInitials(nombre, finalAuthUser.email || ''),
          avatar_url: profile?.avatar_url ?? null,
          last_sign_in_at: finalAuthUser.last_sign_in_at ?? null,
          created_at: finalAuthUser.created_at,
        });
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
