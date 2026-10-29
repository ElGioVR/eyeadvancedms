/**
 * Permisos del módulo Agenda: fuente única para la UI y las rutas API.
 * Sin dependencias en tiempo de ejecución (se prueba en
 * src/lib/__tests__/permisos-agenda.test.ts).
 *
 * - Todos los roles (admin, recepcionista, doctor y enfermero) tienen control total
 *   (ver todo, crear, editar, mover, aplazar, reagendar y cancelar consultas,
 *   estudios y cirugías).
 * - Doctor y enfermero tienen además un check «Solo lo mío» en la pantalla de
 *   Agenda: es un filtro voluntario, no una restricción de permisos.
 * - El borrado definitivo (admin) y la importación (admin/recepción) no cambian.
 */
import type { UserRole } from '@/lib/supabase/server';

/** Roles que pueden ver la agenda. */
export const ROLES_VER_AGENDA: readonly UserRole[] = ['admin', 'doctor', 'recepcionista', 'enfermero'];

/** Roles que administran la agenda (crear / editar / mover / cambiar estado). */
export const ROLES_GESTION_AGENDA: readonly UserRole[] = ['admin', 'recepcionista', 'doctor', 'enfermero'];

/** Roles que pueden anular una cirugía ya marcada como completada. */
export const ROLES_ANULAR_CIRUGIA: readonly UserRole[] = ['admin', 'doctor', 'recepcionista'];

/** Roles que importan agenda desde Excel/CSV. */
export const ROLES_IMPORTAR_AGENDA: readonly UserRole[] = ['admin', 'recepcionista'];

export function puedeGestionarAgenda(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_GESTION_AGENDA as readonly string[]).includes(rol);
}

export function puedeAnularCirugia(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_ANULAR_CIRUGIA as readonly string[]).includes(rol);
}

/**
 * Antes limitaba a enfermería a su propia agenda. Ahora todos ven y gestionan todo:
 * se conserva la función (siempre false) por compatibilidad con quienes la consultan.
 */
export function agendaSoloPropia(rol: string | null | undefined): boolean {
  void rol;
  return false;
}

/** Roles con ficha de personal propia que pueden activar el filtro «Solo lo mío». */
export function puedeFiltrarSoloMio(rol: string | null | undefined): boolean {
  return rol === 'doctor' || rol === 'enfermero';
}
