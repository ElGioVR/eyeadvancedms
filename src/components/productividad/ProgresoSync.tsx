'use client';

import { RefreshCw } from 'lucide-react';
import { SYNC_TIMEOUT_MS } from './sync';

/** Estado de un sync en curso: fase estimada, segundos transcurridos y barra indeterminada. */
export default function ProgresoSync({ segundos }: { segundos: number }) {
  const fase =
    segundos < 5
      ? 'Verificando consultas y cirugías del rango…'
      : segundos < 20
        ? 'Generando honorarios de cada doctor…'
        : 'Desplegando a productividad… puede tardar con rangos amplios.';
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 animate-fadeIn dark:border-primary-900 dark:bg-primary-950/30 dark:text-primary-300"
    >
      <div className="flex items-center gap-3">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="flex-1">{fase}</span>
        <span className="tabular-nums text-xs font-semibold">{segundos}s</span>
      </div>
      <p className="mt-1 text-xs opacity-80">
        No cierres esta pantalla. Límite de espera: {Math.round(SYNC_TIMEOUT_MS / 60_000)} min.
      </p>
      <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
        <div className="h-full w-2/5 bg-primary-500/80 animate-barraCarga" />
      </div>
    </div>
  );
}
