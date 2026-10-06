'use client';

import { useEffect } from 'react';
import { asegurarSentry, reportarError } from '@/lib/monitoreo-cliente';

/**
 * Activa Sentry en el navegador cuando la página ya está en reposo y captura
 * errores globales (promesas sin catch, errores fuera de React).
 */
export default function MonitoreoCliente() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const iniciar = () => void asegurarSentry();
    if (w.requestIdleCallback) w.requestIdleCallback(iniciar, { timeout: 5000 });
    else setTimeout(iniciar, 3000);

    // Errores antes de que cargue el SDK: se reportan en cuanto esté listo.
    const alError = (e: ErrorEvent) => reportarError(e.error ?? e.message, { origen: 'window.onerror' });
    const alRechazo = (e: PromiseRejectionEvent) => reportarError(e.reason, { origen: 'unhandledrejection' });
    window.addEventListener('error', alError);
    window.addEventListener('unhandledrejection', alRechazo);
    return () => {
      window.removeEventListener('error', alError);
      window.removeEventListener('unhandledrejection', alRechazo);
    };
  }, []);
  return null;
}
