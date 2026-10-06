'use client';

import { takePrefetched } from '@/lib/prefetch';
import { AVISO_CIERRE_MS, EVENTO_SESION_REEMPLAZADA } from '@/lib/sesion-pestana';

/** Error de API con el código HTTP (para decidir reintentos y redirecciones). */
export class ApiError extends Error {
  status: number;
  /** Código de negocio opcional del API (p. ej. EMPALME_AGENDA, TIMEOUT). */
  code?: string;
  /** Cuerpo JSON del error (p. ej. `conflictos` de un 409). */
  datos?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, datos?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.datos = datos;
  }
}

let redirigiendo = false;

/** Mismo valor que CODIGO_SESION_REEMPLAZADA (lib/sesion-unica). */
const SESION_REEMPLAZADA = 'SESION_REEMPLAZADA';

/**
 * Sesión vencida o usuario desactivado → volver a /login (una sola vez).
 * Sesión tomada en otro dispositivo («Trabajar aquí») → se cierra la sesión
 * local (cookies) y se avisa en el login.
 */
function manejarSesion(status: number, code?: string) {
  if (status !== 401 || typeof window === 'undefined' || redirigiendo) return;
  if (window.location.pathname.startsWith('/login')) return;
  redirigiendo = true;
  if (code === SESION_REEMPLAZADA) {
    // Aviso «Cerrando sesión…» (PestanaUnica) y, tras unos segundos, cierre real.
    window.dispatchEvent(new Event(EVENTO_SESION_REEMPLAZADA));
    window.setTimeout(() => {
      void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .catch(() => undefined)
        .finally(() => window.location.assign('/login?motivo=otra-sesion'));
    }, AVISO_CIERRE_MS);
    return;
  }
  window.location.assign('/login');
}

async function leerError(res: Response): Promise<{ mensaje: string; code?: string; datos?: Record<string, unknown> }> {
  try {
    const j = (await res.json()) as { error?: unknown; code?: unknown } & Record<string, unknown>;
    const code = typeof j?.code === 'string' ? j.code : undefined;
    if (typeof j?.error === 'string' && j.error) return { mensaje: j.error, code, datos: j };
    if (code) return { mensaje: 'Error al cargar datos', code, datos: j };
  } catch {
    /* cuerpo vacío o no JSON */
  }
  if (res.status === 429) return { mensaje: 'Demasiadas solicitudes. Espera un momento.' };
  if (res.status === 403) return { mensaje: 'No tienes permiso para esta acción.' };
  if (res.status === 409) return { mensaje: 'Alguien más modificó este registro. Actualiza e intenta de nuevo.' };
  if (res.status === 413) return { mensaje: 'El archivo o la información es demasiado grande.' };
  if (res.status === 504) return { mensaje: MENSAJE_TIMEOUT };
  if (res.status >= 500) return { mensaje: 'Error del servidor. Intenta de nuevo.' };
  return { mensaje: 'Error al cargar datos' };
}

/** Tiempo máximo de espera de una petición del navegador (ms). */
export const TIMEOUT_CLIENTE_MS = 20_000;
/** Las mutaciones pueden tardar más (archivos, imports, reportes). */
export const TIMEOUT_MUTACION_MS = 45_000;

export const MENSAJE_SIN_CONEXION = 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_TIMEOUT = 'El servidor tardó demasiado en responder. Intenta de nuevo.';

function combinarSenal(propia: AbortSignal | null | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return propia ?? undefined;
  const limite = AbortSignal.timeout(ms);
  if (!propia) return limite;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof any === 'function' ? any([propia, limite]) : propia;
}

/**
 * fetch same-origin que convierte fallos de red y timeouts en ApiError con
 * mensaje claro (status 0 = sin red, 504 = timeout). Los abortos pedidos por
 * el propio código (`signal` del caller) se relanzan tal cual.
 */
async function fetchSeguro(url: string, init: RequestInit | undefined, ms: number): Promise<Response> {
  try {
    return await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      signal: combinarSenal(init?.signal, ms),
    });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    const nombre = (err as { name?: string } | null)?.name;
    if (nombre === 'TimeoutError' || nombre === 'AbortError') throw new ApiError(MENSAJE_TIMEOUT, 504);
    throw new ApiError(MENSAJE_SIN_CONEXION, 0);
  }
}

/** GET JSON same-origin sin caché del navegador; lanza ApiError si falla. */
export async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchSeguro(url, init, TIMEOUT_CLIENTE_MS);
  if (!res.ok) {
    const { mensaje, code, datos } = await leerError(res);
    manejarSesion(res.status, code);
    throw new ApiError(mensaje, res.status, code, datos);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export interface OpcionesEnvio {
  /** Clave de idempotencia (misma clave = mismo resultado, sin duplicados). */
  idempotencia?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Mutación JSON (POST/PUT/PATCH/DELETE) con el mismo manejo de errores que
 * fetchJSON: sesión vencida, 429, 5xx, timeout y sin red → ApiError con
 * mensaje listo para mostrar en un toast.
 * `body` FormData se envía tal cual (subida de archivos).
 */
export async function enviarJSON<T = unknown>(
  url: string,
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  opciones: OpcionesEnvio = {},
): Promise<T> {
  const esForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = { ...(opciones.headers || {}) };
  if (body !== undefined && !esForm) headers['Content-Type'] = 'application/json';
  if (opciones.idempotencia) headers['Idempotency-Key'] = opciones.idempotencia;
  const res = await fetchSeguro(
    url,
    {
      method: metodo,
      headers,
      body: body === undefined ? undefined : esForm ? (body as FormData) : JSON.stringify(body),
      signal: opciones.signal,
    },
    opciones.timeoutMs ?? TIMEOUT_MUTACION_MS,
  );
  if (!res.ok) {
    const { mensaje, code, datos } = await leerError(res);
    manejarSesion(res.status, code);
    throw new ApiError(mensaje, res.status, code, datos);
  }
  if (res.status === 204) return null as T;
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

/** Mensaje para el usuario a partir de cualquier error (ApiError o no). */
export function mensajeDeError(err: unknown, porDefecto = 'No pudimos completar la acción. Intenta de nuevo.'): string {
  if (err instanceof ApiError) return err.message || porDefecto;
  if (err instanceof Error && err.message && err.message.length < 200) return err.message;
  return porDefecto;
}

/** Clave de idempotencia nueva (UUID v4). */
export function nuevaClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Fetcher global de SWR. En el primer uso de una URL reutiliza la precarga
 * hecha en /bienvenida (si sigue fresca) en vez de repetir la request.
 */
export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const precargado = takePrefetched<T>(url);
  if (precargado) {
    const valor = await precargado;
    if (valor !== null) return valor;
  }
  return fetchJSON<T>(url);
}

/**
 * Precarga los datos de una pantalla de detalle al pasar el mouse / enfocar
 * (el detalle abre al instante). Usa la misma caché que SWR.
 */
export function precargarDatos(url: string): void {
  void import('swr').then(({ preload }) => preload(url, swrFetcher)).catch(() => undefined);
}
