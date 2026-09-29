/**
 * Utilidades de lectura por lotes para PostgREST/Supabase.
 *
 * - `leerTodo`: pagina con `.range()` para no truncar en el límite de filas
 *   del servidor (1000 por defecto en Supabase) sin que el llamador lo note.
 * - `inEnLotes`: parte listas grandes de ids para `.in()` (evita URLs enormes
 *   que PostgREST/Kong rechazan) y ejecuta los lotes en paralelo (con límite).
 * - `leerTodoEnLotes`: combinación de ambas (lotes de ids × paginación).
 * - `mapConLimite`: pool de concurrencia que preserva el orden de resultados.
 */

type Resultado<T> = { data: T[] | null; error: { message: string } | null };

export const TAM_PAGINA_PG = 1000;
const MAX_FILAS_DEFECTO = 20000;
const TAM_LOTE_IN = 150;
/** Máximo de viajes simultáneos a la BD desde un mismo request. */
export const CONCURRENCIA_BD = 6;

/**
 * Aplica `fn` a cada elemento con a lo sumo `limite` promesas en vuelo.
 * El arreglo resultante conserva el orden de `items` (no el de terminación).
 * Si alguna llamada rechaza, la promesa rechaza con ese error (las que ya
 * estaban en vuelo terminan, pero no se inician nuevas).
 */
export async function mapConLimite<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;
  let fallo = false;
  const trabajador = async () => {
    while (!fallo) {
      const i = siguiente++;
      if (i >= items.length) return;
      try {
        resultados[i] = await fn(items[i], i);
      } catch (err) {
        fallo = true;
        throw err;
      }
    }
  };
  const n = Math.max(1, Math.min(limite, items.length));
  await Promise.all(Array.from({ length: n }, trabajador));
  return resultados;
}

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

function lotesUnicos(ids: Iterable<string | null | undefined>, tamLote: number): string[][] {
  const unicos = [...new Set([...ids].filter((v): v is string => !!v))];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += tamLote) lotes.push(unicos.slice(i, i + tamLote));
  return lotes;
}

/** Ejecuta `consulta(lote)` sobre ids únicos en lotes (≤ CONCURRENCIA_BD a la vez) y concatena. */
export async function inEnLotes<T>(
  ids: Iterable<string | null | undefined>,
  consulta: (lote: string[]) => PromiseLike<Resultado<T>>,
  tamLote = TAM_LOTE_IN
): Promise<T[]> {
  const lotes = lotesUnicos(ids, tamLote);
  if (lotes.length === 0) return [];
  const resultados = await mapConLimite(lotes, CONCURRENCIA_BD, async (l) => consulta(l));
  const filas: T[] = [];
  for (const { data, error } of resultados) {
    if (error) throw new Error(error.message);
    if (data) filas.push(...data);
  }
  return filas;
}

/**
 * Como `inEnLotes`, pero cada lote además se pagina con `.range()` (para
 * relaciones 1:N donde un lote de ids puede devolver más de 1000 filas).
 * `construir(lote, desde, hasta)` debe aplicar orden determinista y `.range()`.
 */
export async function leerTodoEnLotes<T>(
  ids: Iterable<string | null | undefined>,
  construir: (lote: string[], desde: number, hasta: number) => PromiseLike<Resultado<T>>,
  tamLote = TAM_LOTE_IN
): Promise<T[]> {
  const lotes = lotesUnicos(ids, tamLote);
  if (lotes.length === 0) return [];
  const resultados = await mapConLimite(lotes, CONCURRENCIA_BD, (l) =>
    leerTodo<T>((a, b) => construir(l, a, b))
  );
  return resultados.flat();
}
