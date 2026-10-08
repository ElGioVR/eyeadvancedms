'use client';

import { Doctor, toDateStr, rangoVista, urlAgenda, desplazarVista, aplicarCambiosEvento, mensajeError, getMonday, addDays, DIAS_CORTOS, daysInMonth, firstDayOfMonth, dateStr, parseTimeToMinutes, duracionEventoMin, DEFAULT_HOUR_START, DEFAULT_HOUR_END, HOUR_HEIGHT, TipoStat, ESTADOS_ORDEN, MESES, estadoLabels, estadoConfig, fmtDateShort, fmtDate, urlAgendarConsulta, tipoConfig, fmtTime, fmtHourAMPM, OverlapItem, computeOverlapColumns, getDocColor, getDoctorInitials } from '@/components/agenda/agenda-comun';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { agendaSoloPropia, puedeGestionarAgenda } from '@/lib/permisos-agenda';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { type AgendaCirugia, type AgendaCirugiaEstado } from '@/types';
import { useRouter } from 'next/navigation';
import { type AccionRapida, accionesDisponibles, AccionRapidaModal, AgendarRapidoModal } from '@/components/agenda/AccionesRapidasAgenda';
import { useFetch, REFRESCO_COMPARTIDO_MS, useInvalidar } from '@/hooks/useFetch';
import { useSWRConfig, preload } from 'swr';
import { useToast } from '@/components/ui/Toast';
import { swrFetcher, enviarJSON, fetchJSON } from '@/lib/fetcher';
import ReportesAgendaCsv from '@/components/agenda/ReportesAgendaCsv';
import BandejaAgenda from '@/components/agenda/BandejaAgenda';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import BotonesExportar from '@/components/ui/BotonesExportar';
import { etiquetaOjo } from '@/lib/catalogos/cirugia';
import { Upload, Plus, Calendar, Stethoscope, User, FileSpreadsheet, SlidersHorizontal, Minimize2, ChevronLeft, ChevronRight, Maximize2, Square, Columns3, GripVertical, Clock, X } from 'lucide-react';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import Aislado from '@/components/ui/Aislado';
import MobileCalendarView from '@/components/agenda/MobileCalendarView';
import Modal from '@/components/ui/Modal';
import CampoBusquedaAgenda from '@/components/agenda/CampoBusquedaAgenda';
import dynamic from 'next/dynamic';

// Piezas que solo se usan al interactuar: se cargan bajo demanda (bundle inicial
// de la agenda más ligero) y se precargan en segundo plano tras el primer render.
const cargarDetalle = () => import('@/components/agenda/AgendaDetalle');
const cargarImportar = () => import('@/components/agenda/ImportarAgenda');
const DetailPopoverCard = dynamic(() => cargarDetalle().then((m) => m.DetailPopoverCard), { ssr: false });
const ImportExcel = dynamic(() => cargarImportar().then((m) => m.ImportExcel), { ssr: false });
const ImportConsultas = dynamic(() => cargarImportar().then((m) => m.ImportConsultas), { ssr: false });

const CLAVE_VISTA_AGENDA = 'agenda_ultima_vista';
/** Guarda parte del estado de la agenda para restaurarlo al regresar desde el detalle. */
function guardarVistaAgenda(patch: Record<string, unknown>) {
  try {
    const previa = JSON.parse(sessionStorage.getItem(CLAVE_VISTA_AGENDA) || '{}');
    sessionStorage.setItem(CLAVE_VISTA_AGENDA, JSON.stringify({ ...previa, ...patch }));
  } catch { /* sin almacenamiento: no pasa nada */ }
}

interface Props { userRol: string; doctores: Doctor[]; userId?: string; initialDate: string; }

