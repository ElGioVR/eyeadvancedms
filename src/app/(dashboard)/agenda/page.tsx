import { createClient } from '@/lib/supabase/server';
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

  const { data: doctores } = await supabase
    .from('doctores')
    .select('id, nombre_completo')
    .eq('activo', true)
    .order('nombre_completo');

  return (
    <AgendaContent
      userRol={usuario.rol}
      doctores={doctores || []}
    />
  );
}
