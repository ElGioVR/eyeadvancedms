import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/dashboard-data';
import DashboardContent from './DashboardContent';
import DashboardLoading from './loading';

async function fetchDashboardData(doctorId?: string) {
  const supabase = createClient();
  const userPromise = supabase.auth.getUser();

  // Perfil y datos del dashboard en paralelo (evita waterfall de 3 round-trips)
  const user = (await userPromise).data.user;

  if (!user) {
    redirect('/login');
  }

  const perfilPromise = supabase
    .from('usuarios')
    .select('nombre, iniciales, avatar_url, rol')
    .eq('id', user.id)
    .maybeSingle();

  const [perfilResult, data] = await Promise.all([perfilPromise, getDashboardData()]);

  const nombre = perfilResult.data?.nombre || user.user_metadata?.nombre || 'Usuario';
  const iniciales = perfilResult.data?.iniciales || nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const avatar_url = perfilResult.data?.avatar_url ?? null;
  const rol = perfilResult.data?.rol || 'doctor';

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
