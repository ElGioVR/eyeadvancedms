'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
import { useRefrescoCompartido } from '@/lib/tiempo-real';

/**
 * Intervalo de refresco para datos que cambian por la acción de OTROS usuarios
 * (agenda, pacientes, consultas, dashboard). Solo corre con la pestaña visible.
 */
export const REFRESCO_COMPARTIDO_MS = 30_000;

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface UseFetchResult<T, R = unknown> {
  data: T[];
  /** true solo en la PRIMERA carga (sin datos que mostrar). */
  loading: boolean;
  /** true mientras se revalida en segundo plano (hay datos en pantalla). */
  validating: boolean;
  error: string | null;
  /** Vuelve a pedir los datos sin vaciar la pantalla. */
  refetch: (extraParams?: Record<string, string>) => Promise<void>;
  /** Mutación local/optimista de la respuesta cruda (ver SWR `mutate`). */
  mutate: KeyedMutator<R>;
  total: number;
  page: number;
  pageSize: number;
}

interface UseFetchOptions {
  /** Compatibilidad: la precarga se consume en el fetcher global. */
  prefetchMaxAgeMs?: number;
  /** Revalidar cada N ms mientras la pestaña está visible. */
  refreshInterval?: number;
  /** false = no pedir aún (p. ej. falta un id). */
  enabled?: boolean;
}

/** Misma forma de URL que antes (orden de parámetros incluido) para que la precarga coincida. */
export function construirUrl(url: string, params?: Record<string, string>): string {
  const qs = new URLSearchParams(params ?? {}).toString();
  return qs ? `${url}?${qs}` : url;
}

function esPaginada<T>(json: unknown): json is PaginatedResponse<T> {
  return !!json && typeof json === 'object' && 'data' in json && 'total' in json;
}

/**
 * Datos de una API con caché compartida (SWR). Refrescar actualiza solo los
 * datos: la pantalla conserva lo que ya muestra hasta que llega lo nuevo.
 */
export function useFetch<T, R = unknown>(
  url: string,
  params?: Record<string, string>,
  options?: UseFetchOptions
): UseFetchResult<T, R> {
  const [extra, setExtra] = useState<Record<string, string> | undefined>(undefined);
  const paramsKey = JSON.stringify(params ?? {});
  const extraKey = JSON.stringify(extra ?? {});

  const key = useMemo(
    () => (options?.enabled === false ? null : construirUrl(url, { ...(params ?? {}), ...(extra ?? {}) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, paramsKey, extraKey, options?.enabled]
  );

  // Datos compartidos: con tiempo real conectado el polling es solo respaldo (2 min).
  const refrescoCompartido = useRefrescoCompartido();
  const refreshInterval =
    options?.refreshInterval === REFRESCO_COMPARTIDO_MS ? refrescoCompartido : options?.refreshInterval;

  const { data: json, error, isLoading, isValidating, mutate } = useSWR<R>(key, {
    refreshInterval,
    refreshWhenHidden: false,
  });

  const refetch = useCallback(
    async (extraParams?: Record<string, string>) => {
      if (extraParams && JSON.stringify(extraParams) !== extraKey) {
        setExtra(extraParams); // cambia la clave → SWR pide la nueva URL
        return;
      }
      await mutate();
    },
    [mutate, extraKey]
  );

  const shaped = useMemo(() => {
    if (json === undefined || json === null) return { data: [] as T[], total: 0, page: 1, pageSize: 15 };
    if (esPaginada<T>(json)) {
      return { data: json.data ?? [], total: json.total ?? 0, page: json.page ?? 1, pageSize: json.pageSize ?? 15 };
    }
    const arr = (Array.isArray(json) ? json : [json]) as T[];
    return { data: arr, total: arr.length, page: 1, pageSize: arr.length };
  }, [json]);

  return {
    ...shaped,
    // Con keepPreviousData SWR marca isLoading al cambiar de clave aunque haya datos previos:
    // solo es "carga inicial" si no hay nada que mostrar.
    loading: isLoading && json === undefined,
    validating: isValidating,
    error: error ? (error instanceof Error ? error.message : 'Error desconocido') : null,
    refetch,
    mutate,
  };
}

/**
 * Revalida en segundo plano todas las respuestas cacheadas cuya URL empieza
 * con alguno de los prefijos (p. ej. tras crear un paciente: '/api/pacientes').
 * Solo se refrescan los datos; ningún componente se desmonta.
 */
export function useInvalidar() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (...prefijos: string[]) =>
      // Solo el filtro (sin 2º argumento): SWR revalida conservando los datos actuales.
      mutate((k) => typeof k === 'string' && prefijos.some((p) => k === p || k.startsWith(`${p}?`) || k.startsWith(`${p}/`))),
    [mutate]
  );
}
