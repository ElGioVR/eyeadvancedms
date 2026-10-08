import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { getPersonalPresencia } from '@/lib/personal-presencia';
import { memo } from '@/lib/cache-memoria';
import { ruta } from '@/lib/api/ruta';

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (auth.perfil?.rol === 'enfermero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const datos = await memo('dashboard:personal', 15_000, getPersonalPresencia);
  return NextResponse.json(datos);
}

export const GET = ruta('dashboard.personal#GET', manejarGET);
