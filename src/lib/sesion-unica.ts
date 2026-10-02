/**
 * Sesión única por usuario («Trabajar aquí»). Reglas puras, sin dependencias
 * (se prueban en src/lib/__tests__/sesion-unica.test.ts).
 *
 * - `usuarios.sesion_activa_id` guarda el `session_id` (claim del JWT de
 *   Supabase) de la sesión que tiene la prioridad.
 * - La PRIMERA sesión conserva la prioridad: un segundo dispositivo solo entra
 *   si el usuario confirma «Trabajar aquí»; entonces la otra se cierra sola.
 * - Una sesión sin actividad por más de INACTIVIDAD_MS se puede reemplazar
 *   sin preguntar.
 */

export const INACTIVIDAD_MS = 15 * 60_000;
/** Cada cuánto se registra actividad de la sesión (como máximo). */
export const LATIDO_MS = 60_000;
/** Código de error que el cliente usa para cerrar la sesión reemplazada. */
export const CODIGO_SESION_REEMPLAZADA = 'SESION_REEMPLAZADA';

export type DecisionSesion = 'libre' | 'misma' | 'ocupada';

export function decidirSesion(p: {
  activaId: string | null | undefined;
  vistaAt: string | null | undefined;
  nuevaId: string;
  ahoraMs: number;
}): DecisionSesion {
  if (!p.activaId) return 'libre';
  if (p.activaId === p.nuevaId) return 'misma';
  const vista = p.vistaAt ? Date.parse(p.vistaAt) : NaN;
  if (Number.isNaN(vista) || p.ahoraMs - vista > INACTIVIDAD_MS) return 'libre';
  return 'ocupada';
}

/**
 * ¿La sesión del token sigue siendo la que tiene prioridad?
 * Sin sesión registrada (usuarios que entraron antes de esta función) o sin
 * claim `session_id`, se acepta: el control empieza en el siguiente login.
 */
export function sesionVigente(activaId: string | null | undefined, tokenSessionId: string | null | undefined): boolean {
  if (!activaId || !tokenSessionId) return true;
  return activaId === tokenSessionId;
}

/** Lee el claim `session_id` de un JWT (sin verificar: usar solo tras verificarlo). */
export function sessionIdDeToken(token: string | null | undefined): string | null {
  try {
    const payload = (token || '').split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
    ) as { session_id?: unknown };
    return typeof json.session_id === 'string' ? json.session_id : null;
  } catch {
    return null;
  }
}

/** «Chrome · Windows» a partir del User-Agent (para el aviso al otro dispositivo). */
export function etiquetaDispositivo(ua: string | null | undefined): string {
  const u = ua || '';
  const navegador = /Edg\//.test(u)
    ? 'Edge'
    : /OPR\/|Opera/.test(u)
      ? 'Opera'
      : /Firefox\//.test(u)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(u)
          ? 'Chrome'
          : /Safari\//.test(u)
            ? 'Safari'
            : 'Navegador';
  const so = /Windows/.test(u)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(u)
      ? 'iPhone/iPad'
      : /Android/.test(u)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(u)
          ? 'macOS'
          : /Linux/.test(u)
            ? 'Linux'
            : 'otro dispositivo';
  return `${navegador} · ${so}`;
}
