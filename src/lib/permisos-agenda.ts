/**
 * Permisos del módulo Agenda: fuente única para la UI y las rutas API.
 * Sin dependencias en tiempo de ejecución (se prueba en
 * src/lib/__tests__/permisos-agenda.test.ts).
 *
 * - admin, recepcionista y doctor: acceso total (ver todo, crear, editar,
 *   mover, aplazar, reagendar y cancelar consultas, estudios y cirugías).
 * - enfermero: solo consulta su propia ocupación.
 * - El borrado definitivo (admin) y la importación (admin/recepción) no cambian.
 */
import type { UserRole } from '@/lib/supabase/server';

/** Roles que pueden ver la agenda. */
export const ROLES_VER_AGENDA: readonly UserRole[] = ['admin', 'doctor', 'recepcionista', 'enfermero'];

/** Roles que administran la agenda (crear / editar / mover / cambiar estado). */
export const ROLES_GESTION_AGENDA: readonly UserRole[] = ['admin', 'recepcionista', 'doctor'];

/** Roles que importan agenda desde Excel/CSV. */
export const ROLES_IMPORTAR_AGENDA: readonly UserRole[] = ['admin', 'recepcionista'];

export function puedeGestionarAgenda(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_GESTION_AGENDA as readonly string[]).includes(rol);
}

/** true = el rol solo ve (y no administra) su propia ocupación. */
export function agendaSoloPropia(rol: string | null | undefined): boolean {
  return rol === 'enfermero';
}
