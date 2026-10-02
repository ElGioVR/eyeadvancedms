'use client';

import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Upload, Calendar, List, ChevronLeft, ChevronRight,
  Clock, User, Search, X, AlertTriangle, CheckCircle2,
  FileSpreadsheet, Eye, Stethoscope, MapPin, StickyNote,
  Timer, Building2, Columns3, Square, GripVertical,
  Maximize2, Minimize2, SlidersHorizontal, Download, CalendarPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useSWR, { preload, useSWRConfig } from 'swr';
import { REFRESCO_COMPARTIDO_MS, useFetch, useInvalidar, construirUrl } from '@/hooks/useFetch';
import { agendaSoloPropia, puedeGestionarAgenda } from '@/lib/permisos-agenda';
import EnviarPaciente from '@/components/ui/EnviarPaciente';
import ReportesAgendaCsv from '@/components/agenda/ReportesAgendaCsv';
import { swrFetcher, fetchJSON, enviarJSON } from '@/lib/fetcher';
import { useAutosave } from '@/hooks/useAutosave';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import SidebarPanel from '@/components/ui/SidebarPanel';
import MobileCalendarView from '@/components/agenda/MobileCalendarView';
import { etiquetaOjo } from '@/lib/catalogos/cirugia';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import LIOSelector from '@/components/cirugia/LIOSelector';
import {
  AccionRapidaModal,
  AgendarRapidoModal,
  ETIQUETA_ACCION,
  accionesDisponibles,
  type AccionRapida,
} from '@/components/agenda/AccionesRapidasAgenda';
import type { AgendaCirugia, AgendaCirugiaEstado } from '@/types';

interface Doctor { id: string; alias: string; usuario_id?: string | null; tipo_personal?: string | null; cobra_honorarios?: boolean | null; }
interface Props { userRol: string; doctores: Doctor[]; userId?: string; initialDate: string; }

// Rango por defecto de la cuadrícula semana/día. Se amplía automáticamente
// para mostrar cualquier evento que empiece antes o termine después.
const DEFAULT_HOUR_START = 9;
const DEFAULT_HOUR_END = 22;
const HOUR_HEIGHT = 64;

const tipoConfig: Record<string, { bg: string; text: string }> = {
  cirugia: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  consulta: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  estudio: { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300' },
};

const estadoConfig: Record<AgendaCirugiaEstado, { border: string; dot: string; solid: string; lightBg: string }> = {
  agendada: { border: 'border-l-blue-500', dot: 'bg-blue-500', lightBg: 'bg-blue-500/10', solid: 'bg-blue-500' },
  aplazada: { border: 'border-l-amber-500', dot: 'bg-amber-500', lightBg: 'bg-amber-500/10', solid: 'bg-amber-500' },
  reagendada: { border: 'border-l-violet-500', dot: 'bg-violet-500', lightBg: 'bg-violet-500/10', solid: 'bg-violet-500' },
  completada: { border: 'border-l-emerald-500', dot: 'bg-emerald-500', lightBg: 'bg-emerald-500/10', solid: 'bg-emerald-500' },
  cancelada: { border: 'border-l-red-500', dot: 'bg-red-500', lightBg: 'bg-red-500/10', solid: 'bg-red-500' },
};

const estadoLabels: Record<AgendaCirugiaEstado, string> = {
  agendada: 'Agendada', aplazada: 'Aplazada', reagendada: 'Reagendada', completada: 'Completada', cancelada: 'Cancelada',
};

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];


/**
 * URL de «Agendar consulta» desde un evento de la agenda: precarga paciente,
 * médico y especialidad; el tipo queda en Subsecuente (el paciente ya tiene historial).
 */
function urlAgendarConsulta(ev: Pick<AgendaCirugia, 'paciente_id' | 'doctor_id' | 'especialidad'>): string {
  const q = new URLSearchParams();
  if (ev.paciente_id) q.set('paciente_id', ev.paciente_id);
  if (ev.doctor_id) q.set('doctor_id', ev.doctor_id);
  if (ev.especialidad) q.set('especialidad', ev.especialidad);
  q.set('tipo_agenda', 'SUBSECUENTE');
  return `/consultas/nueva?${q.toString()}`;
}
function fmtDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtDateShort(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); }
function fmtTime(t: string | null) { return t ? t.slice(0, 5) : ''; }
function fmtHourAMPM(h: number) { return h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`; }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
function dateStr(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function getMonday(d: Date) { const r = new Date(d); const day = r.getDay(); const diff = r.getDate() - day + (day === 0 ? -6 : 1); r.setDate(diff); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toDateStr(d: Date) { return dateStr(d.getFullYear(), d.getMonth(), d.getDate()); }

type VistaCalendario = 'month' | 'week' | 'day';

/**
 * Rango de fechas que pide cada vista. Mes: la cuadrícula visible completa
 * (lunes de la primera semana → domingo de la última), para que los días del
 * mes anterior/siguiente que se ven en el calendario también muestren sus
 * eventos. Semana: lun–dom. Día: ese día.
 */
function rangoVista(vista: VistaCalendario, d: Date): { fechaDesde: string; fechaHasta: string } {
  if (vista === 'month') {
    const y = d.getFullYear();
    const m = d.getMonth();
    const fd = firstDayOfMonth(y, m);
    const celdas = Math.ceil((fd + daysInMonth(y, m)) / 7) * 7;
    const inicio = new Date(y, m, 1 - fd, 12);
    return { fechaDesde: toDateStr(inicio), fechaHasta: toDateStr(addDays(inicio, celdas - 1)) };
  }
  if (vista === 'week') {
    const mon = getMonday(d);
    return { fechaDesde: toDateStr(mon), fechaHasta: toDateStr(addDays(mon, 6)) };
  }
  return { fechaDesde: toDateStr(d), fechaHasta: toDateStr(d) };
}

function desplazarVista(vista: VistaCalendario, prev: Date, dir: number): Date {
  const d = new Date(prev);
  if (vista === 'month') d.setMonth(d.getMonth() + dir);
  else if (vista === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setDate(d.getDate() + dir);
  return d;
}

/** Misma forma de URL que arma useFetch (orden de parámetros incluido) para que la precarga coincida. */
function urlAgenda(params: Record<string, string>): string {
  return construirUrl('/api/agenda', params);
}

interface RespuestaAgenda { data: AgendaCirugia[]; total: number; page: number; pageSize: number }

/** Aplica `cambios` al evento `id` dentro de la respuesta cacheada (paginada o arreglo). */
function aplicarCambiosEvento(json: unknown, id: string, cambios: Partial<AgendaCirugia>): unknown {
  const map = (arr: AgendaCirugia[]) => arr.map((c) => (c.id === id ? { ...c, ...cambios } : c));
  if (Array.isArray(json)) return map(json as AgendaCirugia[]);
  if (json && typeof json === 'object' && Array.isArray((json as RespuestaAgenda).data)) {
    const r = json as RespuestaAgenda;
    return { ...r, data: map(r.data) };
  }
  return json;
}

function mensajeError(err: unknown, porDefecto = 'No se pudo guardar el cambio'): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}
function getDoctorInitials(name: string) { return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }
const docColors = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500'];
function getDocColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return docColors[Math.abs(h) % docColors.length]; }

function parseTimeToMinutes(t: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

interface OverlapItem {
  id: string;
  startMin: number;
  endMin: number;
}

interface OverlapResult {
  column: number;
  totalColumns: number;
  adjustedTop: number;
  adjustedHeight: number;
}

function computeOverlapColumns(items: OverlapItem[], HOUR_HEIGHT: number, HOUR_START: number): Map<string, OverlapResult> {
  const result = new Map<string, OverlapResult>();
  if (items.length === 0) return result;

  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const groups: OverlapItem[][] = [];
  let currentGroup: OverlapItem[] = [sorted[0]];
  let groupEnd = sorted[0].endMin;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin < groupEnd) {
      currentGroup.push(sorted[i]);
      groupEnd = Math.max(groupEnd, sorted[i].endMin);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
      groupEnd = sorted[i].endMin;
    }
  }
  groups.push(currentGroup);

  for (const group of groups) {
    const columns: OverlapItem[][] = [];
    for (const item of group) {
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        const lastInCol = columns[col][columns[col].length - 1];
        if (item.startMin >= lastInCol.endMin) {
          columns[col].push(item);
          result.set(item.id, { column: col, totalColumns: 0, adjustedTop: 0, adjustedHeight: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([item]);
        result.set(item.id, { column: columns.length - 1, totalColumns: 0, adjustedTop: 0, adjustedHeight: 0 });
      }
    }
    const totalCols = columns.length;

    for (const item of group) {
      const r = result.get(item.id);
      if (r) {
        r.totalColumns = totalCols;
        // Cada evento se posiciona con su propia hora de inicio/fin; las
        // columnas solo dividen el ancho cuando hay solapamiento.
        r.adjustedTop = ((item.startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
        r.adjustedHeight = Math.max(28, ((item.endMin - item.startMin) / 60) * HOUR_HEIGHT - 2);
      }
    }
  }

  return result;
}

const ESTADOS_ORDEN: AgendaCirugiaEstado[] = ['agendada', 'reagendada', 'aplazada', 'completada', 'cancelada'];

function TipoStat({ label, total, porEstado, icon: Icon, tone }: {
  label: string;
  total: number;
  porEstado: Record<string, number>;
  icon: typeof Calendar;
  tone: 'violet' | 'amber' | 'sky' | 'primary';
}) {
  const tones = {
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-400/10 dark:text-primary-300',
  } as const;
  const suma = ESTADOS_ORDEN.reduce((a, e) => a + (porEstado[e] || 0), 0);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft dark:shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-fg tabular-nums">{total}</p>
        </div>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {/* Barra segmentada por estado */}
      <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        {suma > 0 && ESTADOS_ORDEN.map((e) => (porEstado[e] || 0) > 0 && (
          <span key={e} className={cn('h-full', estadoConfig[e].solid)} style={{ width: `${((porEstado[e] || 0) / suma) * 100}%` }} title={`${estadoLabels[e]}: ${porEstado[e]}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {ESTADOS_ORDEN.filter((e) => (porEstado[e] || 0) > 0).map((e) => (
          <span key={e} className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[e].dot)} />
            {porEstado[e]} {estadoLabels[e].toLowerCase()}
          </span>
        ))}
        {suma === 0 && <span>Sin eventos</span>}
      </div>
    </div>
  );
}

