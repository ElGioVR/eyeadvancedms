'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface User {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  iniciales: string;
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
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      // Get profile from usuarios table
      const { data: profile } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', authUser.id)
        .single();

      const nombre = profile?.nombre || authUser.user_metadata?.nombre || '';
      const rol = profile?.rol || authUser.user_metadata?.rol || 'recepcionista';

      setUser({
        id: authUser.id,
        email: authUser.email || '',
        nombre,
        rol,
        iniciales: getInitials(nombre, authUser.email || ''),
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        created_at: authUser.created_at,
      });
      setLoading(false);
    }

    getUser();
  }, []);

  return { user, loading };
}
