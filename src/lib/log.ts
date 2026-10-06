import * as Sentry from '@sentry/nextjs';

/**
 * Logger estructurado (una línea JSON por evento) para Vercel / log drains.
 *
 * Reglas de privacidad: NUNCA registrar cuerpos de peticiones, nombres de
 * pacientes, diagnósticos ni datos de contacto. Solo contexto técnico
 * (ruta, código de error, duración, ids).
 */
type Nivel = 'info' | 'warn' | 'error';

export interface DatosLog {
  [k: string]: string | number | boolean | null | undefined;
}

function escribir(nivel: Nivel, ctx: string, msg: string, datos?: DatosLog) {
  const linea = JSON.stringify({ nivel, ctx, msg, t: new Date().toISOString(), ...datos });
  if (nivel === 'error') console.error(linea);
  else if (nivel === 'warn') console.warn(linea);
  else console.log(linea);
}

export const log = {
  info: (ctx: string, msg: string, datos?: DatosLog) => escribir('info', ctx, msg, datos),
  warn: (ctx: string, msg: string, datos?: DatosLog) => escribir('warn', ctx, msg, datos),
  error: (ctx: string, msg: string, datos?: DatosLog) => escribir('error', ctx, msg, datos),
};

/** Datos técnicos de un error (sin PHI): nombre, código y mensaje recortado. */
export function resumenError(err: unknown): { nombre: string; codigo: string; mensaje: string } {
  const e = err as { name?: unknown; code?: unknown; message?: unknown } | null;
  return {
    nombre: typeof e?.name === 'string' ? e.name : typeof err,
    codigo: typeof e?.code === 'string' ? e.code : '',
    mensaje: (typeof e?.message === 'string' ? e.message : String(err)).slice(0, 300),
  };
}

/**
 * Registra un error en logs y en Sentry (si SENTRY_DSN está configurado;
 * sin DSN, captureException no hace nada).
 */
export function registrarError(ctx: string, err: unknown, datos?: DatosLog): void {
  const r = resumenError(err);
  escribir('error', ctx, r.mensaje, { error: r.nombre, codigo: r.codigo, ...datos });
  try {
    const excepcion = err instanceof Error ? err : new Error(`[${ctx}] ${r.mensaje}`);
    Sentry.captureException(excepcion, { tags: { ctx, codigo: r.codigo || undefined }, extra: datos });
  } catch {
    // El monitoreo nunca debe romper la petición.
  }
}
