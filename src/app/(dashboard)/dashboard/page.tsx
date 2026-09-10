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
    .select('nombre, iniciales')
    .eq('id', user.id)
    .maybeSingle();

  const nombre = profile?.nombre || user.user_metadata?.nombre || 'Usuario';
  const iniciales = profile?.iniciales || nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const data = await getDashboardData();

  return { data, nombre, iniciales };
}

export default async function DashboardPage() {
  const { data, nombre, iniciales } = await fetchDashboardData();

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent data={data} userNombre={nombre} userIniciales={iniciales} />
    </Suspense>
  );
}
