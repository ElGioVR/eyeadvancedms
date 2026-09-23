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

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .single();

  if (!usuario || !['admin', 'doctor', 'recepcionista'].includes(usuario.rol)) {
    redirect('/dashboard');
  }

  const { data: doctores, error: doctoresError } = await getSupabaseAdmin()
    .from('doctores')
    .select('id, nombre_completo, usuario_id')
    .eq('activo', true)
    .order('nombre_completo');

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
