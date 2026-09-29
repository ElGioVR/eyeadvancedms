'use client';

import { takePrefetched } from '@/lib/prefetch';

/** Error de API con el código HTTP (para decidir reintentos y redirecciones). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let redirigiendo = false;

/** Sesión vencida o usuario desactivado → volver a /login (una sola vez). */
function manejarSesion(status: number) {
  if (status === 401 && typeof window !== 'undefined' && !redirigiendo) {
    if (window.location.pathname.startsWith('/login')) return;
    redirigiendo = true;
    window.location.assign('/login');
  }
}

async function leerError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j?.error === 'string' && j.error) return j.error;
  } catch {
    /* cuerpo vacío o no JSON */
  }
  if (res.status === 429) return 'Demasiadas solicitudes. Espera un momento.';
  if (res.status >= 500) return 'Error del servidor. Intenta de nuevo.';
  return 'Error al cargar datos';
}

/** GET JSON same-origin sin caché del navegador; lanza ApiError si falla. */
export async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  if (!res.ok) {
    manejarSesion(res.status);
    throw new ApiError(await leerError(res), res.status);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
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
 * Mutación (POST/PUT/PATCH/DELETE) con JSON. Devuelve el JSON de respuesta o
 * lanza ApiError con el mensaje del servidor.
 */
export async function enviarJSON<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return fetchJSON<T>(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
