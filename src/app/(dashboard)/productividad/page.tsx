'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  History,
  Lock,
  Pencil,
  RefreshCw,
  Scissors,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import FiltrosReporte from '@/components/productividad/FiltrosReporte';
import ModalRangoFechas, { type RangoFechas } from '@/components/productividad/ModalRangoFechas';
import Embudo from '@/components/productividad/Embudo';
import PagosHistorial from '@/components/productividad/PagosHistorial';
import { formatCurrency } from '@/lib/money';
import { formatFechaCsv, rangoMesActual } from '@/lib/rangos';
import { useUser } from '@/hooks/useUser';
import type { MetricasPayload } from '@/lib/productividad/metricas';
import type {
  HonorarioLigaFila,
  HonorariosListado,
  HonorariosResumen,
  TipoAgrupacionLiga,
  TipoPeriodoPago,
} from '@/types/productividad';

const MetricasSeccion = dynamic(
  () => import('@/components/productividad/MetricasSeccion'),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    ),
  }
);

const DoctorDetalle = dynamic(() => import('@/components/productividad/DoctorDetalle'), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-xl" />,
});

type VistaId = 'metricas' | 'honorarios' | 'doctores' | 'pagos' | 'sync';

type ReporteCsvTab = 'metricas' | 'honorarios' | 'pagos' | 'entradas_salidas' | 'cirugias';

const REPORTES: Array<{
  id: ReporteCsvTab;
  label: string;
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
  title: string;
}> = [
  {
    id: 'cirugias',
    label: 'Cirugías',
    icon: Scissors,
    titulo: 'Reporte de cirugías',
    descripcion: 'Cirugías de la agenda con paciente, LIO, tiempos y cirujano.',
    title: 'Descargar reporte CSV de cirugías del rango seleccionado',
  },
  {
    id: 'entradas_salidas',
    label: 'Entradas y salidas',
    icon: ArrowLeftRight,
    titulo: 'Reporte de entradas y salidas',
    descripcion: 'Consultas del rango con ingreso, egreso y datos del paciente.',
    title: 'Descargar reporte CSV de entradas y salidas de consultas',
  },
  {
    id: 'honorarios',
    label: 'Honorarios',
    icon: Download,
    titulo: 'Reporte de honorarios',
    descripcion: 'Devengos del rango con doctor, fuente, monto y estado de pago.',
    title: 'Descargar reporte CSV de honorarios del rango seleccionado',
  },
];

const VISTAS: Array<{ id: VistaId; label: string; icon: LucideIcon }> = [
  { id: 'metricas', label: 'Métricas', icon: BarChart3 },
  { id: 'honorarios', label: 'Honorarios', icon: Wallet },
  { id: 'doctores', label: 'Doctores', icon: Users },
  { id: 'pagos', label: 'Pagos', icon: History },
  { id: 'sync', label: 'Sync', icon: RefreshCw },
];

const FUENTES = ['CIRUGIA', 'CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO'];
const ESTADOS = ['POR_PAGAR', 'PAGADO', 'PENDIENTE_CONFIG', 'CANCELADO'];
const AGRUPACIONES: Array<{ id: 'detalle' | TipoAgrupacionLiga; label: string }> = [
  { id: 'detalle', label: 'Detalle' },
  { id: 'dia', label: 'Por día' },
  { id: 'doctor', label: 'Por doctor' },
  { id: 'fuente', label: 'Por fuente' },
];

