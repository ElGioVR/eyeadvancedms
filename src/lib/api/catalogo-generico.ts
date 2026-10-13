import type { SupabaseClient } from '@supabase/supabase-js';

export type TipoServicio = 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO';

export const TABLA_GENERICA: Record<TipoServicio, string> = {
  CONSULTA: 'catalogo_consultas',
  ESTUDIO: 'catalogo_estudios',
  PROCEDIMIENTO: 'catalogo_procedimientos',
};

const escapar = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Busca un concepto genérico (catálogo general) por id o, si no, por nombre exacto.
 * Se usa como respaldo cuando el servicio no existe en la aseguranza elegida.
 * Devuelve null si no existe o la tabla aún no está creada.
 */
export async function buscarGenerico(
  supabase: SupabaseClient,
  tipo: TipoServicio,
  servicioId?: string | null,
  nombre?: string | null,
): Promise<{ id: string; nombre: string; costo: number } | null> {
  const tabla = TABLA_GENERICA[tipo];
  const base = () => supabase.from(tabla).select('id, nombre, costo').eq('activo', true);
  const fila = (d: { id: string; nombre: string; costo: number | string | null } | null) =>
    d ? { id: d.id, nombre: d.nombre, costo: Number(d.costo) || 0 } : null;

  if (servicioId) {
    const { data, error } = await base().eq('id', servicioId).limit(1).maybeSingle();
    if (!error && data) return fila(data);
  }
  if (nombre?.trim()) {
    const { data, error } = await base().ilike('nombre', escapar(nombre.trim())).limit(1).maybeSingle();
    if (!error && data) return fila(data);
  }
  return null;
}
