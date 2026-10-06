import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/dashboard-data';
import { memo } from '@/lib/cache-memoria';
import { hoyTijuana } from '@/lib/rangos';
import { ruta } from '@/lib/api/ruta';

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Rol restringido (solo agenda propia): sin acceso a métricas, montos ni catálogo de precios
  if (auth.perfil?.rol === 'enfermero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Datos iguales para todos los roles con acceso → 1 cálculo cada 15 s por instancia
  // (antes: 5 consultas por usuario en cada refresco de 30 s).
  const data = await memo(`dashboard:datos:${hoyTijuana()}`, 15_000, getDashboardData);
  return NextResponse.json(data);
}

export const GET = ruta('dashboard#GET', manejarGET);
