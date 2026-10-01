import { getVerifiedUserId } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AgendaContent from './AgendaContent';

export default async function AgendaPage() {
  // Sesión ya verificada por el middleware (evita otro viaje a Supabase Auth)
  const userId = await getVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }
  const supabase = getSupabaseAdmin();

  // Usuario y doctores en paralelo (evita waterfall)
  const [{ data: usuario }, { data: doctores, error: doctoresError }] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, rol, activo').eq('id', userId).single(),
    // Personal unificado (médicos y enfermería); sin las columnas de la mig. 390, como antes.
    (async () => {
      const r = await supabase.from('doctores').select('id, alias, usuario_id, tipo_personal, cobra_honorarios').eq('activo', true).order('alias');
      if (!r.error) return r;
      return supabase.from('doctores').select('id, alias, usuario_id').eq('activo', true).order('alias');
    })(),
  ]);

  if (!usuario || usuario.activo === false || !['admin', 'doctor', 'recepcionista', 'enfermero'].includes(usuario.rol)) {
    redirect('/dashboard');
  }

  if (doctoresError) {
    console.error('[agenda] error cargando doctores:', doctoresError.message);
  }

  return (
    <AgendaContent
      userRol={usuario.rol}
      doctores={doctores || []}
      userId={userId}
      initialDate={new Date().toISOString().slice(0, 10)}
    />
  );
}
