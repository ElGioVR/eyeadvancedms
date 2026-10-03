import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';
import { normalizarTelefonos, telefonoPrincipal, telefonosBusqueda, type TelefonoPaciente } from '@/lib/telefonos-paciente';

/** Esquema de la lista de teléfonos que envían los formularios. */
export const telefonosSchema = z
  .array(
    z.object({
      numero: z.string().max(20),
      etiqueta: z.string().max(20).optional(),
      principal: z.boolean().optional(),
    }).strict(),
  )
  .max(3);

/** Columnas a guardar a partir de la lista (el principal también va en `telefono`). */
export function columnasTelefonos(lista: Array<{ numero: string; etiqueta?: string; principal?: boolean }>) {
  const limpia = normalizarTelefonos(lista as Array<Partial<TelefonoPaciente>>);
  return {
    telefonos: limpia,
    telefonos_busqueda: telefonosBusqueda(limpia) || null,
    telefono: telefonoPrincipal(limpia),
  };
}

/** ¿El error es porque la BD aún no tiene las columnas de teléfonos (mig. 1800000000470)? */
export const faltanColumnasTelefonos = (error: { message?: string; details?: string | null } | null | undefined) =>
  !!error && /telefonos/.test(`${error.message ?? ''} ${error.details ?? ''}`);

/**
 * Teléfonos de uno o más pacientes. Tolerante: sin las columnas nuevas devuelve
 * la lista armada con el teléfono suelto.
 */
export async function leerTelefonos(ids: string[]): Promise<Map<string, TelefonoPaciente[]>> {
  const mapa = new Map<string, TelefonoPaciente[]>();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return mapa;
  const supabase = getSupabaseAdmin();
  const r = await supabase.from('pacientes').select('id, telefono, telefonos').in('id', unicos);
  if (r.error) {
    const r2 = await supabase.from('pacientes').select('id, telefono').in('id', unicos);
    for (const p of (r2.data || []) as Array<{ id: string; telefono: string | null }>) mapa.set(p.id, normalizarTelefonos([], p.telefono));
    return mapa;
  }
  for (const p of (r.data || []) as Array<{ id: string; telefono: string | null; telefonos: TelefonoPaciente[] | null }>) {
    const lista = Array.isArray(p.telefonos) ? p.telefonos : [];
    // Si otra pantalla cambió solo `telefono`, ese número manda como principal.
    const d = (p.telefono || '').replace(/\D/g, '');
    const incluido = !d || lista.some((t) => (t.numero || '').replace(/\D/g, '') === d);
    const base = incluido ? lista : [{ numero: p.telefono as string, etiqueta: 'Celular' as const, principal: true }, ...lista.map((t) => ({ ...t, principal: false }))];
    mapa.set(p.id, normalizarTelefonos(base, p.telefono));
  }
  return mapa;
}
