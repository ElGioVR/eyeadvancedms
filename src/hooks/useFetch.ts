'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface UseFetchResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: (extraParams?: Record<string, string>) => Promise<void>;
  total: number;
  page: number;
  pageSize: number;
}

export function useFetch<T>(url: string, params?: Record<string, string>): UseFetchResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const paramsRef = useRef(params);
  const requestRef = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });
  const automaticRequestKeyRef = useRef<string | null>(null);
  const cacheRef = useRef(new Map<string, { data: T[]; total: number; page: number; pageSize: number }>());
  paramsRef.current = params;

  const fetchData = useCallback(async (extraParams?: Record<string, string>) => {
    const requestId = requestRef.current.id + 1;
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    requestRef.current = { id: requestId, controller };

    try {
      setLoading(true);
      setError(null);
      const merged = { ...paramsRef.current, ...extraParams };
      const cacheKey = `${url}?${new URLSearchParams(merged).toString()}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setData(cached.data);
        setTotal(cached.total);
        setPage(cached.page);
        setPageSize(cached.pageSize);
      }
      const qs = new URLSearchParams(merged).toString();
      const fullUrl = qs ? `${url}?${qs}` : url;
      const res = await fetch(fullUrl, { signal: controller.signal });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar datos');
      }
      const json = await res.json();
      if (requestRef.current.id !== requestId) return;
      if (json && typeof json === 'object' && 'data' in json && 'total' in json) {
        setData(json.data);
        setTotal(json.total);
        setPage(json.page);
        setPageSize(json.pageSize);
        cacheRef.current.set(cacheKey, {
          data: json.data,
          total: json.total,
          page: json.page,
          pageSize: json.pageSize,
        });
      } else {
        const nextData = Array.isArray(json) ? json : [json];
        setData(nextData);
        cacheRef.current.set(cacheKey, { data: nextData, total: nextData.length, page: 1, pageSize: nextData.length });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && requestRef.current.id === requestId) {
        setError(err.message || 'Error desconocido');
      }
    } finally {
      if (requestRef.current.id === requestId) setLoading(false);
    }
  }, [url]);

  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    // React Strict Mode re-runs effects in development; do not duplicate the same GET.
    if (automaticRequestKeyRef.current === paramsKey) return;
    automaticRequestKeyRef.current = paramsKey;
    fetchData();
  }, [fetchData, paramsKey]);

  return { data, loading, error, refetch: fetchData, total, page, pageSize };
}
