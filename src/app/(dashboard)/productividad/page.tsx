'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
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
import ProgresoSync from '@/components/productividad/ProgresoSync';
import {
  ejecutarSync,
  esAbort,
  urlPreviewSync,
  useSegundosTranscurridos,
  type SyncPreview,
  type SyncResultado,
} from '@/components/productividad/sync';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { useToast } from '@/components/ui/Toast';
import { useDebounce, useInvalidar } from '@/hooks';
import { ApiError, enviarJSON, fetchJSON } from '@/lib/fetcher';
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

interface SyncLogFila {
  id: string | number;
  fecha_inicio?: string;
  consultas_verificadas?: number;
  cirugias_verificadas?: number;
  eventos_creados?: number;
  errores?: number;
  duracion_ms?: number;
}

function SyncTab() {
  const { user } = useUser();
  const isAdmin = user?.rol === 'admin';
  const { toast } = useToast();
  const invalidar = useInvalidar();
  const [syncResult, setSyncResult] = useState<SyncResultado | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modoSync, setModoSync] = useState<'rango' | 'pendientes' | null>(null);
  const enCursoRef = useRef(false);
  const segundos = useSegundosTranscurridos(loading);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  // El preview se pide cuando el usuario deja de cambiar fechas (~300 ms).
  const desdePreview = useDebounce(fechaDesde, 300);
  const hastaPreview = useDebounce(fechaHasta, 300);

  const { data: logsData, isValidating: validandoLogs } = useSWR<SyncLogFila[]>(isAdmin ? '/api/productividad/sync' : null);
  const logs = Array.isArray(logsData) ? logsData : [];
  const { data: preview, isValidating: validandoPreview } = useSWR<SyncPreview>(
    isAdmin ? urlPreviewSync(desdePreview, hastaPreview) : null
  );

  const handleSync = async (soloPendientes = false) => {
    if (enCursoRef.current) return; // evita doble envío
    enCursoRef.current = true;
    setLoading(true);
    setModoSync(soloPendientes ? 'pendientes' : 'rango');
    setSyncError(null);
    const body: { fecha_desde?: string; fecha_hasta?: string; solo_pendientes?: boolean } = {};
    if (fechaDesde) body.fecha_desde = fechaDesde;
    if (fechaHasta) body.fecha_hasta = fechaHasta;
    if (soloPendientes) body.solo_pendientes = true;
    try {
      const r = await ejecutarSync(body);
      setSyncResult(r);
      toast(`Sync completado · ${r.eventos_creados ?? 0} evento(s) creados`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error en sync';
      setSyncError(msg);
      toast(msg, 'error');
    } finally {
      enCursoRef.current = false;
      setLoading(false);
      setModoSync(null);
      // Historial, preview, honorarios y métricas se revalidan sin vaciar la pantalla.
      void invalidar('/api/productividad');
    }
  };

  if (!isAdmin) return <EmptyState icon={Lock} title="Acceso restringido" description="Este módulo solo está disponible para administradores." />;

  const sinEvento = preview?.doctores_sin_evento || [];

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader title="Sync" subtitle="Desplegar honorarios a productividad (flag deployed_to_performance)" />
      <div className="relative rounded-2xl border border-line bg-surface p-4 space-y-4" aria-busy={loading}>
        <BarraRevalidando activo={validandoPreview && !loading} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} disabled={loading} aria-label="Desde" placeholder="Desde" className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm disabled:opacity-60" />
          <input type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={(e) => setFechaHasta(e.target.value)} disabled={loading} aria-label="Hasta" placeholder="Hasta" className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm disabled:opacity-60" />
        </div>
        {preview && (
          <div className="valor-suave rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm" data-validando={validandoPreview}>
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Pendientes de despliegue</p>
            <p className="text-amber-700 dark:text-amber-400">
              {preview.consultas_pendientes || 0} consultas · {preview.cirugias_pendientes || 0} cirugías · {sinEvento.length} doctor(es) sin evento de honorario
            </p>
            {sinEvento.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs max-h-40 overflow-y-auto">
                {sinEvento.slice(0, 20).map((d) => (
                  <li key={`${d.doctor_id}-${d.origen}-${d.ref}`} className="text-amber-900 dark:text-amber-200">
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
        {loading && <ProgresoSync segundos={segundos} />}
        {syncError && !loading && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-fadeIn dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {syncError}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void handleSync(false)} disabled={loading} className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg transition-colors hover:bg-primary-700 font-bold text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${modoSync === 'rango' ? 'animate-spin' : ''}`} /> {modoSync === 'rango' ? 'Sincronizando...' : 'Ejecutar Sync (rango)'}
          </button>
          <button type="button" onClick={() => void handleSync(true)} disabled={loading} className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg transition-colors hover:bg-emerald-700 font-bold text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${modoSync === 'pendientes' ? 'animate-spin' : ''}`} /> {modoSync === 'pendientes' ? 'Desplegando...' : 'Desplegar solo pendientes'}
          </button>
        </div>
      </div>
      {syncResult && (
        <div className="rounded-2xl border border-line bg-surface p-4 animate-fadeIn">
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
                {syncResult.doctores_sin_evento.map((d) => (
                  <li key={`${d.doctor_id}-${d.origen}-${d.ref}`} className="text-amber-900 dark:text-amber-200">{d.doctor_nombre} — {d.origen}</li>
                ))}
              </ul>
            </div>
          )}
          {syncResult.errores && syncResult.errores.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.errores.map((e: string, i: number) => <p key={`${i}-${e}`} className="text-xs text-rose-600">{e}</p>)}
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && (
        <div className="relative rounded-2xl border border-line bg-surface overflow-hidden">
          <BarraRevalidando activo={validandoLogs} />
          <h3 className="text-sm font-bold p-4 border-b border-line">Historial de Sync</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface-2/50">
                  <th className={th}>Fecha</th>
                  <th className={th}>Consultas</th>
                  <th className={th}>Cirugías</th>
                  <th className={th}>Creados</th>
                  <th className={th}>Errores</th>
                  <th className={th}>Duración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {logs.map((l) => (
                  <tr key={String(l.id)} className="transition-colors hover:bg-surface-2">
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
const td = 'px-4 py-3 text-sm text-fg-2';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-fg';

function mensajeError(err: unknown, fallback: string): string | null {
  if (!err || esAbort(err)) return null;
  return err instanceof Error ? err.message : fallback;
}

/** Sin reintento para peticiones canceladas por obsoletas; resto según la política global. */
function reintentarSiNoAbort(err: unknown): boolean {
  if (esAbort(err)) return false;
  return !(err instanceof ApiError) || err.status >= 500;
}

/** Marca como PAGADO (optimista) las filas POR_PAGAR indicadas y ajusta el resumen. */
function marcarPagados(d: HonorariosListado, ids: Set<string>): HonorariosListado {
  let delta = 0;
  const items = d.items.map((f) => {
    if (!ids.has(f.id) || f.estado_pago !== 'POR_PAGAR') return f;
    delta += Number(f.monto) || 0;
    return { ...f, estado_pago: 'PAGADO' as const };
  });
  if (!d.resumen) return { ...d, items };
  return {
    ...d,
    items,
    resumen: { ...d.resumen, por_pagar: d.resumen.por_pagar - delta, pagado: d.resumen.pagado + delta },
  };
}

function cambiarMonto(d: HonorariosListado, id: string, monto: number): HonorariosListado {
  return { ...d, items: d.items.map((f) => (f.id === id ? { ...f, monto } : f)) };
}

export default function ProductividadPage() {
  const { user, loading: userLoading } = useUser();
  const isAdmin = user?.rol === 'admin';
  const { toast } = useToast();
  const invalidar = useInvalidar();

  const [vista, setVista] = useState<VistaId>('metricas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [doctorId, setDoctorId] = useState('');
  // `loading` = hay una petición de honorarios en curso (la última; las obsoletas se cancelan).
  const [loading, setLoading] = useState(false);
  const [pageLiga, setPageLiga] = useState(1);
  const [pagePanel, setPagePanel] = useState(1);
  const [fuente, setFuente] = useState('');
  const [estado, setEstado] = useState('');
  const [vistaAgrup, setVistaAgrup] = useState<'detalle' | TipoAgrupacionLiga>('detalle');
  const [doctorSel, setDoctorSel] = useState<DoctorOption | null>(null);
  const [periodoPendiente, setPeriodoPendiente] = useState<TipoPeriodoPago | null>(null);
  const [panelDoctor, setPanelDoctor] = useState<{ id: string; nombre: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [reporteModal, setReporteModal] = useState<ReporteCsvTab | null>(null);
  const [reporteCargando, setReporteCargando] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const abortLigaRef = useRef<AbortController | null>(null);
  const urlLigaEnCursoRef = useRef<string | null>(null);
  const abortReporteRef = useRef<AbortController | null>(null);

  const page = panelDoctor ? pagePanel : pageLiga;
  const rangoListo = isAdmin && !!desde && !!hasta;

  useEffect(() => {
    if (userLoading || !isAdmin) return;
    const r = rangoMesActual();
    setDesde((d) => d || r.desde);
    setHasta((h) => h || r.hasta);
  }, [userLoading, isAdmin]);

  // ---- Lecturas (SWR): claves por rango/doctor/filtros → volver a un filtro ya visto es instantáneo
  const { data: doctoresRaw } = useSWR<Array<{ id: string; alias?: string; nombre?: string }>>(
    isAdmin ? '/api/configuracion/doctores' : null
  );
  const doctores = useMemo<DoctorOption[]>(
    () =>
      (Array.isArray(doctoresRaw) ? doctoresRaw : []).map((d) => ({
        id: d.id,
        nombre: d.alias || d.nombre || d.id,
      })),
    [doctoresRaw]
  );

  const { data: configPeriodo, mutate: mutateConfigPeriodo } = useSWR<{ tipo?: TipoPeriodoPago }>(
    isAdmin ? '/api/productividad/config-periodo' : null
  );

  let urlMetricas: string | null = null;
  if (rangoListo && (vista === 'metricas' || vista === 'doctores')) {
    const params = new URLSearchParams({ desde, hasta });
    if (doctorId) params.set('doctor_id', doctorId);
    urlMetricas = `/api/productividad/metricas?${params}`;
  }
  const {
    data: metricasData,
    error: metricasError,
    isValidating: validandoMetricas,
  } = useSWR<MetricasPayload>(urlMetricas);
  const metricas = metricasData ?? null;

  let urlLiga: string | null = null;
  if (rangoListo && vista === 'honorarios') {
    const params = new URLSearchParams({
      desde,
      hasta,
      page: String(pageLiga),
      pageSize: '10',
    });
    if (doctorId) params.set('doctor_id', doctorId);
    if (fuente) params.set('fuente', fuente);
    if (estado) params.set('estado', estado);
    if (vistaAgrup !== 'detalle') params.set('agrupar_por', vistaAgrup);
    urlLiga = `/api/productividad/honorarios?${params}`;
  }
  const urlLigaRef = useRef(urlLiga);
  urlLigaRef.current = urlLiga;

  // Cancela la petición de otra combinación de filtros que siga en vuelo; SWR descarta
  // respuestas fuera de orden y conserva los datos visibles mientras llega la nueva.
  const fetcherLiga = useCallback(async (url: string) => {
    if (abortLigaRef.current && urlLigaEnCursoRef.current !== url) abortLigaRef.current.abort();
    const controller = new AbortController();
    abortLigaRef.current = controller;
    urlLigaEnCursoRef.current = url;
    setLoading(true);
    try {
      return await fetchJSON<HonorariosListado>(url, { signal: controller.signal });
    } finally {
      if (abortLigaRef.current === controller) setLoading(false);
    }
  }, []);

  const {
    data: liga,
    error: ligaError,
    isValidating: validandoLiga,
    mutate: mutateLiga,
  } = useSWR<HonorariosListado>(urlLiga, fetcherLiga, {
    shouldRetryOnError: reintentarSiNoAbort,
    onSuccess: (json, key) => {
      if (key !== urlLigaRef.current) return;
      // El servidor puede ajustar la página solicitada (fuera de rango).
      const pResp = Math.floor(Number(json.page) || 0);
      if (pResp > 0) setPageLiga((p) => (p === pResp ? p : pResp));
    },
  });

  let urlPanel: string | null = null;
  if (isAdmin && panelDoctor && vista === 'honorarios') {
    const params = new URLSearchParams({ page: String(pagePanel) });
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    urlPanel = `/api/productividad/honorarios/doctor/${encodeURIComponent(panelDoctor.id)}?pageSize=10&${params}`;
  }
  const {
    data: panelDataSwr,
    error: panelError,
    isValidating: validandoPanel,
    mutate: mutatePanel,
  } = useSWR<HonorariosListado>(urlPanel);
  const panelData = panelDoctor ? panelDataSwr ?? null : null;

  const periodoTipo: TipoPeriodoPago =
    periodoPendiente ?? liga?.periodo_tipo ?? configPeriodo?.tipo ?? 'MENSUAL';

  // Cambió la lista mostrada (filtro, página, panel) → la selección previa ya no aplica.
  useEffect(() => {
    setSelected(new Set());
  }, [urlLiga, urlPanel]);

  const error =
    (vista === 'metricas' || vista === 'doctores'
      ? mensajeError(metricasError, 'Error al cargar métricas')
      : null) ||
    (vista === 'honorarios'
      ? mensajeError(panelDoctor ? panelError : ligaError, 'Error al cargar honorarios')
      : null);

  const handleFilter = useCallback(
    (f: { fecha_desde?: string; fecha_hasta?: string; doctor_id?: string }) => {
      if (f.fecha_desde) setDesde(f.fecha_desde);
      if (f.fecha_hasta) setHasta(f.fecha_hasta);
      if (f.doctor_id !== undefined) setDoctorId(f.doctor_id);
      setPageLiga(1);
      setPagePanel(1);
    },
    []
  );

  const handleVista = useCallback((next: string) => {
    const id = (VISTAS.some((v) => v.id === next) ? next : 'metricas') as VistaId;
    setVista(id);
    setPageLiga(1);
  }, []);

  const cambiarPeriodo = useCallback(
    async (tipo: TipoPeriodoPago) => {
      setPeriodoPendiente(tipo);
      try {
        await enviarJSON('/api/productividad/config-periodo', 'PUT', { tipo });
        void mutateConfigPeriodo((c) => ({ ...(c ?? {}), tipo }), { revalidate: false });
        await invalidar('/api/productividad/honorarios');
      } catch (err) {
        toast(err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo cambiar el período', 'error');
      } finally {
        setPeriodoPendiente(null);
      }
    },
    [mutateConfigPeriodo, invalidar, toast]
  );

  const abrirPanelDoctor = useCallback((id: string, nombre: string) => {
    setPagePanel(1);
    setPanelDoctor({ id, nombre });
    setSelected(new Set());
  }, []);

  const cerrarPanel = useCallback(() => {
    setPanelDoctor(null);
    setSelected(new Set());
    setPageLiga(1);
  }, []);

  const iniciarEdicion = useCallback((fila: HonorarioLigaFila) => {
    setEditingId(fila.id);
    setEditMonto(String(fila.monto));
  }, []);

  const guardarMonto = useCallback(async () => {
    if (!editingId || editBusy) return;
    const n = Number(editMonto);
    if (editMonto.trim() === '' || !Number.isFinite(n) || n < 0) {
      toast('Monto inválido: captura un número mayor o igual a 0', 'warning');
      return;
    }
    const monto = Math.round(n * 100) / 100;
    setEditBusy(true);
    const previoLiga = liga;
    const previoPanel = panelDataSwr;
    // Optimista: el monto cambia en la fila al instante; se revierte si el servidor falla.
    if (previoLiga) void mutateLiga(cambiarMonto(previoLiga, editingId, monto), { revalidate: false });
    if (previoPanel && urlPanel) void mutatePanel(cambiarMonto(previoPanel, editingId, monto), { revalidate: false });
    try {
      await enviarJSON(`/api/productividad/honorarios/${editingId}`, 'PATCH', { monto });
      setEditingId(null);
    } catch (err) {
      if (previoLiga) void mutateLiga(previoLiga, { revalidate: false });
      if (previoPanel && urlPanel) void mutatePanel(previoPanel, { revalidate: false });
      toast(err instanceof Error ? err.message : 'Error al guardar monto', 'error');
    } finally {
      setEditBusy(false);
      void invalidar('/api/productividad');
    }
  }, [editingId, editBusy, editMonto, liga, panelDataSwr, urlPanel, mutateLiga, mutatePanel, invalidar, toast]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pagarSeleccionados = useCallback(async (ids: string[]) => {
    if (!ids.length || actionBusy) return;
    setActionBusy(true);
    const marcar = new Set(ids);
    const previoLiga = liga;
    const previoPanel = panelDataSwr;
    // Optimista: las filas pasan a PAGADO y el resumen se ajusta sin recargar.
    if (previoLiga) void mutateLiga(marcarPagados(previoLiga, marcar), { revalidate: false });
    if (previoPanel && urlPanel) void mutatePanel(marcarPagados(previoPanel, marcar), { revalidate: false });
    try {
      const body = await enviarJSON<{ pagados?: number; omitidos?: Array<{ id: string; motivo: string }> } | null>(
        '/api/productividad/honorarios/pagar',
        'POST',
        { ids }
      );
      setSelected(new Set());
      const pagados = body?.pagados || 0;
      const omitidos = body?.omitidos?.length || 0;
      toast(
        omitidos > 0 ? `${pagados} pago(s) registrados · ${omitidos} omitido(s)` : `${pagados} pago(s) registrados`,
        omitidos > 0 ? 'warning' : 'success'
      );
    } catch (err) {
      if (previoLiga) void mutateLiga(previoLiga, { revalidate: false });
      if (previoPanel && urlPanel) void mutatePanel(previoPanel, { revalidate: false });
      toast(err instanceof Error ? err.message : 'Error al pagar', 'error');
    } finally {
      setActionBusy(false);
      // Honorarios, panel, métricas y pagos se revalidan en segundo plano.
      void invalidar('/api/productividad');
    }
  }, [actionBusy, liga, panelDataSwr, urlPanel, mutateLiga, mutatePanel, invalidar, toast]);

  const cambiarPagina = useCallback(
    (pRaw: number) => {
      const p = Math.max(1, Math.floor(Number(pRaw) || 1));
      if (panelDoctor) {
        setPagePanel(p);
        return;
      }
      const rangoActivo = desde && hasta ? { desde, hasta } : (liga?.rango ?? rangoMesActual());
      if (!desde || !hasta) {
        setDesde(rangoActivo.desde);
        setHasta(rangoActivo.hasta);
      }
      setPageLiga(p);
    },
    [panelDoctor, desde, hasta, liga]
  );

  const descargarReporte = useCallback(
    async (tipo: ReporteCsvTab, rango?: RangoFechas, doctorSel?: string) => {
      const fdesde = rango?.desde || desde;
      const fhasta = rango?.hasta || hasta;
      if (!fdesde || !fhasta) return;
      abortReporteRef.current?.abort();
      const controller = new AbortController();
      abortReporteRef.current = controller;
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
        const res = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || 'No se pudo generar el CSV');
        }
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
        if (esAbort(err)) return;
        toast(err instanceof Error ? err.message : 'Error al descargar CSV', 'error');
      } finally {
        if (abortReporteRef.current === controller) setReporteCargando(false);
      }
    },
    [desde, hasta, doctorId, toast]
  );

  const cerrarReporte = useCallback(() => {
    abortReporteRef.current?.abort();
    setReporteCargando(false);
    setReporteModal(null);
  }, []);

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
  const validandoTabla = panelDoctor ? validandoPanel : validandoLiga;
  const sinDatosTabla = panelDoctor ? !panelData : !liga;

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
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-line bg-surface text-fg-2 hover:bg-surface-2 disabled:opacity-50"
                >
                  <Icon className="w-4 h-4" />
                  {r.label} (CSV)
                </button>
              );
            })}
          </div>
        }
      />

      <FiltrosReporte onFilter={handleFilter} showDoctor doctores={doctores} loading={loading || validandoMetricas} />

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
                    : 'border-line bg-surface text-fg-2 hover:bg-surface-2'
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
              disabled={periodoPendiente !== null}
              aria-label="Período de pago"
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm disabled:opacity-60"
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
        <div className="relative animate-fadeIn" aria-busy={validandoMetricas}>
          <BarraRevalidando activo={validandoMetricas && !!metricas} className="-top-2" />
          {!metricas && !metricasError ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : metricas ? (
            <div className="valor-suave" data-validando={validandoMetricas}>
              <MetricasSeccion data={metricas} />
            </div>
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
        <div className="relative animate-fadeIn" aria-busy={validandoMetricas}>
          {!doctorSel && <BarraRevalidando activo={validandoMetricas && !!metricas} className="-top-2" />}
          {doctorSel ? (
            <DoctorDetalle
              doctorId={doctorSel.id}
              nombre={doctorSel.nombre}
              desde={desde}
              hasta={hasta}
              onCerrar={() => setDoctorSel(null)}
            />
          ) : !metricas && !metricasError ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : metricas && metricas.por_doctor.length > 0 ? (
            <div className="valor-suave anim-lista grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-validando={validandoMetricas}>
              {metricas.por_doctor.map((d) => (
                <button
                  key={d.doctor_id}
                  type="button"
                  onClick={() => setDoctorSel({ id: d.doctor_id, nombre: d.doctor_nombre })}
                  className="text-left rounded-2xl border border-line bg-surface p-4 hover:border-primary-400 dark:hover:border-primary-700 transition-colors"
                >
                  <p className="text-sm font-bold text-fg">
                    {d.doctor_nombre}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Devengado</p>
                      <p className="text-xs font-bold text-fg">
                        {formatCurrency(d.monto)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Pagado</p>
                      <p className="text-xs font-bold text-emerald-600">{formatCurrency(d.pagado)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Eventos</p>
                      <p className="text-xs font-bold text-fg">{d.eventos}</p>
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
        <div className="space-y-6 animate-fadeIn">
          {!liga && !ligaError ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="valor-suave grid grid-cols-2 lg:grid-cols-4 gap-4" data-validando={validandoLiga}>
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
                  setPageLiga(1);
                }}
                aria-pressed={!fuente}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${!fuente ? 'bg-primary-600 border-primary-600 text-white' : 'border-line text-gray-600 dark:text-fg-2'}`}
              >
                Todas
              </button>
              {FUENTES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFuente(f);
                    setPageLiga(1);
                  }}
                  aria-pressed={fuente === f}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${fuente === f ? 'bg-primary-600 border-primary-600 text-white' : 'border-line text-gray-600 dark:text-fg-2'}`}
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
                  setPageLiga(1);
                }}
                aria-pressed={!estado}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${!estado ? 'bg-primary-600 border-primary-600 text-white' : 'border-line text-gray-600 dark:text-fg-2'}`}
              >
                Todos
              </button>
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEstado(e);
                    setPageLiga(1);
                  }}
                  aria-pressed={estado === e}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${estado === e ? 'bg-primary-600 border-primary-600 text-white' : 'border-line text-gray-600 dark:text-fg-2'}`}
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
                  setPageLiga(1);
                }}
                className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm"
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
                <p className="text-sm font-semibold text-fg">{panelDoctor.nombre}</p>
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {actionBusy ? 'Pagando…' : `Pagar seleccionados (${selected.size})`}
                </button>
                <button
                  type="button"
                  onClick={cerrarPanel}
                  className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-muted transition-colors hover:text-gray-900 dark:hover:text-fg"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          <div className="relative rounded-2xl border border-line bg-surface overflow-hidden" aria-busy={validandoTabla}>
            <BarraRevalidando activo={validandoTabla && !sinDatosTabla} />
            {sinDatosTabla && !error ? (
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
                      <tr className="bg-gray-50 dark:bg-surface-2/50">
                        <th className={th}>{vistaAgrup === 'dia' ? 'Fecha' : vistaAgrup === 'doctor' ? 'Doctor' : 'Fuente'}</th>
                        <th className={thR}>Eventos</th>
                        <th className={thR}>Devengado</th>
                        <th className={thR}>Por pagar</th>
                        <th className={thR}>Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {agrupado.map((a) => (
                        <tr key={a.label} className="transition-colors hover:bg-surface-2">
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
                      <tr className="bg-gray-50 dark:bg-surface-2/60 font-bold">
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
                    <tr className="bg-gray-50 dark:bg-surface-2/50">
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
                  <tbody className="divide-y divide-line/60">
                    {filasLiga.map((f) => {
                      const editable = f.estado_pago !== 'PAGADO' && f.estado_pago !== 'CANCELADO';
                      const seleccionable = f.estado_pago === 'POR_PAGAR';
                      return (
                        <tr key={f.id} className="transition-colors hover:bg-surface-2">
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
                              onClick={() => abrirPanelDoctor(f.doctor_id, f.doctor_nombre)}
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
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void guardarMonto();
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  disabled={editBusy}
                                  aria-label="Monto"
                                  className="w-28 rounded-lg border border-line bg-surface-2 px-2 py-1 text-right text-sm"
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
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-gray-600 hover:bg-surface-2"
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
                  <tr className="bg-gray-50 dark:bg-surface-2/60 font-bold">
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

      {vista === 'honorarios' && !sinDatosTabla && (
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
        onClose={cerrarReporte}
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
