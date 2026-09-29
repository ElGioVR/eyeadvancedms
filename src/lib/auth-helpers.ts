import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { obtenerPerfil } from '@/lib/supabase/server';

/** Caché corta por instancia del vínculo usuario → doctor (cambia muy poco). */
const DOCTOR_TTL_MS = 30_000;
const doctorPorUsuario = new Map<string, { promise: Promise<string | null>; hasta: number }>();

/** Olvida el vínculo memorizado (llamar si cambia doctores.usuario_id). */
export function invalidarDoctorDeUsuario(userId?: string): void {
  if (userId) doctorPorUsuario.delete(userId);
  else doctorPorUsuario.clear();
}

/**
 * Resolve doctor_id from the authenticated user's session.
 * Returns null if the user is not a doctor or has no linked doctor record.
 */
export async function resolveDoctorId(userId: string): Promise<string | null> {
  const ahora = Date.now();
  const hit = doctorPorUsuario.get(userId);
  if (hit && hit.hasta > ahora) return hit.promise;

  const promise = Promise.resolve(
    getSupabaseAdmin().from('doctores').select('id').eq('usuario_id', userId).maybeSingle(),
  ).then(({ data, error }) => {
    if (error) doctorPorUsuario.delete(userId); // no cachear fallos
    return (data?.id as string | undefined) ?? null;
  });
  if (doctorPorUsuario.size > 2000) doctorPorUsuario.clear();
  doctorPorUsuario.set(userId, { promise, hasta: ahora + DOCTOR_TTL_MS });
  return promise;
}

/**
 * Check if the user has modo_focus enabled (doctor-jefe only).
 * Returns true only if user is doctor_jefe (admin with doctor link) and modo_focus is ON.
 */
export async function isModoFocus(userId: string): Promise<boolean> {
  // Usa el perfil ya memorizado por requireAuth() (sin otra consulta a `usuarios`)
  const perfil = await obtenerPerfil(userId);
  if (!perfil || perfil.rol !== 'admin') return false;
  return perfil.preferencias.modo_focus === true;
}
