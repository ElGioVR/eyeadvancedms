import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { obtenerPerfil, type SesionUser, type UserRole } from '@/lib/supabase/server';

/**
 * Permisos del rol `enfermero` fuera de su agenda:
 * - Pacientes: solo lectura (sin cobros).
 * - Inventario: ver y gestionar (alta, edición, baja, movimientos) SOLO si su
 *   ficha de Personal médico tiene «Cobra honorarios» activo.
 * - Configuración: solo Perfil y Sistema (guardado en el cliente; las APIs del
 *   resto de pestañas ya exigen admin).
 */

/** ¿La ficha de personal ligada a este usuario tiene honorarios activos? */
export async function enfermeroCobraHonorarios(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('doctores')
    .select('cobra_honorarios')
    .eq('usuario_id', userId)
    .maybeSingle();
  // Sin columna (mig. 390 sin aplicar) o sin ficha ligada → sin acceso (conservador)
  if (error || !data) return false;
  return (data as { cobra_honorarios?: boolean }).cobra_honorarios === true;
}

/**
 * Como requireRole, pero si el usuario es `enfermero` además exige honorarios
 * activos. `rolesBase` son los roles que ya tenían acceso al endpoint.
 */
export async function requireRoleInventario(
  user: SesionUser,
  rolesBase: readonly UserRole[]
): Promise<NextResponse | null> {
  const perfil = await obtenerPerfil(user.id);
  if (!perfil || perfil.activo !== true) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (perfil.rol === 'enfermero') {
    if (await enfermeroCobraHonorarios(user.id)) return null;
    return NextResponse.json(
      { error: 'El inventario solo está disponible para enfermería con honorarios activos' },
      { status: 403 }
    );
  }
  if (!rolesBase.includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return null;
}
