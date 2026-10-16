import { NextResponse } from 'next/server';
export type UserRole = 'admin' | 'doctor' | 'recepcionista' | 'enfermero';
/** Rol con el que «inicia sesión» cada prueba. */
export const sesion: { rol: UserRole } = { rol: 'admin' };
export async function requireAuth() { return { user: { id: '00000000-0000-0000-0000-0000000000aa' }, perfil: { rol: sesion.rol, activo: true } }; }
export async function requireRole(_u: unknown, roles: readonly string[]) {
  return roles.includes(sesion.rol) ? null : NextResponse.json({ error: 'No autorizado' }, { status: 403 });
}
export async function leerConRol<T>(rolP: Promise<NextResponse | null>, trabajo: () => Promise<T>) {
  const datos = await trabajo();
  const denegado = await rolP;
  return denegado ? { denegado } : { datos };
}
export function obtenerPerfil() { return Promise.resolve({ rol: sesion.rol, activo: true }); }
