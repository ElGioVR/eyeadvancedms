import 'server-only';

import { NextResponse } from 'next/server';
import { z, type ZodTypeAny } from 'zod';
import { errorValidacion, mensajeZod, uuid } from '@/lib/api/validar';

/**
 * Validación compartida por los endpoints de /api/productividad/**.
 * (No se re-exporta desde `@/lib/productividad` para no arrastrar
 * `server-only`/`next/server` a los tests que cargan ese índice.)
 */

/** Rango máximo aceptado en reportes/listados (≈ 2 años). */
export const MAX_DIAS_REPORTE = 731;
/** Rango máximo de un sync de devengo (1 año): cada día implica N escrituras. */
export const MAX_DIAS_SYNC = 366;
/** Monto máximo editable a mano en un honorario. */
export const MONTO_MAXIMO = 10_000_000;
/** Máximo de honorarios que se pagan en una sola solicitud. */
export const MAX_IDS_PAGO = 500;

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true si es AAAA-MM-DD y existe en el calendario (rechaza 2026-02-30). */
export function esFechaReal(v: string): boolean {
  const m = RE_FECHA.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2999) return false;
  const dt = new Date(Date.UTC(y, mes - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d;
}

export const fechaReal = z
  .string()
  .max(10)
  .refine(esFechaReal, 'Fecha no válida (AAAA-MM-DD)');

/** uuid para query params (acepta ausente). */
export const uuidOpcional = uuid.optional();

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** 400 si desde > hasta o si el rango excede `maxDias`. */
export function validarRango(
  desde: string,
  hasta: string,
  maxDias = MAX_DIAS_REPORTE
): NextResponse | null {
  if (desde > hasta) return errorValidacion('Rango de fechas inválido');
  if (diasEntre(desde, hasta) > maxDias) {
    return errorValidacion(`El rango de fechas no puede exceder ${maxDias} días`);
  }
  return null;
}

/** Escapa comodines de LIKE/ILIKE (`%`, `_`, `\`) para comparar literal. */
export function escaparLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const MAX_BYTES_BODY = 64_000;

/**
 * Como `leerJSON` de `@/lib/api/validar`, pero acepta además `text/plain`:
 * varios `fetch` del panel de productividad envían el body sin cabecera
 * `Content-Type` (el navegador pone `text/plain;charset=UTF-8`). Rechaza
 * cualquier otro tipo (p. ej. formularios) con 415.
 */
export async function leerJSONTolerante<S extends ZodTypeAny>(
  request: Request,
  esquema: S,
  maxBytes = MAX_BYTES_BODY
): Promise<z.infer<S> | NextResponse> {
  const tipo = (request.headers.get('content-type') || '').toLowerCase();
  if (tipo && !tipo.includes('application/json') && !tipo.startsWith('text/plain')) {
    return errorValidacion('Se esperaba JSON', 415);
  }
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > maxBytes) return errorValidacion('Solicitud demasiado grande', 413);

  let texto: string;
  try {
    texto = await request.text();
  } catch {
    return errorValidacion('JSON inválido');
  }
  if (texto.length > maxBytes) return errorValidacion('Solicitud demasiado grande', 413);

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
