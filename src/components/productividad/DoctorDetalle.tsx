'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, CheckCircle2, DollarSign, Pencil, Users, Wallet, X } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import StatCard from '@/components/ui/StatCard';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { useToast } from '@/components/ui/Toast';
import { useInvalidar } from '@/hooks';
import { enviarJSON } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/money';
import { formatFechaCsv } from '@/lib/rangos';
import type { MetricasPayload } from '@/lib/productividad/metricas';
import type { HonorarioLigaFila } from '@/types/productividad';
import {
  ALTURA_DONUT,
  ALTURA_SERIE,
  ChartCard,
  DonutFuente,
  SerieDiaria,
} from './charts';
import AgendaCalendario, { type EventoAgenda } from './AgendaCalendario';

const th = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400';
const thR = 'px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-4 py-3 text-sm text-fg-2';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-fg';

const badgePago: Record<string, string> = {
  PAGADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  POR_PAGAR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  PENDIENTE_CONFIG: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-fg-2',
  CANCELADO: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  PENDIENTE: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
};

interface HonorariosPayload {
  items: HonorarioLigaFila[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE_HONORARIOS = 10;

function mensajeError(err: unknown, fallback: string): string | null {
  if (!err) return null;
  return err instanceof Error ? err.message : fallback;
}

export default function DoctorDetalle({
  doctorId,
  nombre,
  desde,
  hasta,
  onCerrar,
}: {
  doctorId: string;
  nombre: string;
  desde: string;
  hasta: string;
  onCerrar: () => void;
}) {
  const { toast } = useToast();
  const invalidar = useInvalidar();
  const listo = !!doctorId && !!desde && !!hasta;
  const filtro = `${doctorId}|${desde}|${hasta}`;

  // Página de honorarios ligada al filtro: al cambiar doctor/rango vuelve a 1
  // sin pedir antes la página anterior del filtro nuevo.
  const [paginado, setPaginado] = useState({ filtro, page: 1 });
  const honPage = paginado.filtro === filtro ? paginado.page : 1;

  const [honAviso, setHonAviso] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [accionBusy, setAccionBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Misma URL (y orden de parámetros) que la vista de métricas con doctor → caché compartida.
  const urlMetricas = listo
    ? `/api/productividad/metricas?${new URLSearchParams({ desde, hasta, doctor_id: doctorId })}`
    : null;
  const urlAgenda = listo
    ? `/api/agenda?${new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta, doctorId, pageSize: '100' })}`
    : null;
  const urlHonorarios = listo
    ? `/api/productividad/honorarios?${new URLSearchParams({
        desde,
        hasta,
        doctor_id: doctorId,
        page: String(honPage),
        pageSize: String(PAGE_SIZE_HONORARIOS),
      })}`
    : null;

  const metricasSwr = useSWR<MetricasPayload>(urlMetricas);
  const agendaSwr = useSWR<{ data: EventoAgenda[]; total: number }>(urlAgenda);
  const honSwr = useSWR<HonorariosPayload>(urlHonorarios);
  const { mutate: mutateHon } = honSwr;

  const metricas = metricasSwr.data ?? null;
  const agenda = agendaSwr.data?.data || [];
  const agendaTotal = agendaSwr.data?.total || 0;
  const honorarios = useMemo(() => honSwr.data?.items || [], [honSwr.data]);
  const honTotal = Number(honSwr.data?.total) || 0;
  const honPageSize = Number(honSwr.data?.pageSize) || PAGE_SIZE_HONORARIOS;
  const honCargando = honSwr.isValidating;
  const validandoDetalle = metricasSwr.isValidating || agendaSwr.isValidating;
  const error =
    mensajeError(metricasSwr.error, 'Error al cargar el detalle') ||
    mensajeError(agendaSwr.error, 'No se pudo cargar el detalle del doctor');
  const errorHon = mensajeError(honSwr.error, 'Error al cargar honorarios');

  // Cambio de doctor o rango: limpia selección/edición (los datos previos se ven atenuados).
  useEffect(() => {
    setSeleccion(new Set());
    setEditingId(null);
    setHonAviso(null);
  }, [filtro]);

  const cambiarPaginaHon = useCallback(
    (pagina: number) => {
      setHonAviso(null);
      setPaginado({ filtro, page: pagina });
    },
    [filtro]
  );

  const toggleSeleccion = useCallback((id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visiblesPagina = useMemo(() => honorarios.filter((h) => h.estado_pago === 'POR_PAGAR'), [honorarios]);
  const todasSeleccionadas =
    visiblesPagina.length > 0 && visiblesPagina.every((h) => seleccion.has(h.id));

  const alternarSeleccionPagina = useCallback(() => {
    const visibles = visiblesPagina.map((h) => h.id);
    const todas = visibles.length > 0 && visibles.every((id) => seleccion.has(id));
    setSeleccion((prev) => {
      const next = new Set(prev);
      for (const id of visibles) {
        if (todas) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [visiblesPagina, seleccion]);

  const pagar = useCallback(
    async (ids: string[]) => {
      if (!ids.length || accionBusy) return;
      setAccionBusy(true);
      setHonAviso(null);
      const marcar = new Set(ids);
      const previo = honSwr.data;
      // Optimista: las filas quedan como PAGADO al instante; el servidor confirma.
      if (previo) {
        void mutateHon(
          {
            ...previo,
            items: previo.items.map((h) =>
              marcar.has(h.id) && h.estado_pago === 'POR_PAGAR' ? { ...h, estado_pago: 'PAGADO' as const } : h
            ),
          },
          { revalidate: false }
        );
      }
      try {
        const body = await enviarJSON<{ pagados?: number; omitidos?: Array<{ id: string; motivo: string }> } | null>(
          '/api/productividad/honorarios/pagar',
          'POST',
          { ids }
        );
        setSeleccion(new Set());
        setEditingId(null);
        const pagados = body?.pagados || 0;
        const omitidos = body?.omitidos?.length || 0;
        setHonAviso(
          omitidos > 0
            ? `${pagados} pago(s) registrados · ${omitidos} omitido(s)`
            : `${pagados} pago(s) registrados`
        );
      } catch (err) {
        if (previo) void mutateHon(previo, { revalidate: false });
        toast(err instanceof Error ? err.message : 'Error al pagar', 'error');
      } finally {
        setAccionBusy(false);
        // Métricas, honorarios, pagos y listados de productividad se revalidan en segundo plano.
        void invalidar('/api/productividad');
      }
    },
    [accionBusy, honSwr.data, mutateHon, invalidar, toast]
  );

  const iniciarEdicion = useCallback((fila: HonorarioLigaFila) => {
    setEditingId(fila.id);
    setEditMonto(String(fila.monto));
    setHonAviso(null);
  }, []);

  const guardarMonto = useCallback(async () => {
    if (!editingId || editBusy) return;
    const n = Number(editMonto);
    if (editMonto.trim() === '' || !Number.isFinite(n) || n < 0) {
      setHonAviso('Monto inválido');
      return;
    }
    const monto = Math.round(n * 100) / 100;
    setEditBusy(true);
    setHonAviso(null);
    const previo = honSwr.data;
    if (previo) {
      void mutateHon(
        { ...previo, items: previo.items.map((h) => (h.id === editingId ? { ...h, monto } : h)) },
        { revalidate: false }
      );
    }
    try {
      await enviarJSON(`/api/productividad/honorarios/${editingId}`, 'PATCH', { monto });
      setEditingId(null);
      setHonAviso('Monto actualizado');
    } catch (err) {
      if (previo) void mutateHon(previo, { revalidate: false });
      toast(err instanceof Error ? err.message : 'Error al guardar monto', 'error');
    } finally {
      setEditBusy(false);
      void invalidar('/api/productividad');
    }
  }, [editingId, editBusy, editMonto, honSwr.data, mutateHon, invalidar, toast]);

  if (!metricas && !error) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!metricas) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
        {error || 'Sin datos'}
      </div>
    );
  }

  const k = metricas.kpis;

  return (
    <div className="relative space-y-4 animate-fadeIn" aria-busy={validandoDetalle}>
      <BarraRevalidando activo={validandoDetalle} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2"
          >
            <ArrowLeft className="w-4 h-4" /> Doctores
          </button>
          <div>
            <p className="text-sm font-bold text-fg">{nombre}</p>
            <p className="text-xs text-gray-400">
              {formatFechaCsv(desde)} – {formatFechaCsv(hasta)}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <div className="valor-suave grid grid-cols-2 lg:grid-cols-4 gap-4" data-validando={metricasSwr.isValidating}>
        <StatCard
          icon={DollarSign}
          label="Devengado"
          value={formatCurrency(k.monto)}
          color="text-primary-600"
          bgColor="bg-primary-50"
        />
        <StatCard
          icon={CheckCircle2}
          label="Pagado"
          value={formatCurrency(k.pagado)}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          icon={Wallet}
          label="Por pagar"
          value={formatCurrency(k.por_pagar)}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          icon={Users}
          label="Eventos"
          value={String(k.eventos)}
          color="text-violet-600"
          bgColor="bg-violet-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard titulo="Por fuente" ayuda="Monto" alto={ALTURA_DONUT}>
          <DonutFuente data={metricas.por_fuente} />
        </ChartCard>
        <ChartCard titulo="Tendencia diaria" ayuda="Monto por fecha" alto={ALTURA_SERIE}>
          <SerieDiaria data={metricas.serie_diaria} />
        </ChartCard>
      </div>

      <AgendaCalendario
        key={`${doctorId}-${desde}-${hasta}`}
        agenda={agenda}
        total={agendaTotal}
        desde={desde}
        hasta={hasta}
      />

      <div className="relative rounded-2xl border border-line bg-surface overflow-hidden">
        <BarraRevalidando activo={honCargando} />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line/70">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-fg">
              Honorarios del doctor
            </h3>
            <span className="text-xs text-gray-400">{honTotal} eventos</span>
          </div>
          <button
            type="button"
            onClick={() => void pagar([...seleccion])}
            disabled={accionBusy || seleccion.size === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {accionBusy ? 'Pagando…' : `Pagar seleccionados (${seleccion.size})`}
          </button>
        </div>

        {honAviso && (
          <p
            role="status"
            className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-fg-2 bg-gray-50 dark:bg-surface-2/50 border-b border-line/70"
          >
            {honAviso}
          </p>
        )}

        {errorHon && (
          <p role="alert" className="px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 border-b border-line/70">
            {errorHon}
          </p>
        )}

        {honorarios.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Sin eventos de honorarios en el rango seleccionado.
          </p>
        ) : (
          <div
            className="valor-suave overflow-x-auto"
            data-validando={honCargando}
            aria-busy={honCargando}
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface-2/50">
                  <th className={th}>
                    <input
                      type="checkbox"
                      checked={todasSeleccionadas}
                      onChange={() => alternarSeleccionPagina()}
                      disabled={accionBusy || visiblesPagina.length === 0}
                      className="rounded border-gray-300"
                      aria-label="Seleccionar todos de la página"
                    />
                  </th>
                  <th className={th}>Fecha</th>
                  <th className={th}>Fuente</th>
                  <th className={th}>Origen</th>
                  <th className={thR}>Monto</th>
                  <th className={th}>Estatus</th>
                  <th className={th}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {honorarios.map((h) => {
                  const seleccionable = h.estado_pago === 'POR_PAGAR';
                  const editable = h.estado_pago !== 'PAGADO' && h.estado_pago !== 'CANCELADO';
                  return (
                    <tr key={h.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3">
                        {seleccionable && (
                          <input
                            type="checkbox"
                            checked={seleccion.has(h.id)}
                            onChange={() => toggleSeleccion(h.id)}
                            disabled={accionBusy}
                            className="rounded border-gray-300"
                            aria-label={`Seleccionar ${h.id}`}
                          />
                        )}
                      </td>
                      <td className={td}>{h.fecha ? formatFechaCsv(h.fecha) : '—'}</td>
                      <td className={td}>{h.fuente}</td>
                      <td className={td}>{h.origen || '—'}</td>
                      <td className={tdR}>
                        {editingId === h.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={editMonto}
                              onChange={(e) => setEditMonto(e.target.value)}
                              autoFocus
                              aria-label="Monto"
                              className="w-24 rounded-lg border border-line bg-surface-2 px-2 py-1 text-right text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => void guardarMonto()}
                              disabled={editBusy}
                              className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                              aria-label="Guardar monto"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={editBusy}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                              aria-label="Cancelar edición"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          formatCurrency(h.monto)
                        )}
                      </td>
                      <td className={td}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            badgePago[h.estado_pago] ||
                            'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-fg-2'
                          }`}
                        >
                          {h.estado_pago}
                        </span>
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          {editable && editingId !== h.id && (
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(h)}
                              disabled={accionBusy || editBusy}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-gray-600 dark:text-fg-2 hover:bg-surface-2"
                            >
                              <Pencil className="w-3 h-3" /> Monto
                            </button>
                          )}
                          {seleccionable && editingId !== h.id && (
                            <button
                              type="button"
                              onClick={() => void pagar([h.id])}
                              disabled={accionBusy || h.monto <= 0}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 disabled:opacity-50"
                            >
                              Pagar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={honPage}
              total={honTotal}
              pageSize={honPageSize}
              totalItems={honTotal}
              onPageChange={cambiarPaginaHon}
              label="honorarios del doctor"
            />
          </div>
        )}
      </div>
    </div>
  );
}
