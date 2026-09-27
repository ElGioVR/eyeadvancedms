/** Header interno con el id del usuario ya verificado por el middleware. */
export const VERIFIED_USER_HEADER = 'x-ea-user-id';

/**
 * «Recordarme» desactivado → la sesión dura hasta cerrar el navegador.
 * Esta cookie (de sesión, sin maxAge) marca ese modo; mientras exista, las
 * cookies de auth que se escriban (login y refrescos de token) se guardan
 * también como cookies de sesión.
 */
export const SESION_TEMPORAL_COOKIE = 'ea_sesion_temporal';

/** Quita maxAge/expires para que la cookie muera al cerrar el navegador. */
export function opcionesCookieAuth<T extends { maxAge?: number; expires?: Date }>(
  options: T,
  temporal: boolean
): T {
  if (!temporal) return options;
  // Borrados (maxAge 0) se respetan: son para eliminar la cookie.
  if (options.maxAge === 0) return options;
  const { maxAge: _maxAge, expires: _expires, ...resto } = options;
  return resto as T;
}
