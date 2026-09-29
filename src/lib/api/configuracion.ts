import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { errorTranslations, translateError } from '@/lib/supabase/errors';

/**
 * Utilidades compartidas por los endpoints CRUD de /api/configuracion/**.
 */

/** Texto opcional con límite; '' se conserva (los handlers lo convierten a null). */
export const textoCorto = (max = 255) => z.string().max(max);
/** Texto largo (descripciones, direcciones). */
export const textoLargo = z.string().max(2000);
/**
 * Correo opcional: acepta '' (los formularios envían el campo vacío; el
 * handler lo guarda como null) o un correo válido.
 */
export const emailOpcional = z
  .string()
  .trim()
  .max(255)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Correo electrónico no válido');
/** Monto monetario acotado a NUMERIC(10,2). */
export const monto = z.number().finite().min(0).max(99_999_999.99);

/**
 * Lee `?id=` (UUID) de la URL.
 * - Sin id → 400 con `mensajeFalta` (mismo texto que antes).
 * - id que no es UUID → 400 'ID no válido' (antes llegaba a Postgres y respondía 500).
 */
export function idDeQuery(request: Request, mensajeFalta: string): string | NextResponse {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: mensajeFalta }, { status: 400 });
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID no válido' }, { status: 400 });
  }
  return id;
}

interface ErrorDb {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
}

/**
 * Respuesta segura para un error de Supabase/PostgREST:
 * - 23505 (único) → 409 con la traducción específica si existe.
 * - 23503 (FK) → 409 (en uso) o el mensaje indicado.
 * - PGRST116 (`.single()` sin filas) → 404.
 * - Resto → 500 con mensaje traducido o genérico (nunca el texto crudo de Postgres).
 */
export function respuestaErrorDb(
  error: ErrorDb,
  contexto: string,
  opciones: { duplicado?: string; referencia?: string; noEncontrado?: string } = {},
): NextResponse {
  const { mensaje } = handleSupabaseError(error, contexto);
  const msg = error.message || '';
  const especifico = errorTranslations[msg];

  if (error.code === '23505') {
    return NextResponse.json(
      { error: opciones.duplicado || especifico || translateError(msg) },
      { status: 409 },
    );
  }
  if (error.code === '23503') {
    return NextResponse.json(
      { error: opciones.referencia || 'El registro está en uso o hace referencia a datos inexistentes' },
      { status: 409 },
    );
  }
  if (error.code === 'PGRST116') {
    return NextResponse.json({ error: opciones.noEncontrado || 'Registro no encontrado' }, { status: 404 });
  }
  return NextResponse.json({ error: especifico || mensaje }, { status: 500 });
}
