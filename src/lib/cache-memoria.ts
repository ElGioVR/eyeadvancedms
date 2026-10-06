import 'server-only';

/**
 * Caché en memoria por instancia con TTL corto y deduplicación de peticiones
 * en vuelo: si 20 usuarios piden el dashboard a la vez, se calcula una vez.
 * Úsese solo para datos agregados iguales para todos (sin datos por usuario).
 */
const entradas = new Map<string, { valor: Promise<unknown>; hasta: number }>();

export function memo<T>(clave: string, ttlMs: number, calcular: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const e = entradas.get(clave);
  if (e && e.hasta > ahora) return e.valor as Promise<T>;
  const valor = calcular();
  entradas.set(clave, { valor, hasta: ahora + ttlMs });
  // Un error no se queda en caché.
  valor.catch(() => {
    if (entradas.get(clave)?.valor === valor) entradas.delete(clave);
  });
  if (entradas.size > 200) {
    entradas.forEach((v, k) => {
      if (v.hasta <= ahora) entradas.delete(k);
    });
  }
  return valor;
}

/** Invalida una clave (o todas las que empiezan con el prefijo). */
export function invalidarMemo(prefijo: string): void {
  entradas.forEach((_, k) => {
    if (k.startsWith(prefijo)) entradas.delete(k);
  });
}
