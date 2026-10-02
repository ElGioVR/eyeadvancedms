import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { SESION_TEMPORAL_COOKIE } from '@/lib/supabase/constants';
import { cerrarSesionActual } from '@/services/sesion-unica';

export async function POST() {
  await cerrarSesionActual(createClient());
  try {
    cookies().delete(SESION_TEMPORAL_COOKIE);
  } catch {
    // Sin cookie que borrar
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
