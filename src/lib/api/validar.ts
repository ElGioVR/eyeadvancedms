import 'server-only';

import { NextResponse } from 'next/server';
import { z, type ZodTypeAny } from 'zod';
import { mensajeSeguro } from '@/lib/supabase/handle-error';

/**
 * Utilidades de validación para route handlers.
 *
 *   const body = await leerJSON(request, esquema);
 *   if (body instanceof NextResponse) return body;
 *   // body ya está tipado y validado
 */

/** Tamaño máximo por defecto de un body JSON (1 MB). */
const MAX_BYTES_JSON = 1_000_000;

export const uuid = z.string().uuid('ID no válido');
export const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)');
export const horaHHMM = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora no válida (HH:MM)');

/** Paginación estándar: page ≥ 1, 1 ≤ pageSize ≤ max. */
export function esquemaPaginacion(pageSizeDefault = 15, max = 100) {
  return {
    // Valores fuera de rango se recortan (como antes); basura → valor por defecto.
    page: z.coerce.number().int().catch(1).default(1).transform((n) => Math.min(100_000, Math.max(1, n))),
    pageSize: z.coerce
      .number()
      .int()
      .catch(pageSizeDefault)
      .default(pageSizeDefault)
      .transform((n) => Math.min(max, Math.max(1, n))),
  };
}

/** Primer error de Zod en texto legible (incluye el campo). */
export function mensajeZod(error: z.ZodError): string {
  const e = error.errors[0];
  if (!e) return 'Datos inválidos';
  const campo = e.path.length ? e.path.join('.') : '';
  // Mensajes propios (en español) se muestran tal cual; los genéricos de Zod llevan el campo.
  const generico = /^(Required|Invalid|Expected|String must|Number must|Array must)/.test(e.message);
  return generico && campo ? `Campo «${campo}»: dato inválido` : e.message;
}

export function errorValidacion(mensaje: string, status = 400): NextResponse {
  return NextResponse.json({ error: mensaje }, { status });
}

/** Lee y valida el body JSON. Devuelve los datos o una respuesta 400/413/415. */
export async function leerJSON<S extends ZodTypeAny>(
  request: Request,
  esquema: S,
  opciones: { maxBytes?: number } = {},
): Promise<z.infer<S> | NextResponse> {
  const max = opciones.maxBytes ?? MAX_BYTES_JSON;
  const tipo = request.headers.get('content-type') || '';
  if (tipo && !tipo.includes('application/json')) {
    return errorValidacion('Se esperaba JSON', 415);
  }
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > max) return errorValidacion('Solicitud demasiado grande', 413);

  let texto: string;
  try {
    texto = await request.text();
  } catch {
    return errorValidacion('JSON inválido');
  }
  if (texto.length > max) return errorValidacion('Solicitud demasiado grande', 413);

  let crudo: unknown;
  try {
    crudo = texto ? JSON.parse(texto) : {};
  } catch {
    return errorValidacion('JSON inválido');
  }

  const r = esquema.safeParse(crudo);
  if (!r.success) return errorValidacion(mensajeZod(r.error));
  return r.data;
}

/** Valida los query params (strings) con un esquema de objeto. */
export function leerQuery<S extends ZodTypeAny>(request: Request, esquema: S): z.infer<S> | NextResponse {
  const { searchParams } = new URL(request.url);
  const obj: Record<string, string> = {};
  searchParams.forEach((v, k) => {
    // Ignora vacíos: `?estado=` equivale a no filtrar
    if (v !== '') obj[k] = v;
  });
  const r = esquema.safeParse(obj);
  if (!r.success) return errorValidacion(mensajeZod(r.error));
  return r.data;
}

/** 400 si el id de la ruta no es un UUID. */
export function validarId(id: string | undefined | null, nombre = 'ID'): NextResponse | null {
  if (!id || !uuid.safeParse(id).success) return errorValidacion(`${nombre} no válido`);
  return null;
}

/** Respuesta 500 genérica que no filtra detalles internos (los registra en servidor). */
export function errorInterno(err: unknown, contexto: string, generico = 'Error interno del servidor'): NextResponse {
  return NextResponse.json({ error: mensajeSeguro(err, contexto, generico) }, { status: 500 });
}
