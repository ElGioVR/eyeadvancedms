/**
 * `fetch` con tiempo límite para los clientes de Supabase.
 *
 * Sin esto, si PostgREST o la red se cuelgan, la función serverless espera
 * hasta su propio límite (10–60 s) y el usuario ve un spinner eterno.
 * - REST / Auth / RPC: 25 s (imports y sync por lotes caben de sobra; la BD
 *   además corta cada sentencia a los 30 s con statement_timeout).
 * - Storage (subida/descarga de archivos): 60 s.
 * Si la petición ya trae su propia señal, se respetan ambas.
 */
export const TIMEOUT_DB_MS = 25_000;
export const TIMEOUT_STORAGE_MS = 60_000;

function limitePara(url: string): number {
  return url.includes('/storage/v1/') ? TIMEOUT_STORAGE_MS : TIMEOUT_DB_MS;
}

function combinar(a: AbortSignal | null | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === 'function') return any([a, b]);
  return a; // entornos sin AbortSignal.any: se respeta la señal original
}

export const fetchConTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const signal = combinar(init?.signal, AbortSignal.timeout(limitePara(url)));
  return fetch(input, { ...init, signal });
};
