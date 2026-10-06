'use client';

import { SWRConfig } from 'swr';
import { ApiError, swrFetcher } from '@/lib/fetcher';

/**
 * Caché de datos compartida por toda la app:
 * - Una misma URL se pide una sola vez aunque la usen varios componentes.
 * - Al volver a una pantalla se muestran los datos al instante y se
 *   revalidan en segundo plano (sin spinner de pantalla completa).
 * - Al cambiar de página/filtro se mantienen los datos previos hasta que
 *   llegan los nuevos (keepPreviousData) → sin parpadeos.
 */
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        keepPreviousData: true,
        dedupingInterval: 3_000,
        revalidateOnFocus: true,
        focusThrottleInterval: 5_000,
        revalidateOnReconnect: true,
        errorRetryCount: 2,
        errorRetryInterval: 3_000,
        // Solo se reintentan errores de red (status 0), timeouts o del servidor (no 4xx)
        shouldRetryOnError: (err: unknown) => !(err instanceof ApiError) || err.status === 0 || err.status >= 500,
      }}
    >
      {children}
    </SWRConfig>
  );
}
