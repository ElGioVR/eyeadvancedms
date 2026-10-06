import 'server-only';

import { NextResponse } from 'next/server';
import { log, registrarError } from '@/lib/log';
import { invalidarMemo } from '@/lib/cache-memoria';

/** Umbral para registrar una petición como lenta (ms). */
const LENTA_MS = 1000;

function esTimeout(err: unknown): boolean {
  const e = err as { name?: unknown; message?: unknown; cause?: unknown } | null;
  const nombre = typeof e?.name === 'string' ? e.name : '';
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (nombre === 'TimeoutError' || nombre === 'AbortError') return true;
  if (/timeout|timed out|aborted/i.test(msg)) return true;
  return e?.cause ? esTimeout(e.cause) : false;
}

function idPeticion(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * Envoltorio para route handlers:
 * - Ninguna excepción sale sin respuesta JSON (500, o 504 si fue timeout).
 * - Agrega `X-Request-Id` y `Server-Timing: total;dur=…` a toda respuesta.
 * - Registra errores (log JSON + Sentry) y peticiones lentas (> 1 s).
 *
 *   async function manejarGET(request: Request) { … }
 *   export const GET = ruta('pacientes#GET', manejarGET);
 *
 * Conserva la firma exacta del handler (Next valida `params`).
 */
export function ruta<A extends unknown[]>(
  nombre: string,
  handler: (...args: A) => Promise<Response> | Response,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const inicio = performance.now();
    const reqId = idPeticion();
    let res: Response;
    try {
      res = await handler(...args);
    } catch (err) {
      const timeout = esTimeout(err);
      registrarError(nombre, err, { reqId, timeout });
      res = NextResponse.json(
        {
          error: timeout
            ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
            : 'No pudimos completar la acción. Intenta de nuevo.',
          code: timeout ? 'TIMEOUT' : 'INTERNO',
          reqId,
        },
        { status: timeout ? 504 : 500 },
      );
    }

    // Una mutación exitosa invalida los agregados cacheados (dashboard) de esta instancia.
    if (res.ok && !nombre.endsWith('#GET')) invalidarMemo('dashboard:');

    const ms = Math.round(performance.now() - inicio);
    try {
      res.headers.set('X-Request-Id', reqId);
      res.headers.append('Server-Timing', `total;dur=${ms}`);
    } catch {
      // Respuestas con headers inmutables (p. ej. Response.redirect): se dejan igual.
    }
    if (ms > LENTA_MS) log.warn(nombre, 'peticion lenta', { reqId, ms, status: res.status });
    return res;
  };
}
