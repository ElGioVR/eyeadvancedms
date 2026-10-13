import { getSupabaseAdmin } from '@/lib/supabase/admin';

type TablaCatalogo = 'catalogo_estudios' | 'catalogo_procedimientos' | 'catalogo_consultas' | 'catalogo_quirurgico';

/**
 * ¿Ya existe un concepto con ese nombre (sin distinguir mayúsculas)?
 * Evita duplicados en los catálogos de Configuración → Conceptos.
 * `ojo` solo aplica al catálogo quirúrgico (mismo nombre con distinto ojo es válido).
 * Si la consulta falla devuelve false: el índice único de la base es la última barrera.
 */
export async function existeNombre(
  tabla: TablaCatalogo,
  nombre: string,
  opciones: { excluirId?: string; ojo?: string | null } = {},
): Promise<boolean> {
  const exacto = nombre.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  if (!exacto) return false;

  let query = getSupabaseAdmin().from(tabla).select('id').ilike('nombre', exacto).limit(1);
  if (opciones.excluirId) query = query.neq('id', opciones.excluirId);
  if (tabla === 'catalogo_quirurgico') {
    query = opciones.ojo ? query.eq('ojo', opciones.ojo) : query.is('ojo', null);
  }
  const { data, error } = await query;
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