export default function AgendaContent({ userRol, doctores, userId, initialDate }: Props) {
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date(`${initialDate}T12:00:00`));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Enfermería: su filtro se conoce desde las props (determinista en SSR y cliente), así
  // la primera petición ya sale con él y no se repite al aplicar el efecto.
  const [filterDoctor, setFilterDoctor] = useState(() =>
    agendaSoloPropia(userRol) ? doctores.find((d) => d.usuario_id === userId)?.id ?? '' : ''
  );
  const [filterEstados, setFilterEstados] = useState<Set<string>>(new Set(['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada']));
  // Punto II: filtro por especialidad ('' = todas). Solo aplica a consultas/estudios.
  const [filterEspecialidad, setFilterEspecialidad] = useState('');
  const { especialidades } = useEspecialidades();
  const [filterTipos, setFilterTipos] = useState<Set<string>>(new Set(['cirugia', 'consulta', 'estudio']));
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [search, setSearch] = useState('');
  // Búsqueda con debounce: una petición al dejar de teclear, no una por tecla.
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportConsultas, setShowImportConsultas] = useState(false);
  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [showImportChoice, setShowImportChoice] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailCirugia, setDetailCirugia] = useState<AgendaCirugia | null>(null);
  const detailCacheRef = useRef(new Map<string, AgendaCirugia>());
  const router = useRouter();
  const [transitionDir, setTransitionDir] = useState(0);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dayCreate, setDayCreate] = useState<{ x: number; y: number; date: string; hour?: string } | null>(null);
  // Acciones rápidas (aplazar / reagendar / cancelar) y alta rápida sin salir de la agenda.
  const [accionRapida, setAccionRapida] = useState<{ evento: AgendaCirugia; accion: AccionRapida } | null>(null);
  // Alta rápida desde un hueco de la agenda: solo consultas (los estudios van en el formulario completo).
  const [agendarRapido, setAgendarRapido] = useState<{ fecha: string; hora: string; tipo: 'PRIMERA' } | null>(null);
  const [mobileOpenDay, setMobileOpenDay] = useState<{ date: string; key: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const stripSelectedRef = useRef<HTMLButtonElement>(null);

  // Enfermería (solo agenda propia): filtro fijo a su ficha de personal
  useEffect(() => {
    if (agendaSoloPropia(userRol) && doctores.length > 0 && userId) {
      const myDoctor = doctores.find(d => d.usuario_id === userId);
      if (myDoctor) setFilterDoctor(myDoctor.id);
    }
  }, [userRol, doctores, userId]);

  // Persist tipo/estado filters to localStorage
  useEffect(() => {
    if (!filtersLoaded) return;
    localStorage.setItem('agenda_filter_tipos', JSON.stringify([...filterTipos]));
  }, [filterTipos, filtersLoaded]);
  useEffect(() => {
    if (!filtersLoaded) return;
    localStorage.setItem('agenda_filter_estados', JSON.stringify([...filterEstados]));
  }, [filterEstados, filtersLoaded]);

  // Load saved filters from localStorage on mount (client-only)
  useEffect(() => {
    const savedTipos = localStorage.getItem('agenda_filter_tipos');
    if (savedTipos) try { setFilterTipos(new Set(JSON.parse(savedTipos))); } catch { /* ignore */ }
    const savedEstados = localStorage.getItem('agenda_filter_estados');
    if (savedEstados) try { setFilterEstados(new Set(JSON.parse(savedEstados))); } catch { /* ignore */ }
    setFiltersLoaded(true);
  }, []);

  // Close choice dropdowns on Escape
  useEffect(() => {
    if (!showCreateChoice && !showImportChoice) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowCreateChoice(false); setShowImportChoice(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreateChoice, showImportChoice]);

  // Close day-create tooltip on Escape / outside click
  useEffect(() => {
    if (!dayCreate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDayCreate(null); };
    const onClick = () => setDayCreate(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [dayCreate]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ x: number; y: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date(`${initialDate}T12:00:00`));
  const today = mounted ? now : new Date('2000-01-01');
  const todayStr = mounted ? toDateStr(today) : '';

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // On mobile, auto-select today on mount for the week strip.
  // todayStr sólo tiene valor después del mount (evita hidración SSR/CSR):
  // este efecto se re-ejecuta cuando todayStr deja de estar vacío.
  useEffect(() => {
    if (!selectedDate && todayStr) setSelectedDate(todayStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, todayStr]);


  // Atajos de teclado: se leen las versiones vigentes vía ref (antes el listener
  // se registraba una vez y ← / → usaban siempre la vista inicial «mes»).
  const atajosRef = useRef<{ navigate: (dir: number) => void; hoy: () => void } | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft') atajosRef.current?.navigate(-1);
      else if (e.key === 'ArrowRight') atajosRef.current?.navigate(1);
      else if (e.key === 't' || e.key === 'T') atajosRef.current?.hoy();
      else if (e.key === 'm' || e.key === 'M') setCalendarView('month');
      else if (e.key === 'w' || e.key === 'W') setCalendarView('week');
      else if (e.key === 'd' || e.key === 'D') setCalendarView('day');
      else if (e.key === 'Escape') { setSelectedDate(null); setDetailCirugia(null); setDetailPosition(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const paramsPara = useCallback((d: Date): Record<string, string> => {
    const p: Record<string, string> = { ...rangoVista(calendarView, d), pageSize: '500' };
    if (filterDoctor) p.doctorId = filterDoctor;
    if (searchQuery) p.search = searchQuery;
    return p;
  }, [calendarView, filterDoctor, searchQuery]);

  const fetchParams = paramsPara(currentDate);
  const { fechaDesde, fechaHasta } = fetchParams;

  const { data: cirugias, loading, validating, refetch: refetchAgenda, mutate: mutateAgenda } = useFetch<AgendaCirugia>('/api/agenda', fetchParams, { refreshInterval: REFRESCO_COMPARTIDO_MS });
  const urlActual = urlAgenda(fetchParams);
  const invalidar = useInvalidar();
  const { cache } = useSWRConfig();
  const { toast } = useToast();

  // Precarga (SWR) del periodo anterior y siguiente: navegar con ← / → es instantáneo.
  // Si hubo una mutación después de precargar, esa precarga puede no incluir el
  // cambio: al llegar a ese periodo se revalida una vez.
  const precargadasRef = useRef(new Set<string>());
  const suciasRef = useRef(new Set<string>());
  useEffect(() => {
    if (loading || searchQuery) return;
    const t = window.setTimeout(() => {
      for (const dir of [1, -1]) {
        const url = urlAgenda(paramsPara(desplazarVista(calendarView, currentDate, dir)));
        if (precargadasRef.current.has(url) || cache.get(url)?.data !== undefined) continue;
        precargadasRef.current.add(url);
        void preload(url, swrFetcher).catch(() => precargadasRef.current.delete(url));
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [loading, searchQuery, calendarView, currentDate, paramsPara, cache]);

  useEffect(() => {
    if (!suciasRef.current.has(urlActual)) return;
    suciasRef.current.delete(urlActual);
    void refetchAgenda();
  }, [urlActual, refetchAgenda]);

  /** Tras una mutación: revalida en segundo plano todas las vistas de agenda cacheadas. */
  const refetch = useCallback(() => {
    for (const url of precargadasRef.current) suciasRef.current.add(url);
    precargadasRef.current.clear();
    detailCacheRef.current.clear();
    void invalidar('/api/agenda', '/api/dashboard', '/api/inventario');
  }, [invalidar]);

  /** PATCH de un evento con actualización optimista en la vista actual (revierte si falla). */
  const actualizarEvento = useCallback(async (id: string, cambios: Partial<AgendaCirugia>, tipo?: AgendaCirugia['tipo']): Promise<boolean> => {
    // Consultas/estudios viven en /api/consultas (antes se enviaban por error al endpoint de cirugías).
    const esConsulta = tipo === 'consulta' || tipo === 'estudio';
    const url = esConsulta ? `/api/consultas/${id}` : `/api/agenda/${id}`;
    const body = esConsulta
      ? { ...(cambios.fecha !== undefined ? { fecha: cambios.fecha } : {}), ...(cambios.hora !== undefined ? { hora_inicio: cambios.hora } : {}) }
      : cambios;
    try {
      await mutateAgenda(
        async (actual: unknown) => {
          await enviarJSON(url, 'PATCH', body);
          return aplicarCambiosEvento(actual, id, cambios);
        },
        {
          optimisticData: (actual: unknown) => aplicarCambiosEvento(actual, id, cambios),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
      refetch();
      return true;
    } catch (err) {
      toast(mensajeError(err), 'error');
      return false;
    }
  }, [mutateAgenda, refetch, toast]);

  const cirugiasFiltradas = useMemo(() => {
    return cirugias.filter(c =>
      filterTipos.has(c.tipo || 'cirugia') &&
      filterEstados.has(c.estado || 'agendada') &&
      (!filterEspecialidad || c.especialidad === filterEspecialidad)
    );
  }, [cirugias, filterTipos, filterEstados, filterEspecialidad]);

  const cirugiasPorFecha = useMemo(() => {
    const map: Record<string, AgendaCirugia[]> = {};
    for (const c of cirugiasFiltradas) { const k = c.fecha || 'sin-fecha'; if (!map[k]) map[k] = []; map[k].push(c); }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    return map;
  }, [cirugiasFiltradas]);

  const weekDays = useMemo(() => {
    const mon = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      return { date: d, dateStr: toDateStr(d), day: d.getDate(), dayName: DIAS_CORTOS[i], isToday: toDateStr(d) === todayStr };
    });
  }, [currentDate, todayStr]);

  const carouselDays = useMemo(() => {
    const mon = getMonday(currentDate);
    const start = addDays(mon, -7);
    return Array.from({ length: 28 }, (_, i) => {
      const d = addDays(start, i);
      const ds = toDateStr(d);
      return { dateStr: ds, day: d.getDate(), dayName: DIAS_CORTOS[(d.getDay() + 6) % 7], isToday: ds === todayStr };
    });
  }, [currentDate, todayStr]);

  // Totales del periodo: en vista mes solo cuentan los días del mes (la
  // cuadrícula también trae los días visibles del mes anterior/siguiente).
  const prefijoMes = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-`;
  const eventosPeriodo = useMemo(
    () => (calendarView === 'month' ? cirugias.filter(c => (c.fecha || '').startsWith(prefijoMes)) : cirugias),
    [cirugias, calendarView, prefijoMes]
  );
  const stats = useMemo(() => {
    const cirugiasItems = eventosPeriodo.filter(c => c.tipo === 'cirugia');
    const consultasItems = eventosPeriodo.filter(c => c.tipo === 'consulta');
    const estudiosItems = eventosPeriodo.filter(c => c.tipo === 'estudio');
    return {
      total: eventosPeriodo.length,
      cirugias: cirugiasItems.length,
      consultas: consultasItems.length,
      estudios: estudiosItems.length,
      cirugiasByEstado: {
        agendada: cirugiasItems.filter(c => c.estado === 'agendada').length,
        aplazada: cirugiasItems.filter(c => c.estado === 'aplazada').length,
        reagendada: cirugiasItems.filter(c => c.estado === 'reagendada').length,
        completada: cirugiasItems.filter(c => c.estado === 'completada').length,
        cancelada: cirugiasItems.filter(c => c.estado === 'cancelada').length,
      },
      consultasByEstado: {
        agendada: consultasItems.filter(c => c.estado === 'agendada').length,
        aplazada: consultasItems.filter(c => c.estado === 'aplazada').length,
        reagendada: consultasItems.filter(c => c.estado === 'reagendada').length,
        completada: consultasItems.filter(c => c.estado === 'completada').length,
        cancelada: consultasItems.filter(c => c.estado === 'cancelada').length,
      },
      estudiosByEstado: {
        agendada: estudiosItems.filter(c => c.estado === 'agendada').length,
        aplazada: estudiosItems.filter(c => c.estado === 'aplazada').length,
        reagendada: estudiosItems.filter(c => c.estado === 'reagendada').length,
        completada: estudiosItems.filter(c => c.estado === 'completada').length,
        cancelada: estudiosItems.filter(c => c.estado === 'cancelada').length,
      },
    };
  }, [eventosPeriodo]);

  const navigate = useCallback((dir: number) => {
    setTransitionDir(dir);
    setCurrentDate(prev => desplazarVista(calendarView, prev, dir));
  }, [calendarView]);

  const handleGoToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDate(todayStr);
  }, [todayStr]);
  atajosRef.current = { navigate, hoy: handleGoToday };

  const handleDayClick = useCallback((ds: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedDate(ds);
    setCurrentDate(new Date(ds + 'T00:00:00'));
    setDetailCirugia(null);
    setDetailPosition(null);
    setShowCreateChoice(false);
    setDayCreate(null);
    setCalendarView('day');
    setMobileOpenDay(prev => ({ date: ds, key: (prev?.key ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    const container = stripRef.current;
    const el = stripSelectedRef.current;
    if (!container || !el) return;
    // Centrar el día seleccionado en el carrusel móvil. El contenedor es
    // position:relative, así que offsetLeft es relativo al propio carrusel.
    // El delay deja que el layout móvil termine de asentarse antes de medir.
    const id = window.setTimeout(() => {
      const left = el.offsetLeft - (container.clientWidth - el.offsetWidth) / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [selectedDate, carouselDays]);

  const handleQuickAdd = useCallback((ds: string, hour: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const hora = `${String(hour).padStart(2, '0')}:00`;
    setDetailCirugia(null);
    setDetailPosition(null);
    setDayCreate({ x: e.clientX, y: e.clientY, date: ds, hour: hora });
  }, []);

  const handleEventClick = useCallback(async (e: React.MouseEvent, c: AgendaCirugia) => {
    e.stopPropagation();
    const cached = detailCacheRef.current.get(c.id);
    setDetailCirugia(cached || c);
    setDetailPosition({ x: e.clientX, y: e.clientY });

    if (cached || c.tipo === 'estudio' || c.tipo === 'consulta') return;

    let detail: AgendaCirugia;
    try {
      detail = await fetchJSON<AgendaCirugia>(`/api/agenda/${c.id}`);
    } catch {
      return; // se queda con los datos de la lista
    }
    detailCacheRef.current.set(c.id, detail);
    setDetailCirugia((current) => current?.id === c.id ? detail : current);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, ds: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(ds);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, ds: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragOverDate(null);
    setDraggingId(null);
    if (!id) return;
    const evento = cirugias.find((c) => c.id === id);
    if (evento && evento.fecha === ds) return; // soltado en el mismo día
    await actualizarEvento(id, { fecha: ds }, evento?.tipo);
  }, [cirugias, actualizarEvento]);

  const miniMonth = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const dim = daysInMonth(y, m);
    const fd = firstDayOfMonth(y, m);
    const prevDim = daysInMonth(y, m - 1);
    const cells: Array<{ day: number; date: string; isCurrentMonth: boolean; isToday: boolean }> = [];
    for (let i = fd - 1; i >= 0; i--) {
      const d = prevDim - i;
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      cells.push({ day: d, date: dateStr(prevY, prevM, d), isCurrentMonth: false, isToday: false });
    }
    for (let d = 1; d <= dim; d++) {
      const ds = dateStr(y, m, d);
      cells.push({ day: d, date: ds, isCurrentMonth: true, isToday: ds === todayStr });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = m === 11 ? 0 : m + 1;
      const nextY = m === 11 ? y + 1 : y;
      cells.push({ day: d, date: dateStr(nextY, nextM, d), isCurrentMonth: false, isToday: false });
    }
    return cells;
  }, [currentDate, todayStr]);

  // Rango dinámico de horas: arranca en la primera consulta/cirugía visible
  // (si es antes de las 9) y se extiende hasta la que termine más tarde.
  const visibleDates = useMemo(
    () => (calendarView === 'day' ? [toDateStr(currentDate)] : weekDays.map(wd => wd.dateStr)),
    [calendarView, currentDate, weekDays],
  );
  const { HOUR_START, HOUR_END, firstEventMin } = useMemo(() => {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const ds of visibleDates) {
      for (const c of cirugiasPorFecha[ds] || []) {
        if (!c.hora) continue;
        const st = parseTimeToMinutes(c.hora);
        const dur = c.tiempo_estimado ? parseInt(c.tiempo_estimado) || 60 : 60;
        if (st < minStart) minStart = st;
        if (st + dur > maxEnd) maxEnd = st + dur;
      }
    }
    const start = Number.isFinite(minStart) ? Math.max(0, Math.min(DEFAULT_HOUR_START, Math.floor(minStart / 60))) : DEFAULT_HOUR_START;
    const end = Number.isFinite(maxEnd) ? Math.min(24, Math.max(DEFAULT_HOUR_END, Math.ceil(maxEnd / 60))) : DEFAULT_HOUR_END;
    return { HOUR_START: start, HOUR_END: Math.max(end, start + 1), firstEventMin: Number.isFinite(minStart) ? minStart : null };
  }, [visibleDates, cirugiasPorFecha]);

  const hours = useMemo(() => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i), [HOUR_START, HOUR_END]);

  // Al abrir semana/día se desplaza a la primera consulta visible; si no hay
  // eventos y es el día de hoy, a la hora actual.
  useEffect(() => {
    if ((calendarView === 'week' || calendarView === 'day') && timeGridRef.current) {
      let px: number | null = null;
      if (firstEventMin !== null) {
        px = Math.max(0, ((firstEventMin - HOUR_START * 60) / 60) * HOUR_HEIGHT - 8);
      } else {
        const viewDate = calendarView === 'day' ? (selectedDate || todayStr) : todayStr;
        if (viewDate === todayStr) px = Math.max(0, (new Date().getHours() - HOUR_START) * HOUR_HEIGHT - 100);
      }
      if (px !== null) timeGridRef.current.scrollTo({ top: px, behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarView, todayStr, selectedDate, visibleDates.join(','), firstEventMin, HOUR_START]);

  const nowMinutes = mounted ? now.getHours() * 60 + now.getMinutes() : 0;
  const showTimeIndicator = mounted && (calendarView === 'week' || calendarView === 'day') && nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60;
  const timeIndicatorTop = ((nowMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;

  const dayViewDate = toDateStr(currentDate);

  // Reportes CSV (solo admin): rango propuesto = mes visible; doctor = filtro actual.
  const reportesRango = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    return { desde: dateStr(y, m, 1), hasta: dateStr(y, m, daysInMonth(y, m)) };
  }, [currentDate]);
  const reportesDoctores = useMemo(() => doctores.map((d) => ({ id: d.id, nombre: d.alias })), [doctores]);
  const reportes = userRol === 'admin' ? (
    <ReportesAgendaCsv desde={reportesRango.desde} hasta={reportesRango.hasta} doctores={reportesDoctores} doctorId={filterDoctor} />
  ) : null;
  const dayViewDateObj = new Date(dayViewDate + 'T00:00:00');

  return (
    <div className={cn('w-full h-full flex flex-col', isFullscreen && 'fixed inset-0 z-50 bg-white dark:bg-canvas')}>
      {/* ─── Desktop Header ─── */}
      {!isFullscreen && (
      <div className="hidden lg:block">
        <PageHeader
          title="Agenda"
          subtitle={loading ? 'Cargando eventos…' : `${stats.total} evento${stats.total === 1 ? '' : 's'} en ${calendarView === 'month' ? 'el mes' : calendarView === 'week' ? 'la semana' : 'el día'}`}
          action={
            <div className="flex gap-2">
              {reportes}
              {!agendaSoloPropia(userRol) && (
                <>
                  <div className="relative">
                    <button onClick={() => { setShowImportChoice(p => !p); setShowCreateChoice(false); }} className="btn-secondary">
                      <Upload className="h-4 w-4" /> Importar
                    </button>
                    {showImportChoice && (
                      <div className="absolute left-0 top-full mt-2 z-50 w-52">
                        <div className="relative rounded-2xl border border-line bg-surface shadow-xl p-1.5">
                          <div className="absolute -top-2 left-6 h-0 w-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-gray-200 dark:border-b-line" />
                          <div className="absolute -top-[7px] left-6 h-0 w-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white dark:border-b-surface" />
                          <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Importar</p>
                          <button onClick={() => { setShowImportChoice(false); setShowImport(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugías
                          </button>
                          <button onClick={() => { setShowImportChoice(false); setShowImportConsultas(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consultas
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button onClick={() => { setShowCreateChoice(p => !p); setShowImportChoice(false); }} className="btn-primary">
                      <Plus className="h-4 w-4" /> Nuevo
                    </button>
                    {showCreateChoice && (
                      <div className="absolute right-0 top-full mt-2 z-50 w-52">
                        <div className="relative rounded-2xl border border-line bg-surface shadow-xl p-1.5">
                          <div className="absolute -top-2 right-6 h-0 w-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-gray-200 dark:border-b-line" />
                          <div className="absolute -top-[7px] right-6 h-0 w-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white dark:border-b-surface" />
                          <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Crear</p>
                          <button onClick={() => { setShowCreateChoice(false); router.push('/cirugias/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugía
                          </button>
                          <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consulta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          }
        />

        {/* Stats Row */}
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <TipoStat label="Total de eventos" total={stats.total} tone="primary" icon={Calendar}
            porEstado={ESTADOS_ORDEN.reduce<Record<string, number>>((acc, e) => {
              acc[e] = (stats.cirugiasByEstado[e] || 0) + (stats.consultasByEstado[e] || 0) + (stats.estudiosByEstado[e] || 0);
              return acc;
            }, {})} />
          <TipoStat label="Cirugías" total={stats.cirugias} tone="violet" icon={Stethoscope} porEstado={stats.cirugiasByEstado} />
          <TipoStat label="Consultas" total={stats.consultas} tone="amber" icon={User} porEstado={stats.consultasByEstado} />
          <TipoStat label="Estudios" total={stats.estudios} tone="sky" icon={FileSpreadsheet} porEstado={stats.estudiosByEstado} />
        </div>
      </div>
      )}

      {/* ─── Fullscreen Floating Toolbar ─── */}
      {isFullscreen && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-surface rounded-xl shadow-lg border border-line px-4 py-2">
          <button onClick={() => setShowFilters(true)} className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-fg-2 hover:bg-gray-200 dark:hover:bg-surface-3 transition-colors">
            <SlidersHorizontal className="h-4 w-4" /> Filtros
          </button>
          <div className="h-6 w-px bg-gray-200 dark:bg-surface-3" />
          {userRol === 'admin' && (
            <ReportesAgendaCsv
              desde={reportesRango.desde}
              hasta={reportesRango.hasta}
              doctores={reportesDoctores}
              doctorId={filterDoctor}
              botonClassName="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-fg-2 hover:bg-gray-200 dark:hover:bg-surface-3 transition-colors"
            />
          )}
          {!agendaSoloPropia(userRol) && (
            <>
              <div className="relative">
                <button onClick={() => { setShowImportChoice(p => !p); setShowCreateChoice(false); }} className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-fg-2 hover:bg-gray-200 dark:hover:bg-surface-3 transition-colors">
                  <Upload className="h-4 w-4" /> Importar
                </button>
                {showImportChoice && (
                  <div className="absolute left-0 top-full mt-2 z-50 w-52">
                    <div className="relative rounded-2xl border border-line bg-surface shadow-xl p-1.5">
                      <div className="absolute -top-2 left-6 h-0 w-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-gray-200 dark:border-b-line" />
                      <div className="absolute -top-[7px] left-6 h-0 w-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white dark:border-b-surface" />
                      <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Importar</p>
                      <button onClick={() => { setShowImportChoice(false); setShowImport(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugías
                      </button>
                      <button onClick={() => { setShowImportChoice(false); setShowImportConsultas(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consultas
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => { setShowCreateChoice(p => !p); setShowImportChoice(false); }} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
                  <Plus className="h-4 w-4" /> Nuevo
                </button>
                {showCreateChoice && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-52">
                    <div className="relative rounded-2xl border border-line bg-surface shadow-xl p-1.5">
                      <div className="absolute -top-2 right-6 h-0 w-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-gray-200 dark:border-b-line" />
                      <div className="absolute -top-[7px] right-6 h-0 w-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white dark:border-b-surface" />
                      <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Crear</p>
                      <button onClick={() => { setShowCreateChoice(false); router.push('/cirugias/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugía
                      </button>
                      <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consulta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          <div className="h-6 w-px bg-gray-200 dark:bg-surface-3" />
          <button onClick={() => setIsFullscreen(false)} className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-fg-2 hover:bg-gray-200 dark:hover:bg-surface-3 transition-colors">
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Mobile Header ─── */}
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3 lg:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Agenda</h1>
          <p className="text-xs text-muted">
            {loading ? 'Cargando…' : `${cirugiasFiltradas.length} evento${cirugiasFiltradas.length === 1 ? '' : 's'} este mes`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(true)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-fg-2 shadow-soft transition-colors active:scale-95 dark:shadow-none"
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            {(filterDoctor || search || filterEspecialidad || filterTipos.size < 3 || filterEstados.size < 5) && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-500 ring-2 ring-surface" />
            )}
          </button>
          {userRol === 'admin' && (
            <ReportesAgendaCsv
              desde={reportesRango.desde}
              hasta={reportesRango.hasta}
              doctores={reportesDoctores}
              doctorId={filterDoctor}
              soloIcono
              botonClassName="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-fg-2 shadow-soft transition-colors active:scale-95 dark:shadow-none"
            />
          )}
          {!agendaSoloPropia(userRol) && (
            <div className="relative">
              <button
                onClick={() => { setShowCreateChoice(p => !p); setShowImportChoice(false); }}
                className="btn-primary h-10 px-3.5"
              >
                <Plus className="h-4 w-4" /> Nuevo
              </button>
              {showCreateChoice && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52">
                  <div className="rounded-2xl border border-line bg-surface p-1.5 shadow-pop animate-popIn">
                    <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Crear</p>
                    <button onClick={() => { setShowCreateChoice(false); router.push('/cirugias/nueva'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2">
                      <span className="h-2 w-3 rounded-sm border-l-2 border-l-violet-500 bg-violet-200" /> Cirugía
                    </button>
                    <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2">
                      <span className="h-2 w-3 rounded-sm border-l-2 border-l-amber-500 bg-amber-200" /> Consulta
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Layout: Sidebar + Calendar */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Mini Calendar Sidebar */}
        {!isFullscreen && (
        <div className="hidden xl:block w-[220px] shrink-0">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-fg">
                  {MESES[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <div className="flex gap-0.5">
                  <button onClick={() => { setCurrentDate(p => { const d = new Date(p); d.setMonth(d.getMonth() - 1); return d; }); }} className="p-1 rounded hover:bg-surface-2"><ChevronLeft className="h-3.5 w-3.5 text-gray-500" /></button>
                  <button onClick={() => { setCurrentDate(p => { const d = new Date(p); d.setMonth(d.getMonth() + 1); return d; }); }} className="p-1 rounded hover:bg-surface-2"><ChevronRight className="h-3.5 w-3.5 text-gray-500" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                  <div key={d} className="text-center text-[9px] font-bold text-muted py-1">{d}</div>
                ))}
                {miniMonth.map((cell, i) => (
                  <button
                    key={i}
                    onClick={() => { setCurrentDate(new Date(cell.date + 'T00:00:00')); setSelectedDate(cell.date); setCalendarView('day'); }}
                    className={cn(
                      'h-7 w-full flex items-center justify-center text-[11px] rounded-full transition-colors',
                      !cell.isCurrentMonth && 'text-gray-300 dark:text-muted',
                      cell.isCurrentMonth && !cell.isToday && 'text-fg-2 hover:bg-surface-2',
                      cell.isToday && 'bg-primary-600 text-white font-bold',
                      cell.date === selectedDate && !cell.isToday && 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 font-bold',
                    )}
                  >
                    {cell.day}
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="rounded-2xl border border-line bg-surface p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                  className="w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 py-2 text-xs text-fg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500/30" />
              </div>
              <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-fg-2 focus:outline-none focus:ring-1 focus:ring-primary-500/30">
                <option value="">Todos los doctores</option>
                {doctores.map(d => <option key={d.id} value={d.id}>{d.alias}{d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}</option>)}
              </select>
            </div>

            {/* Legend with toggles */}
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Tipos</p>
              <div className="space-y-1 mb-3">
                {[
                  { key: 'cirugia', label: 'Cirugía', bg: 'bg-violet-200', border: 'border-l-violet-500' },
                  { key: 'consulta', label: 'Consulta', bg: 'bg-amber-200', border: 'border-l-amber-500' },
                  { key: 'estudio', label: 'Estudio', bg: 'bg-sky-200', border: 'border-l-sky-500' },
                ].map(t => (
                  <button key={t.key} onClick={() => {
                    setFilterTipos(prev => {
                      const next = new Set(prev);
                      if (next.has(t.key)) next.delete(t.key); else next.add(t.key);
                      return next;
                    });
                  }} className={cn('flex items-center gap-2 w-full rounded-md px-1.5 py-1 transition-colors',
                    filterTipos.has(t.key) ? 'bg-surface-2' : 'opacity-40')}>
                    <span className={cn('h-2.5 w-4 rounded-sm border-l-2', t.bg, t.border)} />
                    <span className="text-[11px] text-fg-2">{t.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Estados</p>
              <div className="space-y-1">
                {Object.entries(estadoLabels).map(([k, v]) => (
                  <button key={k} onClick={() => {
                    setFilterEstados(prev => {
                      const next = new Set(prev);
                      if (next.has(k)) next.delete(k); else next.add(k);
                      return next;
                    });
                  }} className={cn('flex items-center gap-2 w-full rounded-md px-1.5 py-1 transition-colors',
                    filterEstados.has(k) ? 'bg-surface-2' : 'opacity-40')}>
                    <span className={cn('h-2.5 w-2.5 rounded-full', estadoConfig[k as AgendaCirugiaEstado].dot)} />
                    <span className="text-[11px] text-fg-2">{v}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2 mt-3">Especialidad</p>
              <select
                  value={filterEspecialidad}
                  onChange={(e) => setFilterEspecialidad(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] text-fg-2"
                  aria-label="Filtrar por especialidad"
                >
                  <option value="">Todas las especialidades</option>
                  {especialidades.map((e) => <option key={e.clave} value={e.nombre}>{e.nombre}</option>)}
                </select>
            </div>
          </div>
        </div>
        )}

        {/* Main Calendar Area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Desktop Toolbar */}
          <div className="mb-3 hidden shrink-0 items-center justify-between gap-3 lg:flex">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center rounded-xl border border-line bg-surface p-0.5 shadow-soft dark:shadow-none">
                <button onClick={() => navigate(-1)} aria-label="Anterior" className="rounded-lg p-1.5 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={handleGoToday} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
                  Hoy
                </button>
                <button onClick={() => navigate(1)} aria-label="Siguiente" className="rounded-lg p-1.5 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <h2 className="truncate text-lg font-semibold tracking-tight text-fg first-letter:uppercase">
                {calendarView === 'month' && `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                {calendarView === 'week' && `${fmtDateShort(toDateStr(getMonday(currentDate)))} – ${fmtDateShort(toDateStr(addDays(getMonday(currentDate), 6)))}, ${currentDate.getFullYear()}`}
                {calendarView === 'day' && fmtDate(toDateStr(currentDate))}
              </h2>
              {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-primary-500" aria-label="Cargando" />}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-fg-2 shadow-soft transition-colors hover:bg-surface-2 hover:text-fg dark:shadow-none">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <div className="flex rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Vista del calendario">
                {([['month', Square, 'Mes'], ['week', Columns3, 'Semana'], ['day', Calendar, 'Día']] as const).map(([v, Icon, label]) => (
                  <button key={v} role="tab" aria-selected={calendarView === v} onClick={() => setCalendarView(v)}
                    className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                      calendarView === v ? 'bg-surface text-fg shadow-soft dark:bg-surface-3' : 'text-muted hover:text-fg')}>
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Calendar View (iOS style) */}
          <div className="relative lg:hidden" aria-busy={loading || validating}>
            <BarraRevalidando activo={validating} />
            <MobileCalendarView
              cirugiasPorFecha={cirugiasPorFecha}
              loading={loading}
              onDateSelect={(date) => { setSelectedDate(date); }}
              onMonthChange={(y, m) => {
                // Móvil trabaja por mes: pide el mes visible completo
                setCalendarView('month');
                setCurrentDate(new Date(y, m, 1, 12));
              }}
              onAdd={!agendaSoloPropia(userRol) ? (_date: string) => { setShowCreateChoice(true); } : undefined}
              onSelect={(c) => { router.push(c.tipo === 'cirugia' ? `/cirugias/${c.id}` : `/consultas/${c.id}`); }}
              getAcciones={(c) => accionesDisponibles(c, userRol)}
              onAccion={(c, accion) => setAccionRapida({ evento: c, accion })}
              onAgendarConsulta={userRol !== 'enfermero' ? (c) => router.push(urlAgendarConsulta(c)) : undefined}
              todayStr={todayStr}
              openDay={mobileOpenDay}
            />
          </div>

          {/* Desktop View Container with transition */}
          <div className="hidden lg:block relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none flex-1 min-h-0 h-[calc(100dvh-280px)] flex flex-col" aria-busy={loading || validating}>
            <BarraRevalidando activo={validating} />

            {/* MONTH VIEW */}
            {calendarView === 'month' && (
              <div className="animate-in fade-in duration-200 flex flex-col flex-1 min-h-0 h-full">
                <div className="grid grid-cols-7 border-b border-line">
                  {DIAS_CORTOS.map(d => (
                    <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted py-2.5 border-r border-line/70 last:border-r-0 bg-surface-2/40">{d}</div>
                  ))}
                </div>
                <div className={cn(
                  'grid grid-cols-7 divide-x divide-line/70 flex-1 min-h-0',
                  `grid-rows-[repeat(${Math.ceil((firstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) + daysInMonth(currentDate.getFullYear(), currentDate.getMonth())) / 7)},1fr)]`
                )}>
                  {Array.from({ length: Math.ceil((firstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) + daysInMonth(currentDate.getFullYear(), currentDate.getMonth())) / 7) * 7 }).map((_, i) => {
                    const fd = firstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
                    const dim = daysInMonth(currentDate.getFullYear(), currentDate.getMonth());
                    const totalCells = fd + dim;
                    let dayNum: number;
                    let cellDateStr: string;
                    let isCurrentMonth = true;

                    if (i < fd) {
                      const prevM = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
                      const prevY = currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
                      dayNum = daysInMonth(prevY, prevM) - fd + i + 1;
                      cellDateStr = dateStr(prevY, prevM, dayNum);
                      isCurrentMonth = false;
                    } else if (i >= totalCells) {
                      const nextM = currentDate.getMonth() === 11 ? 0 : currentDate.getMonth() + 1;
                      const nextY = currentDate.getMonth() === 11 ? currentDate.getFullYear() + 1 : currentDate.getFullYear();
                      dayNum = i - totalCells + 1;
                      cellDateStr = dateStr(nextY, nextM, dayNum);
                      isCurrentMonth = false;
                    } else {
                      dayNum = i - fd + 1;
                      cellDateStr = dateStr(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
                    }

                    const dayCx = cirugiasPorFecha[cellDateStr] || [];
                    const isToday = cellDateStr === todayStr;
                    const isSelected = cellDateStr === selectedDate;
                    const isDragOver = cellDateStr === dragOverDate;

                    return (
                      <div key={i}
                        onClick={(e) => handleDayClick(cellDateStr, e)}
                        onDragOver={e => handleDragOver(e, cellDateStr)}
                        onDragLeave={() => setDragOverDate(null)}
                        onDrop={e => handleDrop(e, cellDateStr)}
                        className={cn(
                          'group/cell p-1.5 cursor-pointer transition-colors border-b border-line/70 overflow-hidden',
                          !isCurrentMonth && 'bg-surface-2/50',
                          isCurrentMonth && i % 7 >= 5 && 'bg-surface-2/25',
                          isToday && 'bg-primary-50/50 dark:bg-primary-400/[0.06]',
                          isSelected && 'bg-primary-50/70 dark:bg-primary-400/10 ring-2 ring-inset ring-primary-400/70',
                          isDragOver && 'bg-primary-100 dark:bg-primary-400/20 ring-2 ring-inset ring-primary-300',
                          'hover:bg-surface-2/80',
                        )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn('inline-flex items-center justify-center h-6 min-w-6 px-1 rounded-full text-xs font-semibold tabular-nums transition-all',
                            isToday ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30' : isCurrentMonth ? 'text-fg' : 'text-muted/60',
                            isSelected && !isToday && 'bg-primary-100 text-primary-700 dark:bg-primary-400/15 dark:text-primary-300'
                          )}>{dayNum}</span>
                          {dayCx.length > 0 && <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-semibold text-muted tabular-nums">{dayCx.length}</span>}
                        </div>
                        <div className="space-y-px">
                          {dayCx.slice(0, 3).map(c => (
                            <div key={c.id}
                              draggable={!agendaSoloPropia(userRol)}
                              onDragStart={e => handleDragStart(e, c.id)}
                              onClick={e => handleEventClick(e, c)}
                              className={cn(
                                'flex items-center gap-1 text-[10px] leading-tight px-1.5 py-1 rounded-md cursor-pointer transition-all',
                                'hover:brightness-95 hover:shadow-sm dark:hover:brightness-125',
                                draggingId === c.id && 'opacity-40 scale-95',
                                tipoConfig[c.tipo || 'cirugia'].bg, tipoConfig[c.tipo || 'cirugia'].text,
                                'border-l-2', estadoConfig[c.estado].border,
                              )}>
                              <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-30 hidden group-hover:block" />
                              {c.tipo === 'consulta' && <User className="h-2.5 w-2.5 shrink-0" />}
                              <span className="font-bold shrink-0">{fmtTime(c.hora)}</span>
                              <span className="truncate font-medium">{c.nombre_paciente.split(' ').slice(0, 2).join(' ')}</span>
                            </div>
                          ))}
                          {dayCx.length > 3 && (
                            <button onClick={e => { e.stopPropagation(); setSelectedDate(cellDateStr); setCurrentDate(new Date(cellDateStr + 'T00:00:00')); setCalendarView('day'); }}
                              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-400/10">
                              +{dayCx.length - 3} más
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW */}
            {calendarView === 'week' && (
              <div className="animate-in fade-in duration-200 flex flex-col flex-1 min-h-0">
                {/* Day Headers */}
                <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-line sticky top-0 bg-surface z-10">
                  <div className="border-r border-line/70" />
                  {weekDays.map(wd => (
                    <div key={wd.dateStr}
                      onClick={() => { setSelectedDate(wd.dateStr); setCurrentDate(new Date(wd.dateStr + 'T00:00:00')); setCalendarView('day'); }}
                      className={cn('text-center py-2.5 border-r border-line/70 last:border-r-0 cursor-pointer hover:bg-surface-2 transition-colors')}>
                      <div className={cn('text-[11px] font-semibold uppercase tracking-wider', wd.isToday ? 'text-primary-600 dark:text-primary-300' : 'text-muted')}>{wd.dayName}</div>
                      <div className={cn('inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold mt-0.5 tabular-nums',
                        wd.isToday ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30' : 'text-fg'
                      )}>{wd.day}</div>
                    </div>
                  ))}
                </div>

                {/* Time Grid */}
                <div ref={timeGridRef} className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] relative">
                    {/* Hour Labels */}
                    <div>
                      {hours.map(h => (
                        <div key={h} className="border-r border-line/70 flex items-start justify-end pr-2 pt-1.5" style={{ height: HOUR_HEIGHT }}>
                          <span className="text-[11px] font-bold text-muted leading-none">{fmtHourAMPM(h)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Day Columns */}
                    {weekDays.map(wd => {
                      const dayCx = cirugiasPorFecha[wd.dateStr] || [];
                      return (
                        <div key={wd.dateStr}
                          onDragOver={e => handleDragOver(e, wd.dateStr)}
                          onDragLeave={() => setDragOverDate(null)}
                          onDrop={e => handleDrop(e, wd.dateStr)}
                          className={cn('relative border-r border-line/70 last:border-r-0',
                            wd.isToday && 'bg-primary-50/20 dark:bg-primary-900/5'
                          )}>
                          {hours.map(h => (
                            <div key={h}
                              onClick={(e) => !agendaSoloPropia(userRol) && handleQuickAdd(wd.dateStr, h, e)}
                              className={cn('border-b border-line/70 transition-colors',
                                !agendaSoloPropia(userRol) && 'hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer'
                              )} style={{ height: HOUR_HEIGHT }} />
                          ))}

                          {/* Surgery Blocks */}
                          {(() => {
                            const weekEvents = dayCx.filter(c => {
                              if (!c.hora) return false;
                              const s = parseTimeToMinutes(c.hora);
                              return s >= HOUR_START * 60 && s < HOUR_END * 60;
                            });
                            const overlapItems: OverlapItem[] = weekEvents.map(c => {
                              const startMin = parseTimeToMinutes(c.hora);
                              const dur = c.tiempo_estimado ? parseInt(c.tiempo_estimado) : 60;
                              return { id: c.id, startMin, endMin: startMin + dur };
                            });
                        const overlapMap = computeOverlapColumns(overlapItems, HOUR_HEIGHT, HOUR_START);
                            return weekEvents.map(c => {
                            if (!c.hora) return null;
                            const startMin = parseTimeToMinutes(c.hora);
                            if (startMin < HOUR_START * 60 || startMin >= HOUR_END * 60) return null;
                            const ov = overlapMap.get(c.id);
                            const col = ov?.column ?? 0;
                            const totalCols = ov?.totalColumns ?? 1;
                            const colWidth = 100 / totalCols;
                            const leftPct = col * colWidth;
                            const rightPct = 100 - (col + 1) * colWidth;
                            const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                            const durationMin = c.tiempo_estimado ? parseInt(c.tiempo_estimado) : 60;
                            const height = Math.max(28, (durationMin / 60) * HOUR_HEIGHT - 2);

                            return (
                              <div key={c.id}
                                draggable={!agendaSoloPropia(userRol)}
                                onDragStart={e => handleDragStart(e, c.id)}
                              onClick={e => handleEventClick(e, c)}
                                className={cn(
                                  'absolute rounded-md px-1.5 py-1 cursor-pointer transition-all z-10',
                                  'hover:brightness-95 hover:shadow-md hover:scale-[1.01]',
                                  draggingId === c.id && 'opacity-40',
                                  tipoConfig[c.tipo || 'cirugia'].bg, tipoConfig[c.tipo || 'cirugia'].text,
                                  'border-l-[3px]', estadoConfig[c.estado].border,
                                )} style={{ top, height, left: `calc(${leftPct}% + 2px)`, right: `calc(${rightPct}% + 2px)` }}>
                                <div className="text-[10px] font-extrabold leading-tight truncate">{c.nombre_paciente.split(' ').slice(0, 2).join(' ')}</div>
                                {height > 32 && (
                                  <div className="text-[9px] font-medium opacity-70 truncate">
                                    {c.tipo === 'consulta' && <User className="inline h-2.5 w-2.5 align-text-bottom mr-0.5" />}
                                    {fmtTime(c.hora)}{c.procedimiento ? ' · ' + c.procedimiento : ''}
                                  </div>
                                )}
                                {height > 48 && c.doctor_nombre && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className={cn('h-3 w-3 rounded-full flex items-center justify-center text-[6px] font-bold text-white', getDocColor(c.doctor_nombre))}>
                                      {getDoctorInitials(c.doctor_nombre)}
                                    </span>
                                    <span className="text-[8px] font-medium opacity-70 truncate">{c.doctor_nombre}</span>
                                  </div>
                                )}
                              </div>
                            );
                            });
                          })()}

                          {/* Current Time Indicator */}
                          {wd.isToday && showTimeIndicator && (
                            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: timeIndicatorTop }}>
                              <div className="flex items-center">
                                <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0" />
                                <div className="flex-1 h-[2px] bg-red-500" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* DAY VIEW */}
            {calendarView === 'day' && (
              <div className="animate-in fade-in duration-200 flex flex-col flex-1 min-h-0">
                {/* Day Header */}
                <div className="grid grid-cols-[72px_1fr] border-b border-line sticky top-0 bg-surface z-10">
                  <div className="border-r border-line/70" />
                  <div className="text-center py-2">
                    <span className="text-xs font-bold text-muted">{DIAS_CORTOS[(dayViewDateObj.getDay() + 6) % 7]}</span>
                    <span className={cn('ml-2 inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-extrabold',
                      dayViewDate === todayStr ? 'bg-primary-600 text-white' : 'text-fg'
                    )}>{dayViewDateObj.getDate()}</span>
                  </div>
                </div>

                {/* Time Grid */}
                <div ref={timeGridRef} className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[72px_1fr] relative">
                    {/* Hour Labels */}
                    <div>
                      {hours.map(h => (
                        <div key={h} className="border-r border-line/70 flex items-start justify-end pr-2 pt-1.5" style={{ height: HOUR_HEIGHT }}>
                          <span className="text-[11px] font-bold text-muted leading-none">{fmtHourAMPM(h)}</span>
                        </div>
                      ))}
                    </div>
                    <div
                      onDragOver={e => handleDragOver(e, dayViewDate)}
                      onDragLeave={() => setDragOverDate(null)}
                      onDrop={e => handleDrop(e, dayViewDate)}
                      className="relative">
                      {hours.map(h => (
                        <div key={h}
                          onClick={(e) => !agendaSoloPropia(userRol) && handleQuickAdd(dayViewDate, h, e)}
                          className={cn('border-b border-line/70 transition-colors',
                            !agendaSoloPropia(userRol) && 'hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer'
                          )} style={{ height: HOUR_HEIGHT }} />
                      ))}

                      {/* Surgery Blocks */}
                      {(() => {
                        const dayEvents = (cirugiasPorFecha[dayViewDate] || []).filter(c => {
                          if (!c.hora) return false;
                          const s = parseTimeToMinutes(c.hora);
                          return s >= HOUR_START * 60 && s < HOUR_END * 60;
                        });
                        const overlapItems: OverlapItem[] = dayEvents.map(c => {
                          const startMin = parseTimeToMinutes(c.hora);
                          const dur = c.tiempo_estimado ? parseInt(c.tiempo_estimado) : 60;
                          return { id: c.id, startMin, endMin: startMin + dur };
                        });
                        const overlapMap = computeOverlapColumns(overlapItems, HOUR_HEIGHT, HOUR_START);
                        return dayEvents.map(c => {
                        if (!c.hora) return null;
                        const startMin = parseTimeToMinutes(c.hora);
                        if (startMin < HOUR_START * 60 || startMin >= HOUR_END * 60) return null;
                        const ov = overlapMap.get(c.id);
                        const col = ov?.column ?? 0;
                        const totalCols = ov?.totalColumns ?? 1;
                        const colWidth = 100 / totalCols;
                        const leftPct = col * colWidth;
                        const rightPct = 100 - (col + 1) * colWidth;
                        const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                        const durationMin = c.tiempo_estimado ? parseInt(c.tiempo_estimado) : 60;
                        const height = Math.max(36, (durationMin / 60) * HOUR_HEIGHT - 2);

                        return (
                          <div key={c.id}
                            draggable={!agendaSoloPropia(userRol)}
                            onDragStart={e => handleDragStart(e, c.id)}
                            onClick={e => handleEventClick(e, c)}
                            className={cn(
                              'absolute rounded-lg px-3 py-2 cursor-pointer transition-all z-10',
                              'hover:brightness-95 hover:shadow-lg hover:scale-[1.005]',
                              draggingId === c.id && 'opacity-40',
                              tipoConfig[c.tipo || 'cirugia'].bg, tipoConfig[c.tipo || 'cirugia'].text,
                              'border-l-[4px]', estadoConfig[c.estado].border,
                              'shadow-sm',
                            )} style={{ top, height, left: `calc(${leftPct}% + 4px)`, right: `calc(${rightPct}% + 4px)` }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold truncate flex items-center gap-1">
                                {c.tipo === 'consulta' && <User className="h-3 w-3 shrink-0" />}
                                {c.nombre_paciente}
                              </span>
                              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-2 shrink-0', estadoConfig[c.estado].lightBg, tipoConfig[c.tipo || 'cirugia'].text)}>
                                {estadoLabels[c.estado]}
                              </span>
                            </div>
                            {height > 40 && (
                              <div className="flex items-center gap-2 mt-1 text-[10px] opacity-70">
                                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{fmtTime(c.hora)}</span>
                                {c.procedimiento && <span className="flex items-center gap-1"><Stethoscope className="h-2.5 w-2.5" />{c.procedimiento}</span>}
                              </div>
                            )}
                            {height > 60 && c.doctor_nombre && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={cn('h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white', getDocColor(c.doctor_nombre))}>
                                  {getDoctorInitials(c.doctor_nombre)}
                                </span>
                                <span className="text-[10px] font-medium opacity-70">{c.doctor_nombre}</span>
                              </div>
                            )}
                          </div>
                        );
                      });
                      })()}

                      {/* Current Time Indicator */}
                      {dayViewDate === todayStr && showTimeIndicator && (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: timeIndicatorTop }}>
                          <div className="flex items-center">
                            <div className="h-3 w-3 rounded-full bg-red-500 -ml-1.5 shrink-0 shadow-md" />
                            <div className="flex-1 h-[2px] bg-red-500 shadow-sm" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Day-click create tooltip */}
      {dayCreate && (
        <div
          className="fixed z-50 w-52"
          style={{
            left: Math.min(dayCreate.x, window.innerWidth - 220),
            top: Math.min(dayCreate.y + 8, window.innerHeight - 180),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative rounded-2xl border border-line bg-surface shadow-xl p-1.5">
            <div className="absolute -top-2 left-6 h-0 w-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-gray-200 dark:border-b-line" />
            <div className="absolute -top-[7px] left-6 h-0 w-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white dark:border-b-surface" />
            <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              Crear · {fmtDate(dayCreate.date)}{dayCreate.hour ? ` · ${dayCreate.hour}` : ''}
            </p>
            <button
              onClick={() => {
                const fecha = dayCreate.date;
                const hora = dayCreate.hour || '';
                setDayCreate(null);
                // Punto I: toda cirugía nueva se crea en el asistente completo (anestesia,
                // datos generales, tipo/modelo de LIO, equipo…), con fecha y hora precargadas.
                router.push(`/cirugias/nueva?fecha=${encodeURIComponent(fecha)}${hora ? `&hora=${encodeURIComponent(hora)}` : ''}`);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left"
            >
              <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugía
            </button>
            <button
              onClick={() => {
                const fecha = dayCreate.date;
                const hora = dayCreate.hour || '';
                setDayCreate(null);
                setAgendarRapido({ fecha, hora, tipo: 'PRIMERA' });
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left"
            >
              <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consulta
            </button>
          </div>
        </div>
      )}

      {/* Detail Popover Card */}
      {detailCirugia && detailPosition && (
        <DetailPopoverCard
          cirugia={detailCirugia}
          position={detailPosition}
          userRol={userRol}
          onEdit={() => { setDetailCirugia(null); setDetailPosition(null); setEditingId(detailCirugia.id); setShowForm(true); }}
          onClose={() => { setDetailCirugia(null); setDetailPosition(null); }}
          onEstado={async (s) => {
            const id = detailCirugia.id;
            setDetailCirugia(null); setDetailPosition(null);
            // La API de cirugías exige motivo en todo cambio de estado.
            await actualizarEvento(id, { estado: s, motivo: 'Actualizado desde la agenda' } as Partial<AgendaCirugia>);
          }}
          onAccion={(accion) => {
            const evento = detailCirugia;
            setDetailCirugia(null); setDetailPosition(null);
            setAccionRapida({ evento, accion });
          }}
        />
      )}

      {accionRapida && (
        <AccionRapidaModal
          evento={accionRapida.evento}
          accion={accionRapida.accion}
          onClose={() => setAccionRapida(null)}
          onDone={(cambios, texto) => {
            const id = accionRapida.evento.id;
            setAccionRapida(null);
            void mutateAgenda((actual: unknown) => aplicarCambiosEvento(actual, id, cambios), { revalidate: false });
            refetch();
            toast(texto, 'success');
          }}
        />
      )}

      {agendarRapido && (
        <AgendarRapidoModal
          fecha={agendarRapido.fecha}
          hora={agendarRapido.hora}
          tipoInicial={agendarRapido.tipo}
          doctores={doctores}
          doctorInicial={agendaSoloPropia(userRol) ? doctores.find((d) => d.usuario_id === userId)?.id : undefined}
          onClose={() => setAgendarRapido(null)}
          onDone={() => {
            setAgendarRapido(null);
            refetch();
            toast('Cita agendada', 'success');
          }}
          onFormularioCompleto={(fecha, hora, tipo) => {
            setAgendarRapido(null);
            router.push(`/consultas/nueva?${tipo === 'ESTUDIOS' ? 'tipo=ESTUDIO&' : tipo === 'PROCEDIMIENTOS' ? 'tipo=PROCEDIMIENTO&' : ''}fecha=${encodeURIComponent(fecha)}${hora ? `&hora=${encodeURIComponent(hora)}` : ''}`);
          }}
        />
      )}

      {/* Sidebar Form */}
      {/* Solo edición: el alta de cirugías vive en /cirugias/nueva (asistente completo). */}
      <SidebarPanel isOpen={showForm && !!editingId} onClose={() => { setShowForm(false); setEditingId(null); }} title="Editar Cirugía">
        {editingId && <CirugiaForm key={editingId} cirugiaId={editingId} doctores={doctores} userRol={userRol} initialDate={null} initialHour="" onClose={() => { setShowForm(false); setEditingId(null); }} onSaved={(id, cambios) => {
          setShowForm(false); setEditingId(null);
          // Edición: el evento se ve actualizado al instante; la revalidación confirma.
          if (id && cambios) void mutateAgenda((actual: unknown) => aplicarCambiosEvento(actual, id, cambios), { revalidate: false });
          refetch();
          toast('Evento actualizado', 'success');
        }} />}
      </SidebarPanel>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)}>
        <ImportExcel doctores={doctores} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); refetch(); }} />
      </Modal>
      <Modal isOpen={showImportConsultas} onClose={() => setShowImportConsultas(false)}>
        <ImportConsultas onClose={() => setShowImportConsultas(false)} onImported={() => { setShowImportConsultas(false); refetch(); }} />
      </Modal>

      {/* ─── Filters Modal (Fullscreen) ─── */}
      {showFilters && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm animate-fadeIn sm:items-center" onClick={() => setShowFilters(false)}>
          <div className="w-full rounded-t-3xl border border-line bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-pop animate-sheetUp sm:mx-4 sm:max-w-md sm:rounded-3xl sm:pb-6 sm:animate-popIn" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold tracking-tight text-fg">Filtros</h3>
              <button onClick={() => setShowFilters(false)} className="p-2 rounded-lg hover:bg-surface-2">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente..."
                  className="w-full rounded-lg border border-line bg-surface-2 pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Doctor</label>
                <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg-2 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
                  <option value="">Todos los doctores</option>
                  {doctores.map(d => <option key={d.id} value={d.id}>{d.alias}{d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Tipo</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'cirugia', label: 'Cirugía', bg: 'bg-violet-200', border: 'border-l-violet-500' },
                    { key: 'consulta', label: 'Consulta', bg: 'bg-amber-200', border: 'border-l-amber-500' },
                    { key: 'estudio', label: 'Estudio', bg: 'bg-sky-200', border: 'border-l-sky-500' },
                  ].map(t => (
                    <button key={t.key} onClick={() => {
                      setFilterTipos(prev => { const n = new Set(prev); if (n.has(t.key)) n.delete(t.key); else n.add(t.key); return n; });
                    }} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
                      filterTipos.has(t.key)
                        ? 'border-gray-300 dark:border-line-strong bg-surface-2 text-fg'
                        : 'border-line bg-surface text-muted')}>
                      <span className={cn('h-2 w-3 rounded-sm border-l-2', t.bg, t.border)} />{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Estado</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(estadoLabels).map(([k, v]) => (
                    <button key={k} onClick={() => {
                      setFilterEstados(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
                    }} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
                      filterEstados.has(k)
                        ? 'border-gray-300 dark:border-line-strong bg-surface-2 text-fg'
                        : 'border-line bg-surface text-muted')}>
                      <span className={cn('h-2 w-2 rounded-full', estadoConfig[k as AgendaCirugiaEstado].dot)} />{v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Especialidad</label>
                <select
                  value={filterEspecialidad}
                  onChange={(e) => setFilterEspecialidad(e.target.value)}
                  className="input-field"
                  aria-label="Filtrar por especialidad"
                >
                  <option value="">Todas las especialidades</option>
                  {especialidades.map((e) => <option key={e.clave} value={e.nombre}>{e.nombre}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                  setFilterDoctor('');
                  setFilterTipos(new Set(['cirugia', 'consulta', 'estudio']));
                  setFilterEstados(new Set(['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada']));
                  setFilterEspecialidad('');
                  setSearch('');
                }}
                  className="flex-1 rounded-lg border border-line bg-white dark:bg-surface-2 px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-gray-50 dark:hover:bg-surface-3 transition-colors">
                  Limpiar
                </button>
                <button onClick={() => setShowFilters(false)}
                  className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition-colors">
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Detail Modal ───────── */
function CirugiaDetailModal({ cirugia, userRol, onEdit, onClose, onRefetch }: { cirugia: AgendaCirugia; userRol: string; onEdit: () => void; onClose: () => void; onRefetch: () => void }) {
  const [updating, setUpdating] = useState(false);
  const updateEstado = async (s: AgendaCirugiaEstado) => { setUpdating(true); try { await fetch(`/api/agenda/${cirugia.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: s }) }); onRefetch(); } finally { setUpdating(false); } };

  const items = [
    cirugia.expediente && { Icon: StickyNote, label: 'Expediente', value: cirugia.expediente },
    cirugia.fecha && { Icon: Calendar, label: 'Fecha', value: fmtDate(cirugia.fecha) },
    cirugia.hora && { Icon: Clock, label: 'Hora', value: fmtTime(cirugia.hora) },
    cirugia.jornada && { Icon: MapPin, label: 'Jornada', value: cirugia.jornada },
    cirugia.doctor_nombre && { Icon: User, label: 'Cirujano', value: cirugia.doctor_nombre },
    cirugia.procedimiento && { Icon: Stethoscope, label: 'Procedimiento', value: cirugia.procedimiento },
    cirugia.diagnostico && { Icon: AlertTriangle, label: 'Diagnóstico', value: cirugia.diagnostico },
    cirugia.ojo && { Icon: Eye, label: 'Ojo', value: etiquetaOjo(cirugia.ojo) },
    cirugia.lio && { Icon: () => <div className="h-3 w-3 rounded-full border-2 border-current" />, label: 'LIO', value: cirugia.lio },
    cirugia.marca_lio && { Icon: () => <div className="h-3 w-3 rounded-full border-2 border-current" />, label: 'Marca LIO', value: cirugia.marca_lio },
    cirugia.tiempo_estimado && { Icon: Timer, label: 'Tiempo estimado', value: cirugia.tiempo_estimado },
    cirugia.tiempo_estancia && { Icon: Timer, label: 'Tiempo estancia', value: cirugia.tiempo_estancia },
    cirugia.procedencia && { Icon: Building2, label: 'Procedencia', value: cirugia.procedencia },
  ].filter(Boolean) as Array<{ Icon: React.ComponentType<{ className?: string }>; label: string; value: string }>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center text-sm font-extrabold', tipoConfig[cirugia.tipo || 'cirugia'].bg, tipoConfig[cirugia.tipo || 'cirugia'].text)}>
          {cirugia.hora ? fmtTime(cirugia.hora) : '--:--'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold text-fg truncate">{cirugia.nombre_paciente}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full', estadoConfig[cirugia.estado].lightBg, tipoConfig[cirugia.tipo || 'cirugia'].text)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
              {estadoLabels[cirugia.estado]}
            </span>
            {cirugia.fecha && <span className="text-xs text-muted">{fmtDateShort(cirugia.fecha)}</span>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg border border-line/70 p-3 bg-gray-50/50 dark:bg-surface-2/50">
            <div className="flex items-center gap-1.5 mb-1">
              <item.Icon className="h-3 w-3 text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{item.label}</span>
            </div>
            <p className="text-sm font-bold text-fg">{item.value}</p>
          </div>
        ))}
      </div>
      {cirugia.notas && (
        <div className="rounded-lg bg-surface-2 border border-line/70 p-3">
          <div className="flex items-center gap-1.5 mb-1"><StickyNote className="h-3 w-3 text-gray-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Notas</span></div>
          <p className="text-sm text-fg-2">{cirugia.notas}</p>
        </div>
      )}
      {!agendaSoloPropia(userRol) && (
        <div className="flex gap-2 pt-2 border-t border-line/70">
          {cirugia.estado === 'agendada' && (
            <>
              <button onClick={() => updateEstado('completada')} disabled={updating} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> Completar
              </button>
              <button onClick={() => updateEstado('cancelada')} disabled={updating} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50">
                <X className="h-4 w-4" /> Cancelar
              </button>
            </>
          )}
          <button onClick={onEdit} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors">
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── Detail Popover Card (Google Calendar style) ───────── */
function DetailPopoverCard({ cirugia, position, userRol, onEdit, onClose, onEstado, onAccion }: {
  cirugia: AgendaCirugia; position: { x: number; y: number }; userRol: string;
  onEdit: () => void; onClose: () => void; onEstado: (s: AgendaCirugiaEstado) => Promise<void>;
  onAccion: (accion: AccionRapida) => void;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const esCirugia = !cirugia.tipo || cirugia.tipo === 'cirugia';
  const acciones = accionesDisponibles(cirugia, userRol);
  // Contacto del paciente para WhatsApp/correo: solo al abrir la ventana (payload mínimo).
  const { data: contacto } = useSWR<{ telefono: string | null; email: string | null }>(
    cirugia.paciente_id && puedeGestionarAgenda(userRol) ? `/api/pacientes/${cirugia.paciente_id}/contacto` : null,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > vw - 16) x = vw - rect.width - 16;
    if (y + rect.height > vh - 16) y = position.y - rect.height - 10;
    if (x < 16) x = 16;
    if (y < 16) y = 16;
    setAdjustedPos({ x, y });
  }, [position]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const updateEstado = async (s: AgendaCirugiaEstado) => {
    if (updating) return;
    setUpdating(true);
    try {
      await onEstado(s); // optimista en la agenda; el error se muestra en un toast
    } finally { setUpdating(false); }
  };

  return (
    <div ref={cardRef}
      className="fixed z-50 w-[340px] rounded-2xl border border-line bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('h-3 w-3 rounded-full shrink-0', estadoConfig[cirugia.estado].dot)} />
          <h3 className="text-base font-extrabold text-fg truncate">{cirugia.nombre_paciente}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {acciones.includes('cancelar') && (
            <button onClick={() => onAccion('cancelar')} disabled={updating}
              className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-gray-400 hover:text-red-500"
              title="Cancelar cita" aria-label="Cancelar cita">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
            </button>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-fg"
            title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-4 pb-2">
        <p className="text-xs text-muted">
          {cirugia.fecha && fmtDate(cirugia.fecha)}
        </p>
      </div>

      {/* Details */}
      <div className="px-4 pb-3 space-y-2">
        {!esCirugia && (cirugia.especialidad || cirugia.tipo_consulta_label) && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Stethoscope className="h-4 w-4 text-muted shrink-0" />
            <span>{[cirugia.especialidad, cirugia.tipo_consulta_label].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        {cirugia.codigo && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <FileSpreadsheet className="h-4 w-4 text-muted shrink-0" />
            <span className="font-mono text-xs">{cirugia.codigo}</span>
          </div>
        )}
        {cirugia.procedimiento && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Stethoscope className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.procedimiento}</span>
          </div>
        )}
        {cirugia.doctor_nombre && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <User className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.doctor_nombre}</span>
          </div>
        )}
        {cirugia.hora && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Clock className="h-4 w-4 text-muted shrink-0" />
            <span>{fmtTime(cirugia.hora)}{cirugia.tiempo_estimado ? ` · ${cirugia.tiempo_estimado}` : ''}</span>
          </div>
        )}
        {cirugia.ojo && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Eye className="h-4 w-4 text-muted shrink-0" />
            <span>{etiquetaOjo(cirugia.ojo)}</span>
          </div>
        )}
        {cirugia.jornada && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <MapPin className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.jornada}</span>
          </div>
        )}
        {cirugia.expediente && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <FileSpreadsheet className="h-4 w-4 text-muted shrink-0" />
            <span>Exp. {cirugia.expediente}</span>
          </div>
        )}
        {cirugia.procedencia && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Building2 className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.procedencia}</span>
          </div>
        )}
        {cirugia.diagnostico && (
          <div className="flex items-start gap-2.5 text-sm text-fg-2">
            <Stethoscope className="h-4 w-4 text-muted shrink-0 mt-0.5" />
            <span className="line-clamp-2">{cirugia.diagnostico}</span>
          </div>
        )}
        {(cirugia.lio || cirugia.marca_lio) && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Eye className="h-4 w-4 text-muted shrink-0" />
            <span>{[cirugia.marca_lio, cirugia.lio].filter(Boolean).join(' — ')}</span>
          </div>
        )}
        {cirugia.notas && (
          <div className="flex items-start gap-2.5 text-sm text-fg-2">
            <StickyNote className="h-4 w-4 text-muted shrink-0 mt-0.5" />
            <span className="line-clamp-2">{cirugia.notas}</span>
          </div>
        )}
        {cirugia.motivo_aplazamiento && (
          <div className="flex items-start gap-2.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{cirugia.motivo_aplazamiento}</span>
          </div>
        )}
      </div>

      {/* Status + Actions */}
      <div className="px-4 pb-4 pt-2 border-t border-line/70 space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full', estadoConfig[cirugia.estado].lightBg, tipoConfig[cirugia.tipo || 'cirugia'].text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
            {estadoLabels[cirugia.estado]}
          </span>
          <div className="flex-1" />
          {esCirugia && !agendaSoloPropia(userRol) && cirugia.estado === 'agendada' && (
            <button onClick={() => updateEstado('completada')} disabled={updating}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
              Completar
            </button>
          )}
          {esCirugia && !agendaSoloPropia(userRol) && (
            <button onClick={onEdit}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-line text-fg-2 hover:bg-surface-2 transition-colors">
              Editar
            </button>
          )}
        </div>
        {acciones.length > 0 && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))` }} role="group" aria-label="Acciones rápidas">
            {acciones.map((a) => (
              <button key={a} onClick={() => onAccion(a)} disabled={updating}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50',
                  a === 'cancelar'
                    ? 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10'
                    : 'border-line text-fg-2 hover:bg-surface-2'
                )}>
                {ETIQUETA_ACCION[a]}
              </button>
            ))}
          </div>
        )}
        {cirugia.paciente_id && puedeGestionarAgenda(userRol) && (
          <EnviarPaciente
            variante="compacto"
            cita={{
              tipo: esCirugia ? 'cirugia' : 'consulta',
              paciente: cirugia.nombre_paciente,
              fecha: cirugia.fecha,
              hora: cirugia.hora,
              doctor: cirugia.doctor_nombre,
              detalle: esCirugia ? cirugia.procedimiento : (cirugia.tipo_consulta_label || cirugia.procedimiento),
            }}
            telefono={contacto?.telefono}
            email={contacto?.email}
          />
        )}
        {cirugia.paciente_id && userRol !== 'enfermero' && (
          <button
            onClick={() => { onClose(); router.push(urlAgendarConsulta(cirugia)); }}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-200 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 dark:border-primary-500/30 dark:text-primary-300 dark:hover:bg-primary-500/10 transition-colors">
            <CalendarPlus className="h-3.5 w-3.5" />
            Agendar consulta
          </button>
        )}
        <button
          onClick={() => { onClose(); router.push(esCirugia ? `/cirugias/${cirugia.id}` : `/consultas/${cirugia.id}`); }}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors">
          Ver detalle completo
        </button>
      </div>
    </div>
  );
}

/* ───────── Quick Add / Form ───────── */
function CirugiaForm({ cirugiaId, doctores, userRol, initialDate, initialHour, onClose, onSaved }: {
  cirugiaId: string | null; doctores: Doctor[]; userRol: string; initialDate?: string | null; initialHour?: string;
  onClose: () => void; onSaved: (id: string | null, cambios?: Partial<AgendaCirugia>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!cirugiaId;
  interface CirugiaForm {
    nombre_paciente: string; expediente: string; fecha: string; hora: string;
    jornada: string; diagnostico: string; procedimiento: string; ojo: string; lio: string; marca_lio: string;
    inventario_item_id: string;
    tiempo_estimado: string; tiempo_estancia: string; doctor_id: string; notas: string; procedencia: string; motivo_aplazamiento: string;
  }

  const defaultCirugiaForm: CirugiaForm = {
    nombre_paciente: '', expediente: '', fecha: initialDate || '', hora: initialHour || '',
    jornada: '', diagnostico: '', procedimiento: '', ojo: '', lio: '', marca_lio: '',
    inventario_item_id: '',
    tiempo_estimado: '', tiempo_estancia: '', doctor_id: '', notas: '', procedencia: '', motivo_aplazamiento: '',
  };

  const [form, setForm] = useState<CirugiaForm>(() => {
    // Load draft only for new surgeries
    if (!cirugiaId) {
      try {
        const raw = localStorage.getItem('autosave:nueva-cirugia');
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft && draft.nombre_paciente !== undefined) return draft;
        }
      } catch {}
    }
    return defaultCirugiaForm;
  });
  const [formCargado, setFormCargado] = useState(!cirugiaId);

  const { clearDraft } = useAutosave(isEditing ? '' : 'nueva-cirugia', form, isEditing ? 999999 : 1500);

  // Detalle del evento a editar (caché compartida con el popover de la agenda).
  const { data: detalle, error: errorDetalle } = useSWR<AgendaCirugia>(
    cirugiaId ? `/api/agenda/${cirugiaId}` : null,
    { revalidateOnFocus: false }
  );
  useEffect(() => {
    if (errorDetalle && !formCargado) { setError('Error al cargar la cirugía'); setFormCargado(true); }
  }, [errorDetalle, formCargado]);
  useEffect(() => {
    if (!detalle || formCargado) return;
    const data = detalle;
    setForm({
      nombre_paciente: data.nombre_paciente || '', expediente: data.expediente || '', fecha: data.fecha || '',
      hora: data.hora?.slice(0, 5) || '', jornada: data.jornada || '', diagnostico: data.diagnostico || '',
      procedimiento: data.procedimiento || '', ojo: data.ojo || '', lio: data.lio || '', marca_lio: data.marca_lio || '',
      inventario_item_id: data.inventario_item_id || '',
      tiempo_estimado: data.tiempo_estimado || '', tiempo_estancia: data.tiempo_estancia || '', doctor_id: data.doctor_id || '',
      notas: data.notas || '', procedencia: data.procedencia || '', motivo_aplazamiento: data.motivo_aplazamiento || '',
    });
    setFormCargado(true);
  }, [detalle, formCargado]);
  const loadingCirugia = !formCargado;

  const handleLIOSelect = (itemId: string | null) => {
    setForm(f => ({
      ...f,
      inventario_item_id: itemId || '',
      // No se copian marca/modelo/lote a campos de texto; la relación es por FK.
      lio: '',
      marca_lio: '',
    }));
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.nombre_paciente.trim()) { setError('El nombre del paciente es obligatorio'); return; }
    if (form.nombre_paciente.trim().length > 200) { setError('El nombre del paciente es demasiado largo (máx. 200 caracteres)'); return; }
    if (form.notas.length > 2000) { setError('Las notas son demasiado largas (máx. 2000 caracteres)'); return; }
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        nombre_paciente: form.nombre_paciente.trim(), expediente: form.expediente || null, fecha: form.fecha || null,
        hora: form.hora || null, jornada: form.jornada || null, diagnostico: form.diagnostico || null,
        procedimiento: form.procedimiento || null, ojo: form.ojo || null, lio: form.lio || null,
        marca_lio: form.marca_lio || null, inventario_item_id: form.inventario_item_id || null,
        tiempo_estimado: form.tiempo_estimado || null, tiempo_estancia: form.tiempo_estancia || null,
        doctor_id: form.doctor_id || null, notas: form.notas || null, procedencia: form.procedencia || null,
        motivo_aplazamiento: form.motivo_aplazamiento || null,
      };
      const url = cirugiaId ? `/api/agenda/${cirugiaId}` : '/api/agenda';
      await enviarJSON(url, cirugiaId ? 'PATCH' : 'POST', body);
      clearDraft();
      const doctor = doctores.find((d) => d.id === form.doctor_id);
      onSaved(cirugiaId, cirugiaId ? {
        ...(body as Partial<AgendaCirugia>),
        ...(!agendaSoloPropia(userRol) ? { doctor_nombre: doctor?.alias ?? null } : {}),
      } : undefined);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error desconocido'); } finally { setSaving(false); }
  };

  if (loadingCirugia) {
    return (
      <div className="animate-pulse space-y-4 py-1" aria-busy="true" aria-label="Cargando">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-surface-3/70" />
            <div className="h-10 rounded-lg bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500";
  const labelCls = "block text-xs font-bold text-muted mb-1";

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div><label className={labelCls}>Nombre del paciente <span className="text-red-500">*</span></label><input type="text" value={form.nombre_paciente} onChange={e => setForm(f => ({ ...f, nombre_paciente: e.target.value }))} placeholder="Nombre completo" className={inputCls} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Expediente</label><input type="text" value={form.expediente} onChange={e => setForm(f => ({ ...f, expediente: e.target.value }))} placeholder="Núm. expediente" className={inputCls} /></div>
        <div><label className={labelCls}>Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Hora</label><input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>Jornada</label><input type="text" value={form.jornada} onChange={e => setForm(f => ({ ...f, jornada: e.target.value }))} placeholder="Ej. TIJUANA" className={inputCls} /></div>
      </div>
      {!agendaSoloPropia(userRol) && (
        <div><label className={labelCls}>Doctor / Cirujano</label>
          <select value={form.doctor_id} onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value }))} className={cn(inputCls, 'appearance-none')}>
            <option value="">Sin asignar</option>
            {doctores.filter(d => d.tipo_personal !== 'ENFERMERO' && d.tipo_personal !== 'ANESTESIOLOGO').map(d => <option key={d.id} value={d.id}>{d.alias}</option>)}
          </select>
        </div>
      )}
      <div><label className={labelCls}>Procedimiento</label><input type="text" value={form.procedimiento} onChange={e => setForm(f => ({ ...f, procedimiento: e.target.value }))} placeholder="Ej. FACO + LIO" className={inputCls} /></div>
      <div><label className={labelCls}>Diagnóstico</label><input type="text" value={form.diagnostico} onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))} placeholder="Diagnóstico" className={inputCls} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelCls}>Ojo</label>
          <select value={form.ojo} onChange={e => setForm(f => ({ ...f, ojo: e.target.value }))} className={cn(inputCls, 'appearance-none')}>
            <option value="">—</option><option value="OD">OD</option><option value="OI">OS</option><option value="OU">OU</option>
          </select>
        </div>
        <div className="col-span-2"><label className={labelCls}>LIO desde Inventario <span className="font-normal text-muted">(opcional)</span></label>
          <LIOSelector value={form.inventario_item_id} onChange={handleLIOSelect} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Tiempo estimado</label><input type="text" value={form.tiempo_estimado} onChange={e => setForm(f => ({ ...f, tiempo_estimado: e.target.value }))} placeholder="Ej. 1 HR" className={inputCls} /></div>
        <div><label className={labelCls}>Tiempo estancia</label><input type="text" value={form.tiempo_estancia} onChange={e => setForm(f => ({ ...f, tiempo_estancia: e.target.value }))} placeholder="Ej. 3 HR" className={inputCls} /></div>
      </div>
      <div><label className={labelCls}>Notas</label><textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} placeholder="Notas adicionales..." className={cn(inputCls, 'resize-none')} /></div>
      <div><label className={labelCls}>Procedencia</label><input type="text" value={form.procedencia} onChange={e => setForm(f => ({ ...f, procedencia: e.target.value }))} placeholder="Ej. Derivación externa" className={inputCls} /></div>
      <div><label className={labelCls}>Motivo de aplazamiento</label><input type="text" value={form.motivo_aplazamiento} onChange={e => setForm(f => ({ ...f, motivo_aplazamiento: e.target.value }))} placeholder="Solo si aplica" className={inputCls} /></div>
      <div className="flex gap-3 pt-3 border-t border-line/70">
        <button onClick={onClose} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors">CANCELAR</button>
        <button onClick={handleSubmit} disabled={saving} aria-busy={saving} className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : cirugiaId ? 'ACTUALIZAR' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}

/* ───────── Importación masiva (cirugías y consultas) ───────── */
interface ImportResumen {
  total: number;
  aImportar: number;
  aplazadas?: number;
  duplicadas: number;
  conError: number;
  doctoresNuevos: string[];
  pacientesNuevos: number;
}
interface ImportFilaPreview {
  fila: number;
  fecha: string | null;
  hora: string | null;
  paciente: string;
  doctor: string | null;
  estado?: string;
  paciente_nuevo: boolean;
  doctor_nuevo: boolean;
}
interface ImportRechazo { fila: number; hoja?: string; motivo: string }
interface ImportPreviewResp {
  resumen: ImportResumen;
  filas: ImportFilaPreview[];
  rechazos: ImportRechazo[];
  rechazosCsv: string | null;
  duplicadosCsv: string | null;
}
interface ImportResultado {
  importadas: number;
  aplazadasImportadas?: number;
  omitidasDuplicadas: number;
  errores: number;
  doctoresCreados: number;
  pacientesCreados: number;
  rechazos: ImportRechazo[];
  rechazosCsv: string | null;
  duplicadosCsv: string | null;
}

/** Descarga un CSV (con BOM para que Excel respete los acentos). */
function descargarCsv(nombre: string, contenido: string) {
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function BotonesCsv({ tipo, rechazosCsv, duplicadosCsv }: { tipo: 'cirugias' | 'consultas'; rechazosCsv: string | null; duplicadosCsv: string | null }) {
  if (!rechazosCsv && !duplicadosCsv) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {rechazosCsv && (
        <button
          onClick={() => descargarCsv(`${tipo}-no-importadas.csv`, rechazosCsv)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <Download className="h-3.5 w-3.5" /> Descargar CSV de no importadas (con motivo)
        </button>
      )}
      {duplicadosCsv && (
        <button
          onClick={() => descargarCsv(`${tipo}-duplicadas-omitidas.csv`, duplicadosCsv)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2"
        >
          <Download className="h-3.5 w-3.5" /> Descargar duplicadas omitidas
        </button>
      )}
    </div>
  );
}

function ListaRechazos({ rechazos }: { rechazos: ImportRechazo[] }) {
  if (rechazos.length === 0) return null;
  return (
    <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 divide-y divide-red-100 text-xs dark:border-red-500/30 dark:divide-red-500/20">
      {rechazos.slice(0, 30).map((r, i) => (
        <div key={i} className="px-3 py-1.5 text-fg-2">
          <b>{r.hoja && r.hoja !== 'CIRUGIA' && r.hoja !== 'CONSULTAS' ? `${r.hoja} · ` : ''}Fila {r.fila}:</b> {r.motivo}
        </div>
      ))}
      {rechazos.length > 30 && <p className="px-3 py-1.5 text-muted">… y {rechazos.length - 30} más en el CSV</p>}
    </div>
  );
}

function ImportAgenda({
  tipo,
  titulo,
  descripcion,
  plantilla,
  onClose,
  onImported,
}: {
  tipo: 'cirugias' | 'consultas';
  titulo: string;
  descripcion: ReactNode;
  plantilla: { nombre: string; lineas: string[] };
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultado | null>(null);

  const enviar = async (confirmar: boolean) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', tipo);
      if (confirmar) fd.append('confirmar', 'true');
      const res = await fetch('/api/agenda/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Error al importar');
      if (confirmar) setResult(data as ImportResultado);
      else { setPreview(data as ImportPreviewResp); setStep('preview'); }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const etiqueta = tipo === 'cirugias' ? 'cirugías' : 'consultas';
  const r = preview?.resumen;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{titulo}</h3>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {step === 'upload' && !result && (
        <>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">{descripcion}</div>
          <button
            onClick={() => descargarCsv(plantilla.nombre, plantilla.lineas.join('\n'))}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
          >
            ⬇ Descargar plantilla CSV
          </button>
          <div className="border-2 border-dashed border-gray-300 dark:border-line rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted mb-3" />
            <input type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary-600 file:text-white hover:file:bg-primary-700" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => enviar(false)} disabled={!file || loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Revisando…' : 'Previsualizar'}</button>
          </div>
        </>
      )}

      {step === 'preview' && preview && r && !result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 dark:bg-emerald-500/10 dark:border-emerald-500/30"><p className="text-[10px] font-bold text-emerald-700 uppercase dark:text-emerald-300">Se agregarán</p><p className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-200">{r.aImportar}</p>{r.aplazadas ? <p className="text-[10px] text-emerald-700 dark:text-emerald-300">{r.aplazadas} aplazadas</p> : null}</div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 dark:bg-blue-500/10 dark:border-blue-500/30"><p className="text-[10px] font-bold text-blue-700 uppercase dark:text-blue-300">Ya existen</p><p className="text-2xl font-extrabold text-blue-800 dark:text-blue-200">{r.duplicadas}</p></div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 dark:bg-red-500/10 dark:border-red-500/30"><p className="text-[10px] font-bold text-red-700 uppercase dark:text-red-300">Con error</p><p className="text-2xl font-extrabold text-red-800 dark:text-red-200">{r.conError}</p></div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 dark:bg-amber-500/10 dark:border-amber-500/30"><p className="text-[10px] font-bold text-amber-700 uppercase dark:text-amber-300">Pacientes nuevos</p><p className="text-2xl font-extrabold text-amber-800 dark:text-amber-200">{r.pacientesNuevos}</p></div>
          </div>
          {r.doctoresNuevos.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Se darán de alta {r.doctoresNuevos.length} doctor(es): <b>{r.doctoresNuevos.join(', ')}</b>. Revisa que no sea otro nombre de un doctor existente.
            </div>
          )}
          {(r.pacientesNuevos > 0 || r.doctoresNuevos.length > 0) && (
            <p className="text-xs text-muted">Los pacientes y doctores nuevos quedarán marcados con «Completar información» para terminar su ficha.</p>
          )}
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line/70 text-xs">
            {preview.filas.map((f) => (
              <div key={f.fila} className="flex items-center gap-3 px-3 py-2">
                <span className="text-muted w-14 shrink-0">{f.fecha ? f.fecha.slice(5) : 'Sin fecha'}{f.hora ? ` ${f.hora.slice(0, 5)}` : ''}</span>
                <span className="font-medium text-fg truncate flex-1">
                  {f.paciente}
                  {f.paciente_nuevo && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">NUEVO</span>}
                </span>
                <span className="text-muted truncate w-32">
                  {f.doctor || '—'}
                  {f.doctor_nuevo && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">NUEVO</span>}
                </span>
                {f.estado && f.estado !== 'agendada' && <span className="text-[10px] font-bold uppercase text-muted w-16">{f.estado}</span>}
              </div>
            ))}
            {r.aImportar > preview.filas.length && <p className="text-center text-muted py-1.5">… y {r.aImportar - preview.filas.length} más</p>}
            {r.aImportar === 0 && <p className="text-center text-muted py-3">No hay {etiqueta} nuevas para agregar.</p>}
          </div>
          <ListaRechazos rechazos={preview.rechazos} />
          <BotonesCsv tipo={tipo} rechazosCsv={preview.rechazosCsv} duplicadosCsv={preview.duplicadosCsv} />
          <div className="flex justify-end gap-3">
            <button onClick={() => { setStep('upload'); setPreview(null); }} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-gray-50">Atrás</button>
            <button onClick={() => enviar(true)} disabled={loading || r.aImportar === 0} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Importando…' : `Agregar ${r.aImportar} ${etiqueta}`}</button>
          </div>
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Importación terminada</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-emerald-50 p-2 dark:bg-emerald-500/10"><span className="font-bold text-emerald-700 dark:text-emerald-300">{result.importadas}</span> {etiqueta} agregadas</div>
            {result.aplazadasImportadas !== undefined && <div className="rounded bg-yellow-50 p-2 dark:bg-yellow-500/10"><span className="font-bold text-yellow-700 dark:text-yellow-300">{result.aplazadasImportadas}</span> aplazadas</div>}
            <div className="rounded bg-blue-50 p-2 dark:bg-blue-500/10"><span className="font-bold text-blue-700 dark:text-blue-300">{result.omitidasDuplicadas}</span> ya existían (omitidas)</div>
            <div className="rounded bg-red-50 p-2 dark:bg-red-500/10"><span className="font-bold text-red-700 dark:text-red-300">{result.errores}</span> no se pudieron agregar</div>
            <div className="rounded bg-amber-50 p-2 dark:bg-amber-500/10"><span className="font-bold text-amber-700 dark:text-amber-300">{result.pacientesCreados}</span> pacientes nuevos</div>
            <div className="rounded bg-amber-50 p-2 dark:bg-amber-500/10"><span className="font-bold text-amber-700 dark:text-amber-300">{result.doctoresCreados}</span> doctores nuevos</div>
          </div>
          {(result.pacientesCreados > 0 || result.doctoresCreados > 0) && (
            <p className="text-xs text-muted">Complétalos en Pacientes y en Configuración → Personal médico (aparecen con «Completar información»).</p>
          )}
          <ListaRechazos rechazos={result.rechazos} />
          <BotonesCsv tipo={tipo} rechazosCsv={result.rechazosCsv} duplicadosCsv={result.duplicadosCsv} />
          <div className="flex justify-end">
            <button onClick={onImported} className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-bold text-white hover:bg-primary-700">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportExcel({ onClose, onImported }: { doctores?: Doctor[]; onClose: () => void; onImported: () => void }) {
  return (
    <ImportAgenda
      tipo="cirugias"
      titulo="Importar Cirugías"
      descripcion={
        <>
          <p>Archivo .xlsx (hojas &quot;CIRUGIA&quot; y &quot;APLAZADOS&quot;) o .csv. Sin fecha → <b>aplazada</b>; &quot;SUSPENDIDO&quot; en notas → <b>cancelada</b>.</p>
          <p>Solo se agregan las que faltan: las que ya existen (mismo paciente, fecha y hora) se omiten. Pacientes y cirujanos que no existan se dan de alta.</p>
        </>
      }
      plantilla={{
        nombre: 'plantilla-cirugias.csv',
        lineas: [
          'FECHA,NOMBRE PX,No. Expediente,HORA CX,JORNADA,FECHA NAC.,SEXO,EDAD,DIAGNOSTICO,PROCEDIMIENTO,OJO,LIO,MARCA,OJO,LIO,MARCA,TIEMPO ESTIMADO CX,TIEMPO DE ESTANCIA,CIRUJANO,NOTAS',
          '2026-07-22,MARIA LOURDES RUIZ,776,06:00:00,TIJUANA,1969-09-20,F,56,RETINOPATIA DIABETICA,FACO-VITRECTOMIA,OI,23.00 CLAREON,,,,,2 HR,3 HR,BAYARDO/IRINA,',
          '2026-07-27,MARIA ELENA LOPEZ,799,07:00:00,ENSENADA,1965-08-18,F,60,CATARATA,FACO + LIO,OD,25.5,,,,,1 HR,,FELIX,',
        ],
      }}
      onClose={onClose}
      onImported={onImported}
    />
  );
}

function ImportConsultas({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  return (
    <ImportAgenda
      tipo="consultas"
      titulo="Importar Consultas"
      descripcion={
        <>
          <p>Archivo .csv o .xlsx del registro de entradas y salidas. Las consultas nacen <b>Agendadas</b>.</p>
          <p>Solo se agregan las que faltan: las que ya existen (mismo paciente, fecha y hora) se omiten. Pacientes y doctores que no existan se dan de alta.</p>
        </>
      }
      plantilla={{
        nombre: 'plantilla-consultas.csv',
        lineas: [
          'FECHA,HORA DE INGRESO,HORA DE EGRESO,NUMERO DE TELEFONO ,DOCTOR,MEDICO IC,NOMBRE  DE PACIENTE ,SEXO ,FECHA DE NACIMIENTO,EDAD ,CONSULTA,DIAGNOSTICO ,TIPO DE CONSULTA,ESTUDIO 1,ESTUDIO2,ESTUDIO3,OPERADOR ,PROCEDIMIENTO ,ASEGURANZA,METODO DE PAGO , COSTO CONSULTA ,TIPO DE MONEDA ,',
          '"Tuesday, September 1, 2026",10:00AM,10:30AM,6611073755,DRA IRINA ,,Manuel Escobar Martinez,MASCULINO,1958-06-05,68,ESTUDIO,,PRIMERA VEZ ,Tomografia OCT Macular por ojo,,,,,TARJETA,5100,',
          '"Tuesday, September 1, 2026",11:30AM,12:00PM,6644388498,DRA IRINA ,,Carlos Gomez Jimenez,MASCULINO,1957-02-16,69,CONSULTA,CATARATA,PRIMERA VEZ ,,,,,,ISSSTECALI,EFECTIVO,800,',
        ],
      }}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
