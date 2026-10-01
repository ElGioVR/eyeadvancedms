import 'server-only';

/**
 * Trabajo best-effort que no debe retrasar la respuesta HTTP (historial,
 * honorarios, notificaciones, productividad).
 *
 * En Vercel se registra con `waitUntil` del contexto de la petición (el mismo
 * mecanismo que `@vercel/functions`): la función sigue viva hasta que termina.
 * Fuera de Vercel (`next dev` / `next start`) el proceso es persistente y la
 * promesa simplemente continúa. Nunca lanza: los errores se registran.
 */
type ContextoVercel = { waitUntil?: (p: Promise<unknown>) => void };

export function enSegundoPlano(tarea: Promise<unknown>, contexto = 'segundo-plano'): void {
  const segura = tarea.catch((err) => {
    console.error(`[${contexto}]`, err);
  });
  try {
    const almacen = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
      | { get?: () => ContextoVercel | undefined }
      | undefined;
    almacen?.get?.()?.waitUntil?.(segura);
  } catch {
    // Sin contexto de Vercel: la promesa ya está en curso.
  }
}
