import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { SESION_TEMPORAL_COOKIE } from '@/lib/supabase/constants';

export async function POST() {
  const supabase = createClient();
  try {
    // Sin sesión (o token ya revocado) signOut devuelve error: igual se limpian cookies.
    const { error } = await supabase.auth.signOut();
    if (error) console.error('[auth.logout]', error.message);
  } catch (err) {
    console.error('[auth.logout]', err);
  }
  try {
    cookies().delete(SESION_TEMPORAL_COOKIE);
  } catch {
    // Sin cookie que borrar
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
