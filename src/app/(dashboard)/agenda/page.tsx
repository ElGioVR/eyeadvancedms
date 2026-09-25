import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AgendaContent from './AgendaContent';

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Usuario y doctores en paralelo (evita waterfall)
  const [{ data: usuario }, { data: doctores, error: doctoresError }] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, rol').eq('id', user.id).single(),
    getSupabaseAdmin().from('doctores').select('id, alias, usuario_id').eq('activo', true).order('alias'),
  ]);

  if (!usuario || !['admin', 'doctor', 'recepcionista'].includes(usuario.rol)) {
    redirect('/dashboard');
  }

  if (doctoresError) {
    console.error('[agenda] error cargando doctores:', doctoresError.message);
  }

  return (
    <AgendaContent
      userRol={usuario.rol}
      doctores={doctores || []}
      userId={user.id}
      initialDate={new Date().toISOString().slice(0, 10)}
    />
  );
}
