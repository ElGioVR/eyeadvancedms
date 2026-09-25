'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import type { EstadoPago, HonorariosListado } from '@/types/productividad';

const PAGE_SIZE = 15;

const estadoBadge: Record<EstadoPago, { bg: string; text: string; label: string }> = {
  PAGADO: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Pagado' },
  POR_PAGAR: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Por pagar' },
  PENDIENTE: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Pendiente' },
  PENDIENTE_CONFIG: { bg: 'bg-rose-500/15', text: 'text-rose-400', label: 'Sin tarifa' },
  CANCELADO: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Cancelado' },
};

interface Payload extends HonorariosListado {
  doctor_id: string;
  doctor_nombre: string | null;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}

function fmtFecha(iso: string) {
  const [y, m, d] = (iso || '').split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function MisHonorariosPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (desde && hasta) {
        params.set('desde', desde);
        params.set('hasta', hasta);
      }
      const res = await fetch(`/api/productividad/mis-honorarios?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudieron cargar tus honorarios');
      }
      setData((await res.json()) as Payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [page, desde, hasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cambiarRango = (siguienteDesde: string, siguienteHasta: string) => {
    setDesde(siguienteDesde);
    setHasta(siguienteHasta);
    setPage(1);
  };

  const rangoIncompleto = (!!desde && !hasta) || (!!hasta && !desde);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[600px] space-y-5">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[600px] py-12 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
        <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{error}</p>
        <button
          type="button"
          onClick={() => fetchData()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-[#2F3336] dark:text-[#E7E9EA] dark:hover:bg-[#1D1F23]"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    );
  }

  const resumen = data?.resumen;

  return (
    <div className="mx-auto max-w-[600px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900 dark:text-[#E7E9EA]">Mis Honorarios</h1>
        <p className="text-sm text-gray-400 dark:text-[#71767B]">
          {data?.doctor_nombre || 'Tus ingresos por servicios'}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2F3336] dark:bg-[#16181C]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              Periodo
            </span>
          </div>
          <button
            type="button"
            onClick={() => cambiarRango('', '')}
            disabled={!desde && !hasta}
            className="rounded-lg px-2 py-1 text-xs font-bold text-primary-600 disabled:opacity-30"
          >
            Periodo actual
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 dark:text-[#71767B]">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => cambiarRango(e.target.value, hasta)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none dark:border-[#2F3336] dark:bg-[#0F1419] dark:text-[#E7E9EA]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 dark:text-[#71767B]">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => cambiarRango(desde, e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none dark:border-[#2F3336] dark:bg-[#0F1419] dark:text-[#E7E9EA]"
            />
          </label>
        </div>
        {rangoIncompleto && (
          <p className="mt-2 text-xs font-bold text-amber-500">
            Completa ambas fechas para filtrar; sin ellas se muestra el periodo actual.
          </p>
        )}
        {data?.rango && (
          <p className="mt-2 text-xs text-gray-400 dark:text-[#71767B]">
            Mostrando {fmtFecha(data.rango.desde)} — {fmtFecha(data.rango.hasta)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2F3336] dark:bg-[#16181C]">
          <div className="mb-2 h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-[#E7E9EA]">
            {fmtMoney(resumen?.por_pagar || 0)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-[#71767B]">Por pagar</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2F3336] dark:bg-[#16181C]">
          <div className="mb-2 h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">
            {fmtMoney(resumen?.pagado || 0)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-[#71767B]">Pagado</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2F3336] dark:bg-[#16181C]">
          <p className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">
            {fmtMoney(resumen?.total_filtrado || 0)}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#71767B]">Devengado</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2F3336] dark:bg-[#16181C]">
          <p className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">
            {resumen?.total_eventos ?? 0}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#71767B]">Servicios</p>
        </div>
      </div>

      {!!resumen?.sin_monto && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            {resumen.sin_monto} evento(s) sin tarifa configurada pendientes de revisión.
          </p>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
            Movimientos
          </h2>
          <span className="text-xs text-gray-400 dark:text-[#71767B]">
            {data?.total ?? 0} en el periodo
          </span>
        </div>

        {!data || data.items.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-12 text-center dark:border-[#2F3336] dark:bg-[#16181C]">
            <TrendingUp className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-[#2F3336]" />
            <p className="text-sm text-gray-400 dark:text-[#71767B]">
              Sin movimientos en este periodo
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.items.map((ev) => {
              const badge = estadoBadge[ev.estado_pago] || estadoBadge.PENDIENTE;
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 dark:border-[#2F3336] dark:bg-[#16181C]"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      badge.bg
                    )}
                  >
                    <ArrowUpRight className={cn('h-5 w-5', badge.text)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
                      {ev.fuente}
                    </p>
                    <p className="truncate text-xs text-gray-400 dark:text-[#71767B]">
                      {ev.origen || 'Sin origen'} · {fmtFecha(ev.fecha)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-emerald-600">+{fmtMoney(ev.monto)}</p>
                    <span className={cn('text-[10px] font-bold uppercase', badge.text)}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Actualizando…
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white dark:border-[#2F3336] dark:bg-[#16181C]">
            <Pagination
              page={data.page}
              total={data.total}
              pageSize={data.pageSize}
              totalItems={data.total}
              onPageChange={setPage}
              label="movimientos"
            />
          </div>
        )}
      </div>
    </div>
  );
}
