import { errorTranslations } from './errors';

export interface ErrorManejado {
  /** Mensaje seguro para el cliente (traducido o genérico) */
  mensaje: string;
  /** Si el error es conocido y se puede mostrar tal cual */
  traducido: boolean;
}

/**
 * Manejo centralizado de errores de Supabase en route handlers:
 * 1. Log estructurado en server (message + code + hint) — nunca se pierde el error real.
 * 2. Traducción segura para el cliente vía errorTranslations.
 *
 * Uso:
 *   if (error) return NextResponse.json(
 *     { error: handleSupabaseError(error, 'pacientes.listar').mensaje },
 *     { status: 500 }
 *   );
 */
export function handleSupabaseError(
  error: { message?: string; code?: string; hint?: string; details?: string } | null | undefined,
  contexto: string,
): ErrorManejado {
  const message = error?.message || 'Error desconocido';
  const code = error?.code || '—';
  console.error(`[${contexto}]`, { message, code, hint: error?.hint, details: error?.details });

  const traducido = error?.message ? errorTranslations[error.message] : undefined;
  if (traducido) return { mensaje: traducido, traducido: true };
  return { mensaje: 'Error interno del servidor', traducido: false };
}
