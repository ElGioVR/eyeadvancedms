/**
 * Lectura por lotes para listados grandes de Supabase.
 *
 * Supabase (PostgREST) devuelve como máximo 1000 filas por petición (`max_rows` por
 * defecto) aunque se pida `.limit(2000)`, sin marcar error. La agenda del mes perdía
 * así en silencio lo posterior a la fila 1000 (los últimos días del periodo) y, como
 * el orden no era total, la parte perdida cambiaba entre refrescos (intermitencia).
 *
 * Regla: el builder que devuelve `construir` debe tener un ORDEN TOTAL (p. ej. fecha,
 * hora, id); sin desempate los lotes por rango pueden repetir u omitir filas.
 * Sin dependencias en tiempo de ejecución (se prueba en __tests__/leer-por-lotes.test.ts).
 */

/** Filas por petición (igual al `max_rows` por defecto de Supabase). */
export const LOTE_FILAS = 1000;
/** Tope duro de filas por fuente. */
export const MAX_FILAS_FUENTE = 10_000;

export interface ResultadoLotes<T> { data: T[]; error: unknown; truncado: boolean }

/**
 * Lee hasta `tope` filas por lotes `.range()`. `construir` crea un builder nuevo en
 * cada lote (los builders de supabase-js acumulan filtros y no se reutilizan).
 * `truncado` = se llegó al tope y puede haber más filas.
 */
export async function leerPorLotes<T>(
  construir: () => { range: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
  tope: number = MAX_FILAS_FUENTE,
  lote: number = LOTE_FILAS,
): Promise<ResultadoLotes<T>> {
  const filas: T[] = [];
  const limite = Math.max(0, Math.min(tope, MAX_FILAS_FUENTE));
  for (let desde = 0; desde < limite; desde += lote) {
    const hasta = Math.min(desde + lote, limite) - 1;
    const { data, error } = await construir().range(desde, hasta);
    if (error) return { data: filas, error, truncado: false };
    const recibidas = data || [];
    filas.push(...recibidas);
    if (recibidas.length < hasta - desde + 1) return { data: filas, error: null, truncado: false };
  }
  return { data: filas, error: null, truncado: limite > 0 };
}
