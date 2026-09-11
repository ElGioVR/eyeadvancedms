import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/dashboard-data';
import DashboardContent from './DashboardContent';
import DashboardLoading from './loading';

async function fetchDashboardData() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('usuarios')
    .select('nombre, iniciales, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const nombre = profile?.nombre || user.user_metadata?.nombre || 'Usuario';
  const iniciales = profile?.iniciales || nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const avatar_url = profile?.avatar_url ?? null;

  const data = await getDashboardData();

  return { data, nombre, iniciales, avatar_url };
}

export default async function DashboardPage() {
  const { data, nombre, iniciales, avatar_url } = await fetchDashboardData();

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent data={data} userNombre={nombre} userIniciales={iniciales} userAvatarUrl={avatar_url} />
    </Suspense>
  );
}
