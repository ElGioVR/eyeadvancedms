import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedUserId } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getDashboardData } from '@/lib/dashboard-data';
import DashboardContent from './DashboardContent';
import DashboardLoading from './loading';

async function fetchDashboardData(doctorId?: string) {
  void doctorId;
  // El middleware ya verificó la sesión en esta petición: sin segundo viaje a Auth
  const userId = await getVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  // Perfil y datos del dashboard en paralelo
  const perfilPromise = getSupabaseAdmin()
    .from('usuarios')
    .select('nombre, email, avatar_url, rol')  // (la tabla no tiene columna iniciales)
    .eq('id', userId)
    .maybeSingle();

  const [perfilResult, data] = await Promise.all([perfilPromise, getDashboardData()]);

  if (perfilResult.error) console.error('[dashboard] perfil', perfilResult.error.message);
  const nombre =
    perfilResult.data?.nombre?.trim() ||
    perfilResult.data?.email?.split('@')[0] ||
    'Usuario';
  const iniciales = nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const avatar_url = perfilResult.data?.avatar_url ?? null;
  const rol = perfilResult.data?.rol || 'doctor';
  // Enfermería (rol restringido) no ve indicadores de la clínica: su inicio es la agenda.
  if (rol === 'enfermero') redirect('/agenda');

  return { data, nombre, iniciales, avatar_url, rol };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  const params = await searchParams;
  const { data, nombre, iniciales, avatar_url, rol } = await fetchDashboardData(params.doctor);

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent data={data} userNombre={nombre} userIniciales={iniciales} userAvatarUrl={avatar_url} userRol={rol} />
    </Suspense>
  );
}
