import { errorTranslations } from './errors';
import { registrarError } from '@/lib/log';

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
  registrarError(contexto, Object.assign(new Error(message), { name: 'SupabaseError', code }), {
    hint: error?.hint ? String(error.hint).slice(0, 200) : undefined,
  });

  const traducido = error?.message ? errorTranslations[error.message] : undefined;
  if (traducido) return { mensaje: traducido, traducido: true };
  return { mensaje: 'Error interno del servidor', traducido: false };
}

/**
 * Patrones que delatan detalles internos (SQL, esquema, PostgREST, credenciales).
 * Si el mensaje contiene alguno, NO se envía al cliente.
 */
const PATRON_INTERNO =
  /(relation|column|schema|constraint|violates|syntax error|duplicate key|foreign key|permission denied|pgrst|postgres|sql|jwt|service_role|does not exist|function .*\(|rpc|null value in|invalid input syntax|timeout|ECONN|fetch failed|supabase)/i;

/**
 * Convierte cualquier error en un mensaje seguro para el cliente:
 * - registra el error real en el servidor,
 * - devuelve la traducción conocida, o el mensaje de negocio si no expone internos,
 * - en otro caso, un mensaje genérico.
 */
export function mensajeSeguro(err: unknown, contexto: string, generico = 'Error interno del servidor'): string {
  const message =
    err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  registrarError(contexto, err);
  if (!message) return generico;
  const traducido = errorTranslations[message];
  if (traducido) return traducido;
  if (PATRON_INTERNO.test(message) || message.length > 200) return generico;
  return message;
}
