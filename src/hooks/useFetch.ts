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
  paramsRef.current = params;

  const fetchData = useCallback(async (extraParams?: Record<string, string>) => {
    try {
      setLoading(true);
      setError(null);
      const merged = { ...paramsRef.current, ...extraParams };
      const qs = new URLSearchParams(merged).toString();
      const fullUrl = qs ? `${url}?${qs}` : url;
      const res = await fetch(fullUrl);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar datos');
      }
      const json = await res.json();
      if (json && typeof json === 'object' && 'data' in json && 'total' in json) {
        setData(json.data);
        setTotal(json.total);
        setPage(json.page);
        setPageSize(json.pageSize);
      } else {
        setData(Array.isArray(json) ? json : [json]);
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [url]);

  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    fetchData();
  }, [fetchData, paramsKey]);

  return { data, loading, error, refetch: fetchData, total, page, pageSize };
}