const PERIODOS: TipoPeriodoPago[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL'];

interface DoctorOption {
  id: string;
  nombre: string;
}

const EMPTY_RESUMEN: HonorariosResumen = {
  por_pagar: 0,
  pagado: 0,
  sin_monto: 0,
  cancelado: 0,
  total_filtrado: 0,
  total_eventos: 0,
};

const estadoPagoBadge: Record<string, string> = {
  PAGADO: 'bg-emerald-100 text-emerald-700',
  POR_PAGAR: 'bg-amber-100 text-amber-700',
  PENDIENTE_CONFIG: 'bg-gray-100 text-gray-600',
  CANCELADO: 'bg-rose-100 text-rose-700',
  PENDIENTE: 'bg-sky-100 text-sky-700',
};

function badge(estado: string | null | undefined): string {
  if (!estado) return 'bg-gray-100 text-gray-600';
  return estadoPagoBadge[estado] || 'bg-sky-100 text-sky-700';
}

function metricasTexto(m: HonorarioLigaFila['metricas_ligados']): string {
  const parts: string[] = [];
  if (m.estudios_ligados) parts.push(`${m.estudios_ligados} est.`);
  if (m.procedimientos_ligados) parts.push(`${m.procedimientos_ligados} proc.`);
  if (m.cirugias_ligadas) parts.push(`${m.cirugias_ligadas} cir.`);
  return parts.length ? parts.join(' · ') : '—';
}

function SyncTab() {
  const { user } = useUser();
  const isAdmin = user?.rol === 'admin';
  const [syncResult, setSyncResult] = useState<{
    consultas_verificadas?: number;
    cirugias_verificadas?: number;
    eventos_creados?: number;
    eventos_existentes?: number;
    consultas_desplegadas?: number;
    cirugias_desplegadas?: number;
    pendientes_antes?: { consultas?: number; cirugias?: number; doctores_sin_evento?: number };
    doctores_sin_evento?: Array<{ doctor_id: string; doctor_nombre: string; origen: string; ref: string }>;
    errores?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [preview, setPreview] = useState<{
    consultas_pendientes?: number;
    cirugias_pendientes?: number;
    doctores_sin_evento?: Array<{ doctor_id: string; doctor_nombre: string; origen: string; ref: string }>;
  } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/productividad/sync')
      .then((r) => r.json())
      .then((data) => { setLogs(Array.isArray(data) ? data : []); })
      .catch(() => {});
  }, [isAdmin]);

  const cargarPreview = async () => {
    try {
      const params = new URLSearchParams({ preview: '1' });
      if (fechaDesde) params.set('desde', fechaDesde);
      if (fechaHasta) params.set('hasta', fechaHasta);
      const res = await fetch(`/api/productividad/sync?${params}`);
      if (res.ok) setPreview(await res.json());
    } catch {
      setPreview(null);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void cargarPreview();
  }, [isAdmin, fechaDesde, fechaHasta]);

  const handleSync = async (soloPendientes = false) => {
    setLoading(true);
    const body: Record<string, unknown> = {};
    if (fechaDesde) body.fecha_desde = fechaDesde;
    if (fechaHasta) body.fecha_hasta = fechaHasta;
    if (soloPendientes) body.solo_pendientes = true;
    const res = await fetch(`/api/productividad/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSyncResult(data.sync || data);
    setLoading(false);
    const logsRes = await fetch('/api/productividad/sync').then((r) => r.json());
    setLogs(Array.isArray(logsRes) ? logsRes : []);
    void cargarPreview();
  };

  if (!isAdmin) return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;

  const sinEvento = preview?.doctores_sin_evento || [];

  return (
    <div className="space-y-6">
      <PageHeader title="Sync" subtitle="Desplegar honorarios a productividad (flag deployed_to_performance)" />
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} placeholder="Desde" className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} placeholder="Hasta" className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm" />
        </div>
        {preview && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Pendientes de despliegue</p>
            <p className="text-amber-700 dark:text-amber-400">
              {preview.consultas_pendientes || 0} consultas · {preview.cirugias_pendientes || 0} cirugías · {sinEvento.length} doctor(es) sin evento de honorario
            </p>
            {sinEvento.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs max-h-40 overflow-y-auto">
                {sinEvento.slice(0, 20).map((d, i) => (
                  <li key={i} className="text-amber-900 dark:text-amber-200">
                    {d.doctor_nombre} — {d.origen} · {d.ref.slice(0, 8)}
                  </li>
                ))}
                {sinEvento.length > 20 && (
                  <li className="text-amber-600">… y {sinEvento.length - 20} más</li>
                )}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => handleSync(false)} disabled={loading} className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Sincronizando...' : 'Ejecutar Sync (rango)'}
          </button>
          <button onClick={() => handleSync(true)} disabled={loading} className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Desplegando...' : 'Desplegar solo pendientes'}
          </button>
        </div>
      </div>
      {syncResult && (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <h3 className="text-sm font-bold mb-2">Resultado de Sync</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div><p className="text-xs text-gray-500">Consultas verificadas</p><p className="text-lg font-bold">{syncResult.consultas_verificadas}</p></div>
            <div><p className="text-xs text-gray-500">Cirugías verificadas</p><p className="text-lg font-bold">{syncResult.cirugias_verificadas}</p></div>
            <div><p className="text-xs text-gray-500">Eventos creados</p><p className="text-lg font-bold text-emerald-600">{syncResult.eventos_creados}</p></div>
            <div><p className="text-xs text-gray-500">Eventos existentes</p><p className="text-lg font-bold">{syncResult.eventos_existentes}</p></div>
            <div><p className="text-xs text-gray-500">Consultas desplegadas</p><p className="text-lg font-bold text-sky-600">{syncResult.consultas_desplegadas}</p></div>
            <div><p className="text-xs text-gray-500">Cirugías desplegadas</p><p className="text-lg font-bold text-sky-600">{syncResult.cirugias_desplegadas}</p></div>
          </div>
          {syncResult.doctores_sin_evento && syncResult.doctores_sin_evento.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Doctores sin honorario previo al sync</p>
              <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {syncResult.doctores_sin_evento.map((d, i) => (
                  <li key={i} className="text-amber-900 dark:text-amber-200">{d.doctor_nombre} — {d.origen}</li>
                ))}
              </ul>
            </div>
          )}
          {syncResult.errores && syncResult.errores.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.errores.map((e: string, i: number) => <p key={i} className="text-xs text-rose-600">{e}</p>)}
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
          <h3 className="text-sm font-bold p-4 border-b border-gray-200 dark:border-[#2F3336]">Historial de Sync</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#202327]/50">
                  <th className={th}>Fecha</th>
                  <th className={th}>Consultas</th>
                  <th className={th}>Cirugías</th>
                  <th className={th}>Creados</th>
                  <th className={th}>Errores</th>
                  <th className={th}>Duración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                {logs.map((l) => (
                  <tr key={String(l.id)} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                    <td className={td}>{String(l.fecha_inicio)}</td>
                    <td className={td}>{String(l.consultas_verificadas)}</td>
                    <td className={td}>{String(l.cirugias_verificadas)}</td>
                    <td className={td}>{String(l.eventos_creados)}</td>
                    <td className={td}>{String(l.errores)}</td>
                    <td className={td}>{(Number(l.duracion_ms) / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const th =
  'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400';
const thR = 'px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-4 py-3 text-sm text-gray-700 dark:text-[#E7E9EA]';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]';

export default function ProductividadPage() {
  const { user, loading: userLoading } = useUser();
  const isAdmin = user?.rol === 'admin';

  const [vista, setVista] = useState<VistaId>('metricas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctores, setDoctores] = useState<DoctorOption[]>([]);
  const [liga, setLiga] = useState<HonorariosListado | null>(null);
  const [metricas, setMetricas] = useState<MetricasPayload | null>(null);
  const [cargandoMetricas, setCargandoMetricas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [fuente, setFuente] = useState('');
  const [estado, setEstado] = useState('');
  const [vistaAgrup, setVistaAgrup] = useState<'detalle' | TipoAgrupacionLiga>('detalle');
  const [doctorSel, setDoctorSel] = useState<DoctorOption | null>(null);
  const [periodoTipo, setPeriodoTipo] = useState<TipoPeriodoPago>('MENSUAL');
  const [panelDoctor, setPanelDoctor] = useState<{ id: string; nombre: string } | null>(null);
  const [panelData, setPanelData] = useState<HonorariosListado | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [reporteModal, setReporteModal] = useState<ReporteCsvTab | null>(null);
  const [reporteCargando, setReporteCargando] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const abortLigaRef = useRef<AbortController | null>(null);
  const abortMetricasRef = useRef<AbortController | null>(null);

  const fetchMetricas = useCallback(
    async (fdesde: string, fhasta: string, fdoctor: string, signal?: AbortSignal) => {
      if (!fdesde || !fhasta) return;
      abortMetricasRef.current?.abort();
      const controller = new AbortController();
      abortMetricasRef.current = controller;
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort());
      }
      setCargandoMetricas(true);
      setError(null);
      try {
        const params = new URLSearchParams({ desde: fdesde, hasta: fhasta });
        if (fdoctor) params.set('doctor_id', fdoctor);
        const res = await fetch(`/api/productividad/metricas?${params}`, { signal: controller.signal });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Error ${res.status}`);
        }
        const json = (await res.json()) as MetricasPayload;
        if (!controller.signal.aborted) setMetricas(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Error al cargar métricas');
          setMetricas(null);
        }
      } finally {
        if (!controller.signal.aborted) setCargandoMetricas(false);
      }
    },
    []
  );

  const fetchLiga = useCallback(
    async (
      fdesde: string,
      fhasta: string,
      fdoctor: string,
      fpage: number,
      ffuente: string,
      festado: string,
      fagrup: 'detalle' | TipoAgrupacionLiga,
      signal?: AbortSignal
    ) => {
      if (!fdesde || !fhasta) return;
      abortLigaRef.current?.abort();
      const controller = new AbortController();
      abortLigaRef.current = controller;
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort());
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          desde: fdesde,
          hasta: fhasta,
          page: String(fpage),
          pageSize: '10',
        });
        if (fdoctor) params.set('doctor_id', fdoctor);
        if (ffuente) params.set('fuente', ffuente);
        if (festado) params.set('estado', festado);
        if (fagrup !== 'detalle') params.set('agrupar_por', fagrup);
        const res = await fetch(`/api/productividad/honorarios?${params}`, { signal: controller.signal });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Error ${res.status}`);
        }
        const json = (await res.json()) as HonorariosListado;
        if (!controller.signal.aborted) {
          setLiga(json);
          setPeriodoTipo(json.periodo_tipo);
          setSelected(new Set());
          const pResp = Math.floor(Number(json.page) || 0);
          if (pResp > 0) setPage(pResp);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Error al cargar honorarios');
          setLiga(null);
        }
      } finally {
        if (abortLigaRef.current === controller) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (userLoading || !isAdmin) return;
    const r = rangoMesActual();
    setDesde(r.desde);
    setHasta(r.hasta);

    const ac = new AbortController();
    void fetchMetricas(r.desde, r.hasta, '', ac.signal);

    fetch('/api/configuracion/doctores')
      .then((res) => (res.ok ? res.json() : []))
      .then((docs: Array<{ id: string; alias?: string; nombre?: string }>) =>
        setDoctores(
          (docs || []).map((d) => ({
            id: d.id,
            nombre: d.alias || d.nombre || d.id,
          }))
        )
      )
      .catch(() => setDoctores([]));

    fetch('/api/productividad/config-periodo')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { tipo?: TipoPeriodoPago } | null) => {
        if (json?.tipo) setPeriodoTipo(json.tipo);
      })
      .catch(() => {});

    return () => ac.abort();
  }, [userLoading, isAdmin, fetchMetricas]);

  const fetchPanelDoctor = useCallback(async (id: string, p: number, fdesde: string, fhasta: string) => {
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (fdesde) params.set('desde', fdesde);
      if (fhasta) params.set('hasta', fhasta);
      const res = await fetch(`/api/productividad/honorarios/doctor/${id}?pageSize=10&${params}`);
      if (res.ok) setPanelData((await res.json()) as HonorariosListado);
      else setPanelData(null);
    } catch {
      setPanelData(null);
    }
  }, []);

  const handleFilter = useCallback(
    (f: { fecha_desde?: string; fecha_hasta?: string; doctor_id?: string }) => {
      const fd = f.fecha_desde || desde;
      const fh = f.fecha_hasta || hasta;
      const doc = f.doctor_id !== undefined ? f.doctor_id : doctorId;
      setDesde(fd);
      setHasta(fh);
      setDoctorId(doc);
      setPage(1);
      if (!fd || !fh) return;
      if (panelDoctor) void fetchPanelDoctor(panelDoctor.id, 1, fd, fh);
      if (vista === 'honorarios') {
        void fetchLiga(fd, fh, doc, 1, fuente, estado, vistaAgrup);
      } else if (vista === 'metricas' || vista === 'doctores') {
        void fetchMetricas(fd, fh, doc);
      }
    },
    [desde, hasta, doctorId, panelDoctor, vista, fuente, estado, vistaAgrup, fetchLiga, fetchMetricas, fetchPanelDoctor]
  );

  const handleVista = useCallback(
    (next: string) => {
      const id = (VISTAS.some((v) => v.id === next) ? next : 'metricas') as VistaId;
      setVista(id);
      if (!desde || !hasta || !isAdmin) return;
      setPage(1);
      if (id === 'honorarios') void fetchLiga(desde, hasta, doctorId, 1, fuente, estado, vistaAgrup);
      if (id === 'metricas' || id === 'doctores') void fetchMetricas(desde, hasta, doctorId);
    },
    [desde, hasta, doctorId, fuente, estado, vistaAgrup, isAdmin, fetchLiga, fetchMetricas]
  );

  const cambiarPeriodo = useCallback(async (tipo: TipoPeriodoPago) => {
    setPeriodoTipo(tipo);
    try {
      await fetch('/api/productividad/config-periodo', {
        method: 'PUT',
        body: JSON.stringify({ tipo }),
      });
      if (desde && hasta) void fetchLiga(desde, hasta, doctorId, page, fuente, estado, vistaAgrup);
    } catch {
      // el valor optimista se reconcilia en el próximo fetch
    }
  }, [desde, hasta, doctorId, page, fuente, estado, vistaAgrup, fetchLiga]);

  const abrirPanelDoctor = useCallback(
    async (id: string, nombre: string) => {
      setPage(1);
      setPanelDoctor({ id, nombre });
      setSelected(new Set());
      await fetchPanelDoctor(id, 1, desde, hasta);
    },
    [fetchPanelDoctor, desde, hasta]
  );

  const cerrarPanel = useCallback(() => {
    setPanelDoctor(null);
    setPanelData(null);
    setSelected(new Set());
    setPage(1);
    if (desde && hasta) void fetchLiga(desde, hasta, doctorId, 1, fuente, estado, vistaAgrup);
  }, [desde, hasta, doctorId, fuente, estado, vistaAgrup, fetchLiga]);

  const iniciarEdicion = useCallback((fila: HonorarioLigaFila) => {
    setEditingId(fila.id);
    setEditMonto(String(fila.monto));
  }, []);

  const guardarMonto = useCallback(async () => {
    if (!editingId) return;
    const n = Number(editMonto);
    if (!Number.isFinite(n) || n < 0) return;
    setEditBusy(true);
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
      if (panelDoctor) {
        await fetchPanelDoctor(panelDoctor.id, page, desde, hasta);
      } else if (desde && hasta) {
        void fetchLiga(desde, hasta, doctorId, page, fuente, estado, vistaAgrup);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar monto');
    } finally {
      setEditBusy(false);
    }
  }, [editingId, editMonto, panelDoctor, desde, hasta, doctorId, page, fuente, estado, vistaAgrup, fetchLiga, fetchPanelDoctor]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pagarSeleccionados = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setActionBusy(true);
    try {
      const res = await fetch('/api/productividad/honorarios/pagar', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      const body = (await res.json().catch(() => null)) as
        | { pagados?: number; omitidos?: Array<{ id: string; motivo: string }>; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error || 'Error al pagar');
      setSelected(new Set());
      if (panelDoctor) {
        await fetchPanelDoctor(panelDoctor.id, page, desde, hasta);
      } else if (desde && hasta) {
        void fetchLiga(desde, hasta, doctorId, page, fuente, estado, vistaAgrup);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al pagar');
    } finally {
      setActionBusy(false);
    }
  }, [panelDoctor, desde, hasta, doctorId, page, fuente, estado, vistaAgrup, fetchLiga, fetchPanelDoctor]);

  const cambiarPagina = useCallback(
    (pRaw: number) => {
      const p = Math.max(1, Math.floor(Number(pRaw) || 1));
      setPage(p);
      if (panelDoctor) {
        void fetchPanelDoctor(panelDoctor.id, p, desde, hasta);
        return;
      }
      const rangoActivo = desde && hasta ? { desde, hasta } : (liga?.rango ?? rangoMesActual());
      void fetchLiga(rangoActivo.desde, rangoActivo.hasta, doctorId, p, fuente, estado, vistaAgrup);
    },
    [panelDoctor, fetchPanelDoctor, desde, hasta, liga, doctorId, fuente, estado, vistaAgrup, fetchLiga]
  );

  const descargarReporte = useCallback(
    async (tipo: ReporteCsvTab, rango?: RangoFechas, doctorSel?: string) => {
      const fdesde = rango?.desde || desde;
      const fhasta = rango?.hasta || hasta;
      if (!fdesde || !fhasta) return;
      setReporteCargando(true);
      try {
        const params = new URLSearchParams({ desde: fdesde, hasta: fhasta, formato: 'csv' });
        const doctorElegido = doctorSel === undefined ? doctorId : doctorSel;
        if (doctorElegido) params.set('doctor_id', doctorElegido);
        let url = '';
        let nombre = '';
        if (tipo === 'metricas') {
          url = `/api/productividad/metricas?${params}`;
          nombre = `productividad-metricas-${fdesde}_${fhasta}.csv`;
        } else if (tipo === 'pagos') {
          url = `/api/productividad/honorarios/pagos?${params}`;
          nombre = `historial-pagos-${fdesde}_${fhasta}.csv`;
        } else if (tipo === 'cirugias') {
          url = `/api/productividad/reportes/cirugias?${params}`;
          nombre = `cirugias-${fdesde}_${fhasta}.csv`;
        } else {
          params.set('tab', tipo);
          url = `/api/productividad?${params}`;
          nombre = `productividad-${tipo}-${fdesde}_${fhasta}.csv`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('No se pudo generar el CSV');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
        setReporteModal(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al descargar CSV');
      } finally {
        setReporteCargando(false);
      }
    },
    [desde, hasta, doctorId]
  );

  const confirmarReporte = useCallback(
    (rango: RangoFechas, doctorSel?: string) => {
      const tipo = reporteModal;
      if (!tipo) return;
      if (tipo === 'cirugias') void descargarReporte('cirugias', rango, doctorSel);
      else if (tipo === 'entradas_salidas') void descargarReporte('entradas_salidas', rango, doctorSel);
      else if (tipo === 'honorarios') void descargarReporte('honorarios', rango, doctorSel);
      else if (tipo === 'pagos') void descargarReporte('pagos', rango, doctorSel);
      else void descargarReporte('metricas', rango, doctorSel);
    },
    [reporteModal, descargarReporte]
  );

  const infoReporte = REPORTES.find((r) => r.id === reporteModal) || null;
  const reporteAbierto = infoReporte !== null;

  const resumen = liga?.resumen || EMPTY_RESUMEN;
  const agrupado = liga?.agrupado || [];

  const cardsHonorarios = useMemo(
    () => [
      { icon: AlertTriangle, label: 'Por pagar', value: formatCurrency(resumen.por_pagar), color: 'text-amber-600', bgColor: 'bg-amber-50' },
      { icon: CheckCircle2, label: 'Pagado', value: formatCurrency(resumen.pagado), color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
      { icon: DollarSign, label: 'Sin monto', value: String(resumen.sin_monto), color: 'text-gray-600', bgColor: 'bg-gray-50' },
      { icon: TrendingUp, label: 'Total filtro', value: formatCurrency(resumen.total_filtrado), color: 'text-primary-600', bgColor: 'bg-primary-50' },
    ],
    [resumen]
  );

  if (userLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  if (!isAdmin) {
    return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;
  }

  const filasLiga = panelDoctor ? panelData?.items || [] : liga?.items || [];
  const totalLiga = panelDoctor ? panelData?.total || 0 : liga?.total || 0;
  const pageSizeLiga = panelDoctor ? panelData?.pageSize || 10 : liga?.pageSize || 10;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productividad"
        subtitle="Métricas gráficas, honorarios, detalle por doctor y pagos"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {REPORTES.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReporteModal(r.id)}
                  disabled={!desde || !hasta}
                  title={r.title}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-50"
                >
                  <Icon className="w-4 h-4" />
                  {r.label} (CSV)
                </button>
              );
            })}
          </div>
        }
      />

      <FiltrosReporte onFilter={handleFilter} showDoctor doctores={doctores} loading={loading || cargandoMetricas} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones de productividad">
          {VISTAS.map((v) => {
            const Icon = v.icon;
            const activo = vista === v.id;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => handleVista(v.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  activo
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {v.label}
              </button>
            );
          })}
        </div>
        {vista === 'honorarios' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase">Período</span>
            <select
              value={periodoTipo}
              onChange={(e) => void cambiarPeriodo(e.target.value as TipoPeriodoPago)}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm"
            >
              {PERIODOS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {liga && (
              <span className="text-xs text-gray-400">
                {formatFechaCsv(liga.rango.desde)} – {formatFechaCsv(liga.rango.hasta)}
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {vista === 'metricas' && (
        <div>
          {cargandoMetricas && !metricas ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : metricas ? (
            <MetricasSeccion data={metricas} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Sin métricas"
              description="No se pudieron cargar las métricas del rango seleccionado"
            />
          )}
        </div>
      )}

      {vista === 'doctores' && (
        <div>
          {doctorSel ? (
            <DoctorDetalle
              doctorId={doctorSel.id}
              nombre={doctorSel.nombre}
              desde={desde}
              hasta={hasta}
              onCerrar={() => setDoctorSel(null)}
            />
          ) : cargandoMetricas && !metricas ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : metricas && metricas.por_doctor.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {metricas.por_doctor.map((d) => (
                <button
                  key={d.doctor_id}
                  type="button"
                  onClick={() => setDoctorSel({ id: d.doctor_id, nombre: d.doctor_nombre })}
                  className="text-left rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 hover:border-primary-400 dark:hover:border-primary-700 transition-colors"
                >
                  <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
                    {d.doctor_nombre}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Devengado</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-[#E7E9EA]">
                        {formatCurrency(d.monto)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Pagado</p>
                      <p className="text-xs font-bold text-emerald-600">{formatCurrency(d.pagado)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Eventos</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-[#E7E9EA]">{d.eventos}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="Sin doctores con productividad"
              description="No hay eventos de honorarios en el rango seleccionado"
            />
          )}
        </div>
      )}

      {vista === 'pagos' && <PagosHistorial desde={desde} hasta={hasta} doctorId={doctorId} />}

      {vista === 'sync' && <SyncTab />}

      {vista === 'honorarios' && (
        <div className="space-y-6">
          {loading && !liga ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {cardsHonorarios.map((c) => (
                <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} bgColor={c.bgColor} />
              ))}
            </div>
          )}

          {liga && <Embudo resumen={liga.resumen} />}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Fuente</span>
              <button
                type="button"
                onClick={() => {
                  setFuente('');
                  setPage(1);
                  void fetchLiga(desde, hasta, doctorId, 1, '', estado, vistaAgrup);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${!fuente ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#9BA1A6]'}`}
              >
                Todas
              </button>
              {FUENTES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFuente(f);
                    setPage(1);
                    void fetchLiga(desde, hasta, doctorId, 1, f, estado, vistaAgrup);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${fuente === f ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#9BA1A6]'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Estatus</span>
              <button
                type="button"
                onClick={() => {
                  setEstado('');
                  setPage(1);
                  void fetchLiga(desde, hasta, doctorId, 1, fuente, '', vistaAgrup);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${!estado ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#9BA1A6]'}`}
              >
                Todos
              </button>
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEstado(e);
                    setPage(1);
                    void fetchLiga(desde, hasta, doctorId, 1, fuente, e, vistaAgrup);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${estado === e ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#9BA1A6]'}`}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Agrupar</span>
              <select
                value={vistaAgrup}
                onChange={(e) => {
                  const v = e.target.value as 'detalle' | TipoAgrupacionLiga;
                  setVistaAgrup(v);
                  setPage(1);
                  void fetchLiga(desde, hasta, doctorId, 1, fuente, estado, v);
                }}
                className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm"
              >
                {AGRUPACIONES.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>

          {panelDoctor && (
            <div className="rounded-xl border border-primary-200 dark:border-primary-900/40 bg-primary-50/40 dark:bg-primary-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase">Panel doctor</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]">{panelDoctor.nombre}</p>
                <p className="text-xs text-gray-500">
                  {panelData
                    ? `${panelData.items.length} de ${panelData.total} líneas · total ${formatCurrency(panelData.resumen.total_filtrado)}`
                    : 'Cargando…'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void pagarSeleccionados([...selected])}
                  disabled={actionBusy || selected.size === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Pagar seleccionados ({selected.size})
                </button>
                <button
                  type="button"
                  onClick={cerrarPanel}
                  className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-[#71767B] hover:text-gray-900"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
            {loading && !liga ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : vistaAgrup !== 'detalle' ? (
              agrupado.length === 0 ? (
                <EmptyState icon={Wallet} title="Sin datos agrupados" description="No hay honorarios para agrupar en el rango" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#202327]/50">
                        <th className={th}>{vistaAgrup === 'dia' ? 'Fecha' : vistaAgrup === 'doctor' ? 'Doctor' : 'Fuente'}</th>
                        <th className={thR}>Eventos</th>
                        <th className={thR}>Devengado</th>
                        <th className={thR}>Por pagar</th>
                        <th className={thR}>Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                      {agrupado.map((a) => (
                        <tr key={a.label} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                          <td className={`${td} font-semibold`}>
                            {vistaAgrup === 'dia' ? formatFechaCsv(a.label) : a.label}
                          </td>
                          <td className={tdR}>{a.eventos}</td>
                          <td className={tdR}>{formatCurrency(a.monto)}</td>
                          <td className={tdR}>{formatCurrency(a.por_pagar)}</td>
                          <td className={tdR}>{formatCurrency(a.pagado)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-[#202327]/60 font-bold">
                        <td className={td}>Total</td>
                        <td className={tdR}>{resumen.total_eventos}</td>
                        <td className={tdR}>{formatCurrency(resumen.total_filtrado)}</td>
                        <td className={tdR}>{formatCurrency(resumen.por_pagar)}</td>
                        <td className={tdR}>{formatCurrency(resumen.pagado)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            ) : filasLiga.length === 0 ? (
              <EmptyState icon={DollarSign} title="Sin honorarios" description="No hay devengos en el rango seleccionado" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#202327]/50">
                      <th className={th}>
                        <span className="sr-only">Sel.</span>
                      </th>
                      <th className={th}>Fecha</th>
                      <th className={th}>Doctor</th>
                      <th className={th}>Fuente</th>
                      <th className={th}>Origen</th>
                      <th className={th}>Métricas</th>
                      <th className={thR}>Monto</th>
                      <th className={th}>Estatus</th>
                      <th className={th}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                    {filasLiga.map((f) => {
                      const editable = f.estado_pago !== 'PAGADO' && f.estado_pago !== 'CANCELADO';
                      const seleccionable = f.estado_pago === 'POR_PAGAR';
                      return (
                        <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                          <td className="px-4 py-3">
                            {seleccionable && (
                              <input
                                type="checkbox"
                                checked={selected.has(f.id)}
                                onChange={() => toggleSelect(f.id)}
                                className="rounded border-gray-300"
                                aria-label={`Seleccionar ${f.id}`}
                              />
                            )}
                          </td>
                          <td className={td}>{formatFechaCsv(f.fecha)}</td>
                          <td className={`${td} font-semibold`}>
                            <button
                              type="button"
                              onClick={() => void abrirPanelDoctor(f.doctor_id, f.doctor_nombre)}
                              className="hover:text-primary-600 underline-offset-2 hover:underline"
                            >
                              {f.doctor_nombre}
                            </button>
                          </td>
                          <td className={td}>{f.fuente}</td>
                          <td className={td}>{f.origen || '—'}</td>
                          <td className={td}>{metricasTexto(f.metricas_ligados)}</td>
                          <td className={tdR}>
                            {editingId === f.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={editMonto}
                                  onChange={(e) => setEditMonto(e.target.value)}
                                  className="w-28 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-2 py-1 text-right text-sm"
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
                              </div>
                            ) : (
                              formatCurrency(f.monto)
                            )}
                          </td>
                          <td className={td}>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(f.estado_pago)}`}>
                              {f.estado_pago}
                            </span>
                          </td>
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              {editable && editingId !== f.id && (
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicion(f)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-gray-600 hover:bg-gray-100 dark:hover:bg-[#202327]"
                                >
                                  <Pencil className="w-3 h-3" /> Monto
                                </button>
                              )}
                              {f.estado_pago === 'POR_PAGAR' && (
                                <button
                                  type="button"
                                  onClick={() => void pagarSeleccionados([f.id])}
                                  disabled={actionBusy || f.monto <= 0}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
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
                  <tr className="bg-gray-50 dark:bg-[#202327]/60 font-bold">
                    <td className="px-4 py-3" />
                    <td className={`${td} font-bold`} colSpan={5}>Total</td>
                    <td className={tdR}>{formatCurrency(panelDoctor ? panelData?.resumen.total_filtrado || 0 : resumen.total_filtrado)}</td>
                    <td className={td} colSpan={2} />
                  </tr>
                </table>
                <Pagination
                  page={page}
                  total={totalLiga}
                  pageSize={pageSizeLiga}
                  totalItems={totalLiga}
                  onPageChange={cambiarPagina}
                  label={panelDoctor ? 'líneas del doctor' : 'honorarios'}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {vista === 'honorarios' && !loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ChevronLeft className="w-3 h-3" />
          <span>
            {filasLiga.length} de {totalLiga} honorarios en página · total filtro {formatCurrency(resumen.total_filtrado)}
          </span>
          <ChevronRight className="w-3 h-3" />
        </div>
      )}

      <ModalRangoFechas
        isOpen={reporteAbierto}
        onClose={() => setReporteModal(null)}
        titulo={infoReporte?.titulo || 'Reporte'}
        descripcion={infoReporte?.descripcion}
        desde={desde}
        hasta={hasta}
        cargando={reporteCargando}
        doctores={doctores}
        doctorId={doctorId}
        onConfirm={confirmarReporte}
      />
    </div>
  );
}
