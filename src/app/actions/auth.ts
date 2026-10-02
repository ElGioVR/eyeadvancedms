'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesionActual } from '@/services/sesion-unica';

export async function logout() {
  await cerrarSesionActual(createClient());
  redirect('/login');
}
