export type UserRole = 'admin' | 'doctor' | 'recepcionista' | 'enfermero';
export async function requireAuth() { return { user: { id: '00000000-0000-0000-0000-0000000000aa' }, perfil: { rol: 'admin', activo: true } }; }
export async function requireRole() { return null; }
export function obtenerPerfil() { return Promise.resolve({ rol: 'admin', activo: true }); }
