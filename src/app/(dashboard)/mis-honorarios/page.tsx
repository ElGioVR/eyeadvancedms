'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { rangoMesActual, rangoMesAnterior } from '@/lib/rangos';
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

  const abortRef = useRef<AbortController | null>(null);

  // Cancela la petición anterior al cambiar filtros/página y conserva los datos
  // visibles mientras llega la nueva (sin volver al skeleton).
  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (desde && hasta) {
        params.set('desde', desde);
        params.set('hasta', hasta);
      }
      const res = await fetch(`/api/productividad/mis-honorarios?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudieron cargar tus honorarios');
      }
      const json = (await res.json()) as Payload;
      if (!controller.signal.aborted) setData(json);
    } catch (err) {
      if (controller.signal.aborted) return;
      setData(null);
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [page, desde, hasta]);

  useEffect(() => {
    void fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const cambiarRango = (siguienteDesde: string, siguienteHasta: string, desdeAtajo = false) => {
    if (!desdeAtajo) setPresetActivo(null);
    setDesde(siguienteDesde);
    setHasta(siguienteHasta);
    setPage(1);
  };

  const rangoIncompleto = (!!desde && !hasta) || (!!hasta && !desde);
  const personalizado = !!desde && !!hasta;

  // Atajos de periodo (fechas calculadas solo al hacer clic → sin riesgo de hidratación)
  const [presetActivo, setPresetActivo] = useState<'actual' | 'mes' | 'anterior' | null>('actual');
  const aplicarPreset = (id: 'actual' | 'mes' | 'anterior') => {
    setPresetActivo(id);
    if (id === 'actual') return cambiarRango('', '', true);
    const r = id === 'mes' ? rangoMesActual() : rangoMesAnterior();
    cambiarRango(r.desde, r.hasta, true);
  };

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
        <p className="text-sm font-bold text-fg">{error}</p>
        <button
          type="button"
          onClick={() => fetchData()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-line dark:text-fg dark:hover:bg-surface-2"
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
        <h1 className="text-xl font-extrabold text-fg">Mis Honorarios</h1>
        <p className="text-sm text-muted">
          {data?.doctor_nombre || 'Tus ingresos por servicios'}
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-400/10 dark:text-primary-300">
              <Calendar className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">Periodo</p>
              {data?.rango && (
                <p className="truncate text-xs text-muted tabular-nums">
                  {fmtFecha(data.rango.desde)} — {fmtFecha(data.rango.hasta)}
                </p>
              )}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              personalizado
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
            )}
          >
            {personalizado ? 'Personalizado' : 'Actual'}
          </span>
        </div>

        {/* Atajos */}
        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {([
            ['actual', 'Periodo actual'],
            ['mes', 'Este mes'],
            ['anterior', 'Mes anterior'],
          ] as const).map(([id, label]) => {
            const activo = presetActivo === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => aplicarPreset(id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95',
                  activo
                    ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
                    : 'border-line bg-surface-2 text-fg-2 hover:text-fg',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Rango manual */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-muted">Desde</span>
            <input
              type="date"
              value={desde || data?.rango?.desde || ''}
              max={hasta || data?.rango?.hasta || undefined}
              onChange={(e) => cambiarRango(e.target.value, hasta || data?.rango?.hasta || '')}
              className="h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium text-fg tabular-nums focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-muted">Hasta</span>
            <input
              type="date"
              value={hasta || data?.rango?.hasta || ''}
              min={desde || data?.rango?.desde || undefined}
              onChange={(e) => cambiarRango(desde || data?.rango?.desde || '', e.target.value)}
              className="h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium text-fg tabular-nums focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
            />
          </label>
        </div>
        {rangoIncompleto && (
          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            Completa ambas fechas para filtrar; sin ellas se muestra el periodo actual.
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-line dark:bg-surface">
          <div className="mb-2 h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold text-fg">
            {fmtMoney(resumen?.por_pagar || 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Por pagar</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-line dark:bg-surface">
          <div className="mb-2 h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">
            {fmtMoney(resumen?.pagado || 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Pagado</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-line dark:bg-surface">
          <p className="text-lg font-extrabold text-fg">
            {fmtMoney(resumen?.total_filtrado || 0)}
          </p>
          <p className="text-xs text-muted">Devengado</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-line dark:bg-surface">
          <p className="text-lg font-extrabold text-fg">
            {resumen?.total_eventos ?? 0}
          </p>
          <p className="text-xs text-muted">Servicios</p>
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
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-fg">
            Movimientos
          </h2>
          <span className="text-xs text-muted">
            {data?.total ?? 0} en el periodo
          </span>
        </div>

        {!data || data.items.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-12 text-center dark:border-line dark:bg-surface">
            <TrendingUp className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-line-strong" />
            <p className="text-sm text-muted">
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
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 dark:border-line dark:bg-surface"
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
                    <p className="truncate text-sm font-bold text-fg">
                      {ev.fuente}
                    </p>
                    <p className="truncate text-xs text-muted">
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
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white dark:border-line dark:bg-surface">
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
