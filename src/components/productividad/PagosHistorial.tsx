'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, History } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import { formatCurrency } from '@/lib/money';
import { formatFechaCsv } from '@/lib/rangos';
import type { PagoHonorarioFila } from '@/types/productividad';

interface RespuestaPagos {
  items: PagoHonorarioFila[];
  total: number;
  page: number;
  pageSize: number;
  total_monto: number;
}

const th =
  'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400';
const thR = 'px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-4 py-3 text-sm text-gray-700 dark:text-[#E7E9EA]';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]';

export default function PagosHistorial({
  desde,
  hasta,
  doctorId,
}: {
  desde: string;
  hasta: string;
  doctorId: string;
}) {
  const [data, setData] = useState<RespuestaPagos | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cargar = useCallback(
    async (p: number, signal?: AbortSignal) => {
      if (!desde || !hasta) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort());
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ desde, hasta, page: String(p), pageSize: '50' });
        if (doctorId) params.set('doctor_id', doctorId);
        const res = await fetch(`/api/productividad/honorarios/pagos?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Error ${res.status}`);
        }
        const json = (await res.json()) as RespuestaPagos;
        if (!controller.signal.aborted) setData(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Error al cargar historial');
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [desde, hasta, doctorId]
  );

  useEffect(() => {
    setPage(1);
    const ac = new AbortController();
    void cargar(1, ac.signal);
    return () => ac.abort();
  }, [cargar]);

  const descargarCsv = useCallback(async () => {
    if (!desde || !hasta) return;
    try {
      const params = new URLSearchParams({ desde, hasta, formato: 'csv' });
      if (doctorId) params.set('doctor_id', doctorId);
      const res = await fetch(`/api/productividad/honorarios/pagos?${params}`);
      if (!res.ok) throw new Error('No se pudo generar el CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historial-pagos-${desde}_${hasta}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar CSV');
    }
  }, [desde, hasta, doctorId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]">
            {data?.total || 0} pagos
          </span>
          <span className="text-sm font-bold text-emerald-600">
            {formatCurrency(data?.total_monto || 0)}
          </span>
          <span className="text-xs text-gray-400">
            {formatFechaCsv(desde)} – {formatFechaCsv(hasta)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void descargarCsv()}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-700 dark:text-[#E7E9EA] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1D1F23] text-sm font-medium"
        >
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin pagos en el rango"
            description="No hay honorarios pagados con fecha de pago en el rango seleccionado"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#202327]/50">
                  <th className={th}>Fecha pago</th>
                  <th className={th}>Doctor</th>
                  <th className={th}>Fecha servicio</th>
                  <th className={th}>Fuente</th>
                  <th className={thR}>Monto</th>
                  <th className={th}>Pagado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                    <td className={`${td} font-semibold`}>
                      {p.fecha_pago ? formatFechaCsv(p.fecha_pago) : '—'}
                    </td>
                    <td className={td}>{p.doctor_nombre}</td>
                    <td className={td}>{p.fecha_servicio ? formatFechaCsv(p.fecha_servicio) : '—'}</td>
                    <td className={td}>{p.fuente}</td>
                    <td className={tdR}>{formatCurrency(p.monto)}</td>
                    <td className={td}>{p.pagado_por_nombre || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data?.page || 1}
              total={data?.total || 0}
              pageSize={data?.pageSize || 50}
              totalItems={data?.total || 0}
              onPageChange={(p) => void cargar(p)}
              label="pagos"
            />
          </div>
        )}
      </div>
    </div>
  );
}
