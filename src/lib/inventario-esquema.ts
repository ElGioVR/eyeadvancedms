import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Esquema real de `inventario_items`, detectado leyendo una fila con `select('*')`
 * (nunca falla por columnas inexistentes). Antes cada pantalla "probaba" primero el
 * esquema legacy (marca/modelo/tipo_lio) y, al fallar, reintentaba con el nuevo:
 * la app funcionaba, pero cada carga dejaba errores 42703 en los logs de Postgres.
 *
 * Se cachea por instancia 10 min. Con la tabla vacía (o si la lectura falla) el
 * esquema queda "desconocido" y los llamadores conservan su cascada original.
 */
export interface EsquemaInventario {
  conocido: boolean;
  /** Columnas legacy disponibles (marca/modelo/lote/fecha_caducidad). */
  legacy: boolean;
  columnas: ReadonlySet<string>;
}

const DESCONOCIDO: EsquemaInventario = { conocido: false, legacy: false, columnas: new Set() };
const TTL_MS = 10 * 60_000;
let cache: { valor: EsquemaInventario; hasta: number } | null = null;

export async function esquemaInventario(supabase: SupabaseClient): Promise<EsquemaInventario> {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  const { data, error } = await supabase.from('inventario_items').select('*').limit(1);
  const fila = !error && Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!fila) return DESCONOCIDO;
  const columnas = new Set(Object.keys(fila));
  const valor: EsquemaInventario = { conocido: true, legacy: columnas.has('marca'), columnas };
  cache = { valor, hasta: Date.now() + TTL_MS };
  return valor;
}

/** Deja solo las columnas que existen (si el esquema es conocido). */
export function soloExistentes(esquema: EsquemaInventario, columnas: string[]): string[] {
  return esquema.conocido ? columnas.filter((c) => esquema.columnas.has(c)) : columnas;
}
