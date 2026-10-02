'use client';

/**
 * Caché de precarga en memoria (por pestaña) para respuestas JSON.
 * La pantalla de bienvenida dispara `prefetchJSON()`; las pantallas consumen
 * el resultado con `takePrefetched()` en su primer render en vez de volver a
 * pedirlo. Las entradas caducan (TTL) para no mostrar datos viejos.
 */
interface Entry {
  promise: Promise<unknown>;
  at: number;
}

const store = new Map<string, Entry>();
// Corto: la agenda y los pacientes cambian por acción de otros usuarios.
const DEFAULT_TTL = 30_000;

async function getJSON(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Inicia (o reutiliza) la descarga de `url`. Nunca rechaza: devuelve null si falla. */
export function prefetchJSON<T = unknown>(url: string, ttlMs = DEFAULT_TTL): Promise<T | null> {
  const now = Date.now();
  const hit = store.get(url);
  if (hit && now - hit.at < ttlMs) return hit.promise as Promise<T | null>;
  const promise = getJSON(url).catch(() => {
    store.delete(url); // no cachear errores
    return null;
  });
  store.set(url, { promise, at: now });
  return promise as Promise<T | null>;
}

/**
 * Consume una precarga reciente (una sola vez). Devuelve null si no hay o expiró;
 * en ese caso el llamador hace su fetch normal.
 */
export function takePrefetched<T = unknown>(url: string, maxAgeMs = DEFAULT_TTL): Promise<T | null> | null {
  const hit = store.get(url);
  if (!hit) return null;
  store.delete(url);
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.promise as Promise<T | null>;
}

/** Limpia todas las precargas (al cerrar sesión). */
export function clearPrefetched(): void {
  store.clear();
}
