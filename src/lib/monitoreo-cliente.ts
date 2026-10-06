'use client';

/**
 * Sentry en el navegador, cargado de forma DIFERIDA.
 *
 * El SDK pesa ~60 kB: importarlo de forma estática lo metía en el bundle
 * inicial de TODAS las pantallas (147 kB vs 88 kB). Aquí solo se descarga
 * en reposo (o al primer error) y únicamente si hay NEXT_PUBLIC_SENTRY_DSN.
 * Sin Session Replay (no se graban pantallas con datos de pacientes).
 */
type SentryCliente = typeof import('@sentry/nextjs');

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
let cargando: Promise<SentryCliente | null> | null = null;

export function asegurarSentry(): Promise<SentryCliente | null> {
  if (!DSN || typeof window === 'undefined') return Promise.resolve(null);
  if (!cargando) {
    cargando = Promise.all([import('@sentry/nextjs'), import('@/lib/sentry-privacidad')])
      .then(([Sentry, { opcionesSentry }]) => {
        Sentry.init({
          ...opcionesSentry(),
          integrations: [Sentry.browserTracingIntegration()],
          tracePropagationTargets: [/^\//],
        });
        return Sentry;
      })
      .catch(() => null);
  }
  return cargando;
}

/** Reporta un error de UI (boundary, widget). Nunca lanza. */
export function reportarError(error: unknown, etiquetas: Record<string, string> = {}, extra?: Record<string, unknown>): void {
  void asegurarSentry().then((Sentry) => {
    try {
      Sentry?.captureException(error, { tags: etiquetas, contexts: extra ? { detalle: extra } : undefined });
    } catch {
      /* el monitoreo nunca rompe la app */
    }
  });
}