export default function AgendaContent({ userRol, doctores, userId, initialDate }: Props) {
  // Precarga en reposo de los módulos diferidos (el popover abre sin espera).
  useEffect(() => {
    const precargar = () => {
      void cargarDetalle();
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(precargar);
    else setTimeout(precargar, 1500);
  }, []);
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
  // Búsqueda con debounce dentro de CampoBusquedaAgenda: aquí solo llega el texto final
  // (una petición al dejar de teclear y sin repintar el calendario en cada tecla).
  const [searchQuery, setSearchQuery] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showImportConsultas, setShowImportConsultas] = useState(false);
  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [showImportChoice, setShowImportChoice] = useState(false);
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
  const [agendarRapido, setAgendarRapido] = useState<{ fecha: string; hora: string; tipo: 'PRIMERA' | 'ESTUDIOS' } | null>(null);
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

  // Volver a la agenda: recuerda la vista (día/semana/mes) y la fecha, y las restaura al regresar.
  const restauradaRef = useRef(false);
  const scrollPendienteRef = useRef<number | null>(null);
  useEffect(() => {
    if (restauradaRef.current) return;
    restauradaRef.current = true;
    try {
      const guardada = sessionStorage.getItem(CLAVE_VISTA_AGENDA);
      if (!guardada) return;
      const { vista, fecha, scroll, windowScroll } = JSON.parse(guardada) as { vista?: string; fecha?: string; scroll?: number; windowScroll?: number };
      if (typeof scroll === 'number') scrollPendienteRef.current = scroll;
      if (typeof windowScroll === 'number' && windowScroll > 0) requestAnimationFrame(() => window.scrollTo(0, windowScroll));
      if (vista === 'month' || vista === 'week' || vista === 'day') setCalendarView(vista);
      const fechaUrl = new URLSearchParams(window.location.search).get('fecha');
      if (!fechaUrl && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        setCurrentDate(new Date(`${fecha}T12:00:00`));
        setSelectedDate(fecha);
      }
    } catch { /* sin almacenamiento: se queda en la vista por defecto */ }
  }, []);
  useEffect(() => {
    guardarVistaAgenda({ vista: calendarView, fecha: toDateStr(currentDate) });
  }, [calendarView, currentDate]);
  // Guarda la posición del scroll (grilla de horas y página) mientras se navega.
  useEffect(() => {
    const onScroll = (e: Event) => {
      if (timeGridRef.current && e.target === timeGridRef.current) guardarVistaAgenda({ scroll: timeGridRef.current.scrollTop });
      else if (e.target === document) guardarVistaAgenda({ windowScroll: window.scrollY });
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

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
    if (!selectedDate && todayStr) setSelectedDate(initialDate || todayStr);
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
        const dur = duracionEventoMin(c);
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
      if (scrollPendienteRef.current !== null) {
        timeGridRef.current.scrollTop = scrollPendienteRef.current;
        scrollPendienteRef.current = null;
        return;
      }
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
  // Reportes: pacientes atendidos para admin, recepción y doctor; cirugías y entradas/salidas solo admin.
  const verReportes = userRol === 'admin' || userRol === 'recepcionista' || userRol === 'doctor';
  // Bandeja de pendientes (confirmar / cerrar citas): quien gestiona la agenda.
  const verBandeja = puedeGestionarAgenda(userRol);
  const bandeja = verBandeja ? <BandejaAgenda onCambio={refetch} /> : null;
  const reportes = verReportes ? (
    <ReportesAgendaCsv rol={userRol} desde={reportesRango.desde} hasta={reportesRango.hasta} doctores={reportesDoctores} doctorId={filterDoctor} />
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
              <BotonesExportar
                crear={() => {
                  const dia = selectedDate || todayStr;
                  const items = cirugiasPorFecha[dia] ?? [];
                  return {
                    titulo: `Agenda del ${dia}`,
                    subtitulo: `${items.length} evento${items.length === 1 ? '' : 's'}`,
                    nombreArchivo: `agenda-${dia}`,
                    filas: items.flatMap((c) => {
                      const seccion = `${(c.hora || 'Sin hora').slice(0, 5)} · ${c.tipo || 'cirugia'}`;
                      return [
                        { seccion, campo: 'Paciente', valor: c.nombre_paciente || '' },
                        { seccion, campo: 'Procedimiento', valor: c.procedimiento || '' },
                        { seccion, campo: 'Ojo', valor: etiquetaOjo(c.ojo) },
                        { seccion, campo: 'Estado', valor: c.estado || '' },
                        { seccion, campo: 'Doctor', valor: c.doctor_nombre || '' },
                      ];
                    }),
                  };
                }}
              />
              {bandeja}
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
                          <button onClick={() => { setShowImportChoice(false); setShowImportConsultas(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consultas
                          </button>
                          <button onClick={() => { setShowImportChoice(false); setShowImport(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugías
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
                          <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consulta
                          </button>
                          <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva?tipo=ESTUDIO'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-sky-200 border-l-sky-500" /> Estudio
                          </button>
                          <button onClick={() => { setShowCreateChoice(false); router.push('/cirugias/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                            <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugía
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
          {verBandeja && (
            <BandejaAgenda
              onCambio={refetch}
              botonClassName="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-fg-2 hover:bg-gray-200 dark:hover:bg-surface-3 transition-colors"
            />
          )}
          {verReportes && (
            <ReportesAgendaCsv
              rol={userRol}
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
                      <button onClick={() => { setShowImportChoice(false); setShowImportConsultas(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consultas
                      </button>
                      <button onClick={() => { setShowImportChoice(false); setShowImport(true); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugías
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
                      <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consulta
                      </button>
                      <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva?tipo=ESTUDIO'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-sky-200 border-l-sky-500" /> Estudio
                      </button>
                      <button onClick={() => { setShowCreateChoice(false); router.push('/cirugias/nueva'); }} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left">
                        <span className="h-2 w-3 rounded-sm border-l-2 bg-violet-200 border-l-violet-500" /> Cirugía
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
            {(filterDoctor || searchQuery || filterEspecialidad || filterTipos.size < 3 || filterEstados.size < 5) && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-500 ring-2 ring-surface" />
            )}
          </button>
          {verBandeja && (
            <BandejaAgenda
              onCambio={refetch}
              soloIcono
              botonClassName="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-fg-2 shadow-soft transition-colors active:scale-95 dark:shadow-none"
            />
          )}
          {verReportes && (
            <ReportesAgendaCsv
              rol={userRol}
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
                    <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2">
                      <span className="h-2 w-3 rounded-sm border-l-2 border-l-amber-500 bg-amber-200" /> Consulta
                    </button>
                    <button onClick={() => { setShowCreateChoice(false); router.push('/consultas/nueva?tipo=ESTUDIO'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2">
                      <span className="h-2 w-3 rounded-sm border-l-2 border-l-sky-500 bg-sky-200" /> Estudio
                    </button>
                    <button onClick={() => { setShowCreateChoice(false); router.push('/cirugias/nueva'); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2">
                      <span className="h-2 w-3 rounded-sm border-l-2 border-l-violet-500 bg-violet-200" /> Cirugía
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
              <CampoBusquedaAgenda
                valor={searchQuery}
                onCambiar={setSearchQuery}
                placeholder="Buscar..."
                iconClassName="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
                inputClassName="w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 py-2 text-xs text-fg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
              />
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
                  { key: 'consulta', label: 'Consulta', bg: 'bg-amber-200', border: 'border-l-amber-500' },
                  { key: 'estudio', label: 'Estudio', bg: 'bg-sky-200', border: 'border-l-sky-500' },
                  { key: 'cirugia', label: 'Cirugía', bg: 'bg-violet-200', border: 'border-l-violet-500' },
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
            <Aislado nombre="el calendario" contexto="agenda.movil">
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
            </Aislado>
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
                              const dur = duracionEventoMin(c);
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
                            const durationMin = duracionEventoMin(c);
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
                                    {fmtTime(c.hora)}{(c.detalle || c.procedimiento) ? ' · ' + (c.detalle || c.procedimiento) : ''}
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
                          const dur = duracionEventoMin(c);
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
                        const durationMin = duracionEventoMin(c);
                        const height = Math.max(52, (durationMin / 60) * HOUR_HEIGHT - 2);

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
                                {(c.detalle || c.procedimiento) && <span className="flex min-w-0 items-center gap-1" title={c.detalle || c.procedimiento || ''}><Stethoscope className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{c.detalle || c.procedimiento}</span></span>}
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
                setAgendarRapido({ fecha, hora, tipo: 'PRIMERA' });
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left"
            >
              <span className="h-2 w-3 rounded-sm border-l-2 bg-amber-200 border-l-amber-500" /> Consulta
            </button>
            <button
              onClick={() => {
                const fecha = dayCreate.date;
                const hora = dayCreate.hour || '';
                setDayCreate(null);
                setAgendarRapido({ fecha, hora, tipo: 'ESTUDIOS' });
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left"
            >
              <span className="h-2 w-3 rounded-sm border-l-2 bg-sky-200 border-l-sky-500" /> Estudio
            </button>
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
          </div>
        </div>
      )}

      {/* Detail Popover Card */}
      {detailCirugia && detailPosition && (
        <DetailPopoverCard
          cirugia={detailCirugia}
          position={detailPosition}
          userRol={userRol}
          onEdit={() => { setDetailCirugia(null); setDetailPosition(null); router.push(`/cirugias/${detailCirugia.id}/editar`); }}
          onClose={() => { setDetailCirugia(null); setDetailPosition(null); }}
          onEstado={async (s, extra) => {
            const id = detailCirugia.id;
            setDetailCirugia(null); setDetailPosition(null);
            // La API de cirugías exige motivo en todo cambio de estado.
            await actualizarEvento(id, { estado: s, motivo: 'Actualizado desde la agenda', ...(extra ?? {}) } as Partial<AgendaCirugia>);
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
              <CampoBusquedaAgenda
                valor={searchQuery}
                onCambiar={setSearchQuery}
                placeholder="Buscar paciente..."
                iconClassName="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                inputClassName="w-full rounded-lg border border-line bg-surface-2 pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
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
                    { key: 'consulta', label: 'Consulta', bg: 'bg-amber-200', border: 'border-l-amber-500' },
                    { key: 'estudio', label: 'Estudio', bg: 'bg-sky-200', border: 'border-l-sky-500' },
                    { key: 'cirugia', label: 'Cirugía', bg: 'bg-violet-200', border: 'border-l-violet-500' },
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
                  setSearchQuery('');
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
