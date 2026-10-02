'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, X, Clock, Eye, Stethoscope, FileText, AlertCircle, ExternalLink, CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaCirugia, AgendaCirugiaEstado } from '@/types';
import { etiquetaOjo } from '@/lib/catalogos/cirugia';
import { ETIQUETA_ACCION, type AccionRapida } from '@/lib/agenda-acciones';
import FichaPaciente from '@/components/ui/FichaPaciente';

const DIAS_LARGOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const estadoDotColors: Record<string, string> = {
  agendada: 'bg-blue-500',
  aplazada: 'bg-amber-500',
  reagendada: 'bg-violet-500',
  completada: 'bg-emerald-500',
  cancelada: 'bg-red-500',
};

// Matriz de colores homologada con desktop (AgendaContent):
// fondo/texto por TIPO del evento + borde/chip por ESTADO.
const tipoStyles: Record<string, { bg: string; text: string }> = {
  cirugia: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  consulta: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  estudio: { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300' },
};

const tipoDot: Record<string, string> = {
  cirugia: 'bg-violet-500',
  consulta: 'bg-amber-500',
  estudio: 'bg-sky-500',
};

const tipoBar: Record<string, string> = {
  cirugia: 'bg-violet-500',
  consulta: 'bg-amber-500',
  estudio: 'bg-sky-500',
};

const estadoBorderL: Record<string, string> = {
  agendada: 'border-l-blue-500',
  aplazada: 'border-l-amber-500',
  reagendada: 'border-l-violet-500',
  completada: 'border-l-emerald-500',
  cancelada: 'border-l-red-500',
};

const estadoChipBg: Record<string, string> = {
  agendada: 'bg-blue-500/10',
  aplazada: 'bg-amber-500/10',
  reagendada: 'bg-violet-500/10',
  completada: 'bg-emerald-500/10',
  cancelada: 'bg-red-500/10',
};

const estadoLabels: Record<string, string> = {
  agendada: 'Agendada',
  aplazada: 'Aplazada',
  reagendada: 'Reagendada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
function dateStr(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

interface Props {
  cirugiasPorFecha: Record<string, AgendaCirugia[]>;
  onDateSelect: (date: string) => void;
  onAdd?: (date: string) => void;
  onSelect?: (cirugia: AgendaCirugia) => void;
  todayStr: string;
  openDay?: { date: string; key: number } | null;
  /** Avisa al padre del mes visible para que cargue ese rango de datos. */
  onMonthChange?: (year: number, month: number) => void;
  loading?: boolean;
  /** Acciones rápidas disponibles para el evento (aplazar / reagendar / cancelar). */
  getAcciones?: (cirugia: AgendaCirugia) => AccionRapida[];
  onAccion?: (cirugia: AgendaCirugia, accion: AccionRapida) => void;
  /** «Agendar consulta» con los datos del evento precargados. */
  onAgendarConsulta?: (cirugia: AgendaCirugia) => void;
}

type ViewMode = 'month' | 'day';

export default function MobileCalendarView({ cirugiasPorFecha, onDateSelect, onAdd, onSelect, todayStr, openDay, onMonthChange, loading, getAcciones, onAccion, onAgendarConsulta }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date('2000-01-01T12:00:00'));
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [slideDir, setSlideDir] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedCirugia, setSelectedCirugia] = useState<AgendaCirugia | null>(null);
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  // Swipe-down del bottom sheet de detalle
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetDragStartY = useRef(0);
  const sheetDragStartTime = useRef(0);
  const sheetDraggingRef = useRef(false);
  const openDayKey = openDay?.key;
  const openDayDate = openDay?.date;

  useEffect(() => {
    setCurrentDate(new Date());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedDay && todayStr) setSelectedDay(todayStr);
  }, [selectedDay, todayStr]);

  useEffect(() => {
    if (openDayKey == null || !openDayDate) return;
    setSelectedDay(openDayDate);
    setCurrentDate(new Date(openDayDate + 'T00:00:00'));
    setSlideDir(0);
    setIsAnimating(false);
  }, [openDayKey, openDayDate]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const isCurrentMonth = mounted && new Date().getFullYear() === year && new Date().getMonth() === month;

  const dayEvents = useMemo(() => {
    const events = cirugiasPorFecha[selectedDay] || [];
    return events;
  }, [cirugiasPorFecha, selectedDay]);

  const monthEvents = useMemo(() => {
    const counts: Record<string, number> = {};
    const startDate = dateStr(year, month, 1);
    const endDate = dateStr(year, month, days);
    for (const [fecha, eventos] of Object.entries(cirugiasPorFecha)) {
      if (fecha >= startDate && fecha <= endDate) {
        counts[fecha] = eventos.length;
      }
    }
    return counts;
  }, [cirugiasPorFecha, year, month, days]);

  const navigateMonth = useCallback((dir: number) => {
    if (isAnimating) return;
    setSlideDir(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentDate(prev => {
        const d = new Date(prev);
        d.setDate(1);
        d.setMonth(d.getMonth() + dir);
        onMonthChange?.(d.getFullYear(), d.getMonth());
        return d;
      });
      setIsAnimating(false);
    }, 150);
  }, [isAnimating, onMonthChange]);

  const navigateDay = useCallback((dir: number) => {
    if (isAnimating) return;
    setSlideDir(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setSelectedDay(prev => {
        const d = new Date(prev + 'T00:00:00');
        d.setDate(d.getDate() + dir);
        return dateStr(d.getFullYear(), d.getMonth(), d.getDate());
      });
      setIsAnimating(false);
    }, 150);
  }, [isAnimating]);

  const selectDay = useCallback((day: number) => {
    const ds = dateStr(year, month, day);
    setSelectedDay(ds);
    onDateSelect(ds);
  }, [year, month, onDateSelect]);

  const handleSelectCirugia = useCallback((cirugia: AgendaCirugia) => {
    setSelectedCirugia(cirugia);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedCirugia(null);
  }, []);

  const goToday = useCallback(() => {
    const hoy = new Date();
    setCurrentDate(hoy);
    setSelectedDay(todayStr);
    onDateSelect(todayStr);
    onMonthChange?.(hoy.getFullYear(), hoy.getMonth());
  }, [todayStr, onDateSelect, onMonthChange]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (viewMode === 'month') navigateMonth(dx < 0 ? 1 : -1);
    else navigateDay(dx < 0 ? 1 : -1);
  }, [viewMode, navigateMonth, navigateDay]);

  const selectedDayDate = new Date(selectedDay + 'T00:00:00');
  const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][selectedDayDate.getDay()];

  useEffect(() => {
    if (selectedCirugia) {
      document.body.style.overflow = 'hidden';
      setSheetDragY(0);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedCirugia]);

  // Gestos del bottom sheet: arrastrar la barra superior hacia abajo cierra
  const onSheetDragStart = useCallback((e: React.TouchEvent) => {
    sheetDragStartY.current = e.touches[0].clientY;
    sheetDragStartTime.current = Date.now();
    sheetDraggingRef.current = true;
  }, []);

  const onSheetDragMove = useCallback((e: React.TouchEvent) => {
    if (!sheetDraggingRef.current) return;
    const dy = e.touches[0].clientY - sheetDragStartY.current;
    setSheetDragY(Math.max(0, dy));
  }, []);

  const onSheetDragEnd = useCallback((e: React.TouchEvent) => {
    if (!sheetDraggingRef.current) return;
    sheetDraggingRef.current = false;
    const dy = e.changedTouches[0].clientY - sheetDragStartY.current;
    const dt = Math.max(Date.now() - sheetDragStartTime.current, 1);
    const velocity = dy / dt;
    // Cierra si arrastró lo suficiente o si el gesto fue rápido hacia abajo
    if (dy > 96 || velocity > 0.55) {
      setSheetDragY(0);
      closeDetail();
    } else {
      setSheetDragY(0); // regresa con la transición
    }
  }, [closeDetail]);

  const semanas = Math.ceil((firstDay + days) / 7);
  const diaSeleccionadoLabel = selectedDay
    ? selectedDayDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  void viewMode;
  void setViewMode;
  void slideDir;
  void navigateDay;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* ── Calendario mensual ── */}
      <section className="rounded-3xl border border-line bg-surface p-3 shadow-card dark:shadow-none">
        <div className="mb-2 flex items-center justify-between px-1.5 pt-0.5">
          <h2 className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tracking-tight text-fg">{MESES[month]}</span>
            <span className="text-sm font-medium text-muted tabular-nums">{year}</span>
            {loading && <span className="ml-1 inline-block h-3.5 w-3.5 animate-spin self-center rounded-full border-2 border-line border-t-primary-500" />}
          </h2>
          <div className="flex items-center rounded-xl bg-surface-2 p-0.5">
            <button onClick={() => navigateMonth(-1)} aria-label="Mes anterior" className="rounded-lg p-1.5 text-fg-2 transition-colors active:bg-surface-3">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                isCurrentMonth && selectedDay === todayStr ? 'text-muted' : 'bg-surface text-primary-600 shadow-soft dark:bg-surface-3 dark:text-primary-300'
              )}
            >
              Hoy
            </button>
            <button onClick={() => navigateMonth(1)} aria-label="Mes siguiente" className="rounded-lg p-1.5 text-fg-2 transition-colors active:bg-surface-3">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="grid grid-cols-7">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
              <div key={d} className={cn('py-1.5 text-center text-[11px] font-semibold', i >= 5 ? 'text-muted/70' : 'text-muted')}>{d}</div>
            ))}
          </div>
          <div
            className={cn(
              'grid grid-cols-7 transition-all duration-150',
              isAnimating ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100'
            )}
            style={{ gridTemplateRows: `repeat(${semanas}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12" />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const day = i + 1;
              const ds = dateStr(year, month, day);
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay;
              const eventos = cirugiasPorFecha[ds] || [];
              const tipos = Array.from(new Set(eventos.map((c) => c.tipo || 'cirugia'))).slice(0, 3);

              return (
                <button
                  key={day}
                  onClick={() => selectDay(day)}
                  aria-label={`${day} de ${MESES[month]}${eventos.length ? `, ${eventos.length} eventos` : ''}`}
                  aria-pressed={isSelected}
                  className="flex h-12 flex-col items-center justify-center gap-1 rounded-xl transition-colors active:bg-surface-2"
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums transition-all',
                      isSelected
                        ? 'bg-primary-600 font-semibold text-white shadow-md shadow-primary-600/30'
                        : isToday
                          ? 'font-semibold text-primary-600 ring-1 ring-primary-500/40 dark:text-primary-300'
                          : 'font-medium text-fg'
                    )}
                  >
                    {day}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {tipos.map((t) => (
                      <span key={t} className={cn('h-1.5 w-1.5 rounded-full', tipoDot[t] || 'bg-gray-400')} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Eventos del día seleccionado ── */}
      <section className="pb-4">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h3 className="text-sm font-semibold text-fg first-letter:uppercase">
            {selectedDay === todayStr ? 'Hoy · ' : ''}{diaSeleccionadoLabel}
          </h3>
          <span className="text-xs text-muted tabular-nums">
            {dayEvents.length} evento{dayEvents.length === 1 ? '' : 's'}
          </span>
        </div>

        {dayEvents.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong/70 px-6 py-10 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-400/10 dark:text-primary-300">
              <Calendar className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-fg">Día libre</p>
            <p className="mt-0.5 text-xs text-muted">No hay eventos programados</p>
            {onAdd && (
              <button onClick={() => onAdd(selectedDay)} className="btn-secondary mt-4 h-9 px-3 text-xs">
                <Plus className="h-3.5 w-3.5" /> Agendar
              </button>
            )}
          </div>
        ) : (
          <ol className="space-y-2">
            {dayEvents.map((c) => {
              const tipo = c.tipo || 'cirugia';
              return (
                <li key={c.id}>
                  <button
                    onClick={() => handleSelectCirugia(c)}
                    className="flex w-full items-stretch gap-3 rounded-2xl border border-line bg-surface p-3 text-left shadow-soft transition-all active:scale-[0.99] dark:shadow-none"
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center justify-center border-r border-line pr-3">
                      <span className="text-sm font-semibold text-fg tabular-nums">{c.hora ? c.hora.slice(0, 5) : '—'}</span>
                      {c.tiempo_estimado && <span className="text-[10px] text-muted">{c.tiempo_estimado}{/^\d+$/.test(c.tiempo_estimado) ? ' min' : ''}</span>}
                    </div>
                    <span className={cn('w-1 shrink-0 rounded-full', tipoBar[tipo] || 'bg-gray-400')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{c.nombre_paciente}</p>
                      <FichaPaciente
                        variante="compacta"
                        className="block truncate"
                        expediente={c.paciente_expediente ?? c.expediente}
                        sexo={c.paciente_sexo}
                        fechaNacimiento={c.paciente_fecha_nacimiento}
                        edad={c.paciente_edad}
                      />
                      {c.procedimiento && <p className="mt-0.5 truncate text-xs text-muted">{c.procedimiento}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', estadoChipBg[c.estado] || 'bg-surface-2', 'text-fg-2')}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', estadoDotColors[c.estado] || 'bg-gray-400')} />
                          {estadoLabels[c.estado] || c.estado}
                        </span>
                        {c.doctor_nombre && (
                          <span className="truncate rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-fg-2">{c.doctor_nombre}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Detail Slide-up Panel */}
      {selectedCirugia && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDetail} />
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 max-h-[85dvh] bg-surface rounded-t-2xl shadow-2xl overflow-hidden flex flex-col',
              sheetDragY === 0 && 'transition-transform duration-200 ease-out'
            )}
            style={{ transform: `translateY(${sheetDragY}px)` }}
          >
            {/* Zona de gesto: arrastrar hacia abajo para cerrar */}
            <div
              onTouchStart={onSheetDragStart}
              onTouchMove={onSheetDragMove}
              onTouchEnd={onSheetDragEnd}
              style={{ touchAction: 'none' }}
            >
              <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-line-strong" />
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-b border-line/70">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white shrink-0',
                    selectedCirugia.estado === 'completada' ? 'bg-emerald-500' :
                    selectedCirugia.estado === 'cancelada' ? 'bg-red-500' :
                    selectedCirugia.estado === 'aplazada' ? 'bg-amber-500' : 'bg-primary-600'
                  )}>
                    {selectedCirugia.nombre_paciente.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-fg truncate">{selectedCirugia.nombre_paciente}</h3>
                    <FichaPaciente
                      variante="linea"
                      className="mb-1 text-xs"
                      expediente={selectedCirugia.paciente_expediente ?? selectedCirugia.expediente}
                      sexo={selectedCirugia.paciente_sexo}
                      fechaNacimiento={selectedCirugia.paciente_fecha_nacimiento}
                      edad={selectedCirugia.paciente_edad}
                    />
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                      estadoChipBg[selectedCirugia.estado] || 'bg-gray-500/10',
                      tipoStyles[selectedCirugia.tipo || 'cirugia']?.text || 'text-fg-2',
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', estadoDotColors[selectedCirugia.estado])} />
                      {estadoLabels[selectedCirugia.estado] || selectedCirugia.estado}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { const c = selectedCirugia; closeDetail(); onSelect?.(c); }}
                    title="Ver detalle completo"
                    aria-label="Ver detalle completo"
                    className="p-2 rounded-full hover:bg-surface-2 transition-colors"
                  >
                    <ExternalLink className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </button>
                  <button onClick={closeDetail} title="Cerrar" aria-label="Cerrar" className="p-2 rounded-full hover:bg-surface-2 transition-colors">
                    <X className="h-5 w-5 text-muted" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2">
                  <Clock className="h-4 w-4 text-primary-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted">Hora</p>
                    <p className="text-sm font-bold text-fg">{selectedCirugia.hora || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2">
                  <Eye className="h-4 w-4 text-sky-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted">Ojo</p>
                    <p className="text-sm font-bold text-fg">{etiquetaOjo(selectedCirugia.ojo) || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2">
                  <Stethoscope className="h-4 w-4 text-violet-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted">Tiempo</p>
                    <p className="text-sm font-bold text-fg">{selectedCirugia.tiempo_estimado || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted">Estancia</p>
                    <p className="text-sm font-bold text-fg">{selectedCirugia.tiempo_estancia || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line/70 p-4">
                <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted mb-2">
                  <Stethoscope className="h-3.5 w-3.5" /> Procedimiento
                </h4>
                <p className="text-sm font-medium text-fg">{selectedCirugia.procedimiento || '—'}</p>
              </div>

              <div className="rounded-xl border border-line/70 p-4">
                <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted mb-2">
                  <FileText className="h-3.5 w-3.5" /> Diagnóstico
                </h4>
                <p className="text-sm font-medium text-fg">{selectedCirugia.diagnostico || '—'}</p>
              </div>

              <div className="rounded-xl border border-line/70 p-4">
                <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted mb-2">
                  <Eye className="h-3.5 w-3.5" /> LIO Asignado
                </h4>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-fg">{selectedCirugia.lio || 'Sin LIO asignado'}</p>
                  {selectedCirugia.marca_lio && (
                    <p className="text-xs text-muted">Marca: {selectedCirugia.marca_lio}</p>
                  )}
                </div>
              </div>

              {(selectedCirugia.expediente || selectedCirugia.procedencia || selectedCirugia.jornada) && (
                <div className="rounded-xl border border-line/70 p-4">
                  <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted mb-2">
                    <FileText className="h-3.5 w-3.5" /> Información Adicional
                  </h4>
                  <div className="space-y-2 text-sm">
                    {selectedCirugia.expediente && (
                      <div className="flex justify-between">
                        <span className="text-muted">Expediente</span>
                        <span className="font-bold text-fg">{selectedCirugia.expediente}</span>
                      </div>
                    )}
                    {selectedCirugia.jornada && (
                      <div className="flex justify-between">
                        <span className="text-muted">Jornada</span>
                        <span className="font-bold text-fg">{selectedCirugia.jornada}</span>
                      </div>
                    )}
                    {selectedCirugia.procedencia && (
                      <div className="flex justify-between">
                        <span className="text-muted">Procedencia</span>
                        <span className="font-bold text-fg">{selectedCirugia.procedencia}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedCirugia.notas && (
                <div className="rounded-xl border border-line/70 p-4">
                  <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted mb-2">
                    <FileText className="h-3.5 w-3.5" /> Notas
                  </h4>
                  <p className="text-sm text-fg-2 whitespace-pre-wrap">{selectedCirugia.notas}</p>
                </div>
              )}
            </div>

            {(() => {
              const acciones = getAcciones?.(selectedCirugia) ?? [];
              if (!onAccion || acciones.length === 0) return null;
              return (
                <div
                  className="grid gap-2 border-t border-line/70 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
                  style={{ gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))` }}
                  role="group"
                  aria-label="Acciones rápidas"
                >
                  {acciones.map((a) => (
                    <button
                      key={a}
                      onClick={() => { const c = selectedCirugia; closeDetail(); onAccion(c, a); }}
                      className={cn(
                        'rounded-xl border py-2.5 text-sm font-bold transition-colors',
                        a === 'cancelar'
                          ? 'border-red-200 text-red-700 active:bg-red-50 dark:border-red-500/30 dark:text-red-300'
                          : 'border-line text-fg-2 active:bg-surface-2'
                      )}
                    >
                      {ETIQUETA_ACCION[a]}
                    </button>
                  ))}
                </div>
              );
            })()}
            {onAgendarConsulta && selectedCirugia.paciente_id && (
              <div className="px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={() => { const c = selectedCirugia; closeDetail(); onAgendarConsulta(c); }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary-200 py-2.5 text-sm font-bold text-primary-700 active:bg-primary-50 dark:border-primary-500/30 dark:text-primary-300"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Agendar consulta
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
