import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/dashboard-data';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Rol restringido (solo agenda propia): sin acceso a métricas, montos ni catálogo de precios
  if (auth.perfil?.rol === 'enfermero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const data = await getDashboardData();
  return NextResponse.json(data);
}
