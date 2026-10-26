import { NextResponse } from 'next/server';
export type UserRole = 'admin' | 'doctor' | 'recepcionista' | 'enfermero';
export type SesionUser = { id: string };
/** Usuario con el que «inicia sesión» cada paso de la prueba. */
export const sesion: { id: string; rol: UserRole } = { id: 'u-admin', rol: 'admin' };
export async function requireAuth() { return { user: { id: sesion.id }, perfil: { rol: sesion.rol, activo: true } }; }
export async function requireRole(_u: unknown, roles: readonly string[]) {
  return roles.includes(sesion.rol) ? null : NextResponse.json({ error: 'No autorizado' }, { status: 403 });
}
export function obtenerPerfil() { return Promise.resolve({ rol: sesion.rol, activo: true }); }
