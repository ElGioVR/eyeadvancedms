/**
 * Arranque de Sentry en servidor (solo Node; el middleware Edge queda ligero).
 * Si no hay NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN, `enabled: false` y no se envía nada.
 * `process.env.NEXT_RUNTIME` se reemplaza al compilar: la rama de Node no entra
 * en el bundle Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { iniciarSentryServidor } = await import('./instrumentation-node');
    iniciarSentryServidor();
  }
}

// Next ≥ 15 llama esto en errores de render/route del servidor; en 14 se ignora.
export async function onRequestError(...args: unknown[]) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { capturarErrorDePeticion } = await import('./instrumentation-node');
    (capturarErrorDePeticion as (...a: unknown[]) => void)(...args);
  }
}
