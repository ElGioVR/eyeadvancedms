import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedUserId } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getDashboardData } from '@/lib/dashboard-data';
import { getPersonalPresencia } from '@/lib/personal-presencia';
import DashboardContent from './DashboardContent';
import DashboardLoading from './loading';

// UUID de doctor válido (evita que un valor arbitrario llegue a la consulta).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchDashboardData(doctorParam?: string) {
  // El middleware ya verificó la sesión en esta petición: sin segundo viaje a Auth
  const userId = await getVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  const { data: perfil, error: perfilError } = await getSupabaseAdmin()
    .from('usuarios')
    .select('nombre, email, avatar_url, rol')  // (la tabla no tiene columna iniciales)
    .eq('id', userId)
    .maybeSingle();

  if (perfilError) console.error('[dashboard] perfil', perfilError.message);
  const nombre =
    perfil?.nombre?.trim() ||
    perfil?.email?.split('@')[0] ||
    'Usuario';
  const iniciales = nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const avatar_url = perfil?.avatar_url ?? null;
  const rol = perfil?.rol || 'doctor';
  // Enfermería (rol restringido) no ve indicadores de la clínica: su inicio es la agenda.
  if (rol === 'enfermero') redirect('/agenda');

  // «Ver como» (?doctor=) solo aplica a roles que pueden elegir doctor (no a un doctor).
  const doctorId = rol !== 'doctor' && doctorParam && UUID_RE.test(doctorParam) ? doctorParam : null;
  const [data, personal] = await Promise.all([getDashboardData({ doctorId }), getPersonalPresencia()]);

  return { data, personal, nombre, iniciales, avatar_url, rol, doctorId };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  const params = await searchParams;
  const { data, personal, nombre, iniciales, avatar_url, rol } = await fetchDashboardData(params.doctor);

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent data={data} userNombre={nombre} userIniciales={iniciales} userAvatarUrl={avatar_url} userRol={rol} personalInicial={personal} />
    </Suspense>
  );
}
