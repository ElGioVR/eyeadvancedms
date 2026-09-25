'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, DollarSign, Pencil, Users, Wallet, X } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import StatCard from '@/components/ui/StatCard';
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
const td = 'px-4 py-3 text-sm text-gray-700 dark:text-[#E7E9EA]';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]';

const badgePago: Record<string, string> = {
  PAGADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  POR_PAGAR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  PENDIENTE_CONFIG: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-[#9BA1A6]',
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
  const [metricas, setMetricas] = useState<MetricasPayload | null>(null);
  const [honorarios, setHonorarios] = useState<HonorarioLigaFila[]>([]);
  const [honPage, setHonPage] = useState(1);
  const [honTotal, setHonTotal] = useState(0);
  const [honPageSize, setHonPageSize] = useState(PAGE_SIZE_HONORARIOS);
  const [honCargando, setHonCargando] = useState(false);
  const [honAviso, setHonAviso] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [accionBusy, setAccionBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [agenda, setAgenda] = useState<EventoAgenda[]>([]);
  const [agendaTotal, setAgendaTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const obtenerHonorarios = useCallback(
    async (pagina: number): Promise<HonorariosPayload> => {
      const qs = new URLSearchParams({
        desde,
        hasta,
        doctor_id: doctorId,
        page: String(pagina),
        pageSize: String(PAGE_SIZE_HONORARIOS),
      });
      const res = await fetch(`/api/productividad/honorarios?${qs}`);
      if (!res.ok) throw new Error('No se pudieron cargar los honorarios');
      const json = (await res.json()) as HonorariosPayload;
      return {
        items: json.items || [],
        total: Number(json.total) || 0,
        page: Number(json.page) || pagina,
        pageSize: Number(json.pageSize) || PAGE_SIZE_HONORARIOS,
      };
    },
    [desde, hasta, doctorId]
  );

  const aplicarHonorarios = useCallback((json: HonorariosPayload) => {
    setHonorarios(json.items);
    setHonTotal(json.total);
    setHonPage(json.page);
    setHonPageSize(json.pageSize);
  }, []);

  const cargar = useCallback(async () => {
    if (!doctorId || !desde || !hasta) return;
    setLoading(true);
    setError(null);
    setHonAviso(null);
    setSeleccion(new Set());
    setEditingId(null);
    try {
      const qs = new URLSearchParams({ desde, hasta, doctor_id: doctorId });
      const agendaQs = new URLSearchParams({
        fechaDesde: desde,
        fechaHasta: hasta,
        doctorId,
        pageSize: '100',
      });
      const [resMetricas, resAgenda, honorariosPayload] = await Promise.all([
        fetch(`/api/productividad/metricas?${qs}`),
        fetch(`/api/agenda?${agendaQs}`),
        obtenerHonorarios(1),
      ]);
      if (!resMetricas.ok || !resAgenda.ok) {
        throw new Error('No se pudo cargar el detalle del doctor');
      }
      const [jsonMetricas, jsonAgenda] = (await Promise.all([
        resMetricas.json(),
        resAgenda.json(),
      ])) as [MetricasPayload, { data: EventoAgenda[]; total: number }];
      setMetricas(jsonMetricas);
      aplicarHonorarios(honorariosPayload);
      setAgenda(jsonAgenda.data || []);
      setAgendaTotal(jsonAgenda.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el detalle');
    } finally {
      setLoading(false);
    }
  }, [doctorId, desde, hasta, obtenerHonorarios, aplicarHonorarios]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiarPaginaHon = useCallback(
    async (pagina: number) => {
      setHonCargando(true);
      setHonAviso(null);
      try {
        aplicarHonorarios(await obtenerHonorarios(pagina));
      } catch (err) {
        setHonAviso(err instanceof Error ? err.message : 'Error al cargar honorarios');
      } finally {
        setHonCargando(false);
      }
    },
    [obtenerHonorarios, aplicarHonorarios]
  );

  const toggleSeleccion = useCallback((id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visiblesPagina = honorarios.filter((h) => h.estado_pago === 'POR_PAGAR');
  const todasSeleccionadas =
    visiblesPagina.length > 0 && visiblesPagina.every((h) => seleccion.has(h.id));

  const alternarSeleccionPagina = useCallback(() => {
    const visibles = honorarios.filter((h) => h.estado_pago === 'POR_PAGAR').map((h) => h.id);
    const todas = visibles.length > 0 && visibles.every((id) => seleccion.has(id));
    setSeleccion((prev) => {
      const next = new Set(prev);
      for (const id of visibles) {
        if (todas) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [honorarios, seleccion]);

  const refrescar = useCallback(async () => {
    const qs = new URLSearchParams({ desde, hasta, doctor_id: doctorId });
    const [honorariosActualizados, resMetricas] = await Promise.all([
      obtenerHonorarios(honPage),
      fetch(`/api/productividad/metricas?${qs}`),
    ]);
    aplicarHonorarios(honorariosActualizados);
    if (resMetricas.ok) setMetricas((await resMetricas.json()) as MetricasPayload);
  }, [honPage, desde, hasta, doctorId, obtenerHonorarios, aplicarHonorarios]);

  const pagar = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      setAccionBusy(true);
      setHonAviso(null);
      try {
        const res = await fetch('/api/productividad/honorarios/pagar', {
          method: 'POST',
          body: JSON.stringify({ ids }),
        });
        const body = (await res.json().catch(() => null)) as
          | { pagados?: number; omitidos?: Array<{ id: string; motivo: string }>; error?: string }
          | null;
        if (!res.ok) throw new Error(body?.error || 'Error al pagar');

        await refrescar();
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
        setHonAviso(err instanceof Error ? err.message : 'Error al pagar');
      } finally {
        setAccionBusy(false);
      }
    },
    [refrescar]
  );

  const iniciarEdicion = useCallback((fila: HonorarioLigaFila) => {
    setEditingId(fila.id);
    setEditMonto(String(fila.monto));
    setHonAviso(null);
  }, []);

  const guardarMonto = useCallback(async () => {
    if (!editingId) return;
    const n = Number(editMonto);
    if (!Number.isFinite(n) || n < 0) {
      setHonAviso('Monto inválido');
      return;
    }
    setEditBusy(true);
    setHonAviso(null);
    try {
      const res = await fetch(`/api/productividad/honorarios/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ monto: Math.round(n * 100) / 100 }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Error al guardar monto');
      }
      setEditingId(null);
      await refrescar();
      setHonAviso('Monto actualizado');
    } catch (err) {
      setHonAviso(err instanceof Error ? err.message : 'Error al guardar monto');
    } finally {
      setEditBusy(false);
    }
  }, [editingId, editMonto, refrescar]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !metricas) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
        {error || 'Sin datos'}
      </div>
    );
  }

  const k = metricas.kpis;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-sm font-medium text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
          >
            <ArrowLeft className="w-4 h-4" /> Doctores
          </button>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{nombre}</p>
            <p className="text-xs text-gray-400">
              {formatFechaCsv(desde)} – {formatFechaCsv(hasta)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-[#2F3336]">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
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
            Pagar seleccionados ({seleccion.size})
          </button>
        </div>

        {honAviso && (
          <p
            role="status"
            className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-[#9BA1A6] bg-gray-50 dark:bg-[#202327]/50 border-b border-gray-100 dark:border-[#2F3336]"
          >
            {honAviso}
          </p>
        )}

        {honorarios.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 dark:text-[#71767B]">
            Sin eventos de honorarios en el rango seleccionado.
          </p>
        ) : (
          <div
            className={`overflow-x-auto ${honCargando ? 'opacity-60' : ''}`}
            aria-busy={honCargando}
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#202327]/50">
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
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {honorarios.map((h) => {
                  const seleccionable = h.estado_pago === 'POR_PAGAR';
                  const editable = h.estado_pago !== 'PAGADO' && h.estado_pago !== 'CANCELADO';
                  return (
                    <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
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
                              className="w-24 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-2 py-1 text-right text-sm"
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
                            'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-[#9BA1A6]'
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
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-gray-600 dark:text-[#9BA1A6] hover:bg-gray-100 dark:hover:bg-[#202327]"
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
              onPageChange={(p) => void cambiarPaginaHon(p)}
              label="honorarios del doctor"
            />
          </div>
        )}
      </div>
    </div>
  );
}
