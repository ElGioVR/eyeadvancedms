/**
 * Utilidades de lectura por lotes para PostgREST/Supabase.
 *
 * - `leerTodo`: pagina con `.range()` para no truncar en el límite de filas
 *   del servidor (1000 por defecto en Supabase) sin que el llamador lo note.
 * - `inEnLotes`: parte listas grandes de ids para `.in()` (evita URLs enormes
 *   que PostgREST/Kong rechazan) y ejecuta los lotes en paralelo.
 */

type Resultado<T> = { data: T[] | null; error: { message: string } | null };

export const TAM_PAGINA_PG = 1000;
const MAX_FILAS_DEFECTO = 20000;
const TAM_LOTE_IN = 150;

/**
 * Lee todas las filas de una consulta paginando con `.range()`.
 * `construir(desde, hasta)` debe devolver la consulta con orden determinista
 * y `.range(desde, hasta)` aplicado. En el caso común (<1000 filas) es 1 solo viaje.
 */
export async function leerTodo<T>(
  construir: (desde: number, hasta: number) => PromiseLike<Resultado<T>>,
  maxFilas = MAX_FILAS_DEFECTO
): Promise<T[]> {
  const filas: T[] = [];
  for (let inicio = 0; inicio < maxFilas; inicio += TAM_PAGINA_PG) {
    const { data, error } = await construir(inicio, inicio + TAM_PAGINA_PG - 1);
    if (error) throw new Error(error.message);
    const lote = data || [];
    filas.push(...lote);
    if (lote.length < TAM_PAGINA_PG) break;
  }
  return filas;
}

/** Ejecuta `consulta(lote)` sobre ids únicos en lotes paralelos y concatena. */
export async function inEnLotes<T>(
  ids: Iterable<string | null | undefined>,
  consulta: (lote: string[]) => PromiseLike<Resultado<T>>,
  tamLote = TAM_LOTE_IN
): Promise<T[]> {
  const unicos = [...new Set([...ids].filter((v): v is string => !!v))];
  if (unicos.length === 0) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += tamLote) lotes.push(unicos.slice(i, i + tamLote));
  const resultados = await Promise.all(lotes.map((l) => consulta(l)));
  const filas: T[] = [];
  for (const { data, error } of resultados) {
    if (error) throw new Error(error.message);
    if (data) filas.push(...data);
  }
  return filas;
}
