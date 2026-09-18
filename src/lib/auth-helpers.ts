import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Resolve doctor_id from the authenticated user's session.
 * Returns null if the user is not a doctor or has no linked doctor record.
 */
export async function resolveDoctorId(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('doctores')
    .select('id')
    .eq('usuario_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Check if the user has modo_focus enabled (doctor-jefe only).
 * Returns true only if user is doctor_jefe (admin with doctor link) and modo_focus is ON.
 */
export async function isModoFocus(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('usuarios')
    .select('rol, preferencias')
    .eq('id', userId)
    .maybeSingle();

  if (!data || data.rol !== 'admin') return false;

  const prefs = typeof data.preferencias === 'object' && data.preferencias !== null
    ? data.preferencias as Record<string, unknown>
    : {};
  return prefs.modo_focus === true;
}
