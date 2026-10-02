'use client';

import { takePrefetched } from '@/lib/prefetch';
import { AVISO_CIERRE_MS, EVENTO_SESION_REEMPLAZADA } from '@/lib/sesion-pestana';

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

async function leerError(res: Response): Promise<{ mensaje: string; code?: string }> {
  try {
    const j = (await res.json()) as { error?: unknown; code?: unknown };
    const code = typeof j?.code === 'string' ? j.code : undefined;
    if (typeof j?.error === 'string' && j.error) return { mensaje: j.error, code };
    if (code) return { mensaje: 'Error al cargar datos', code };
  } catch {
    /* cuerpo vacío o no JSON */
  }
  if (res.status === 429) return { mensaje: 'Demasiadas solicitudes. Espera un momento.' };
  if (res.status >= 500) return { mensaje: 'Error del servidor. Intenta de nuevo.' };
  return { mensaje: 'Error al cargar datos' };
}

/** GET JSON same-origin sin caché del navegador; lanza ApiError si falla. */
export async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  if (!res.ok) {
    const { mensaje, code } = await leerError(res);
    manejarSesion(res.status, code);
    throw new ApiError(mensaje, res.status);
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
