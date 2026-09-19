'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, X, Clock, Eye, Stethoscope, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaCirugia, AgendaCirugiaEstado } from '@/types';

const DIAS_LARGOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const estadoDotColors: Record<string, string> = {
  agendada: 'bg-blue-500',
  aplazada: 'bg-amber-500',
  reagendada: 'bg-violet-500',
  completada: 'bg-emerald-500',
  cancelada: 'bg-red-500',
};

const estadoBg: Record<string, string> = {
  agendada: 'bg-blue-500/10 border-blue-400/30',
  aplazada: 'bg-amber-500/10 border-amber-400/30',
  reagendada: 'bg-violet-500/10 border-violet-400/30',
  completada: 'bg-emerald-500/10 border-emerald-400/30',
  cancelada: 'bg-red-500/10 border-red-400/30',
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
}

type ViewMode = 'month' | 'day';

export default function MobileCalendarView({ cirugiasPorFecha, onDateSelect, onAdd, onSelect, todayStr }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [slideDir, setSlideDir] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedCirugia, setSelectedCirugia] = useState<AgendaCirugia | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

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
        d.setMonth(d.getMonth() + dir);
        return d;
      });
      setIsAnimating(false);
    }, 150);
  }, [isAnimating]);

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
    setViewMode('day');
    onDateSelect(ds);
  }, [year, month, onDateSelect]);

  const handleSelectCirugia = useCallback((cirugia: AgendaCirugia) => {
    setSelectedCirugia(cirugia);
    onSelect?.(cirugia);
  }, [onSelect]);

  const closeDetail = useCallback(() => {
    setSelectedCirugia(null);
  }, []);

  const goToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDay(todayStr);
    setViewMode('month');
    onDateSelect(todayStr);
  }, [todayStr, onDateSelect]);

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
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedCirugia]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-black text-gray-900 dark:text-[#E7E9EA]">
            {MESES[month]}
          </h2>
          <span className="text-sm font-medium text-gray-400 dark:text-[#71767B]">{year}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => viewMode === 'month' ? navigateMonth(-1) : navigateDay(-1)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-full text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={() => viewMode === 'month' ? navigateMonth(1) : navigateDay(1)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 px-4 mb-2">
        <button
          onClick={() => setViewMode('month')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
            viewMode === 'month'
              ? 'bg-primary-600 text-white'
              : 'text-gray-500 dark:text-[#71767B] hover:bg-gray-100 dark:hover:bg-[#202327]'
          )}
        >
          Mes
        </button>
        <button
          onClick={() => setViewMode('day')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
            viewMode === 'day'
              ? 'bg-primary-600 text-white'
              : 'text-gray-500 dark:text-[#71767B] hover:bg-gray-100 dark:hover:bg-[#202327]'
          )}
        >
          Día
        </button>
      </div>

      {viewMode === 'month' ? (
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="px-2"
        >
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 dark:text-[#71767B] py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className={cn(
              'grid grid-cols-7 gap-px transition-opacity duration-150',
              isAnimating ? 'opacity-0' : 'opacity-100'
            )}
          >
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-14" />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const day = i + 1;
              const ds = dateStr(year, month, day);
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay && viewMode === 'month';
              const eventCount = monthEvents[ds] || 0;
              const hasEvents = eventCount > 0;

              return (
                <button
                  key={day}
                  onClick={() => selectDay(day)}
                  className={cn(
                    'relative h-14 flex flex-col items-center justify-center rounded-xl transition-all',
                    isToday && !isSelected && 'bg-primary-500/10 ring-1 ring-primary-500/30',
                    isSelected && 'bg-primary-600 shadow-lg shadow-primary-600/30',
                    !isToday && !isSelected && 'hover:bg-gray-50 dark:hover:bg-[#202327]'
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-bold',
                      isToday && !isSelected && 'text-primary-600',
                      isSelected && 'text-white',
                      !isToday && !isSelected && 'text-gray-700 dark:text-[#E7E9EA]'
                    )}
                  >
                    {day}
                  </span>
                  {hasEvents && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Object.entries(
                        (cirugiasPorFecha[ds] || []).reduce<Record<string, number>>((acc, c) => {
                          acc[c.estado] = (acc[c.estado] || 0) + 1;
                          return acc;
                        }, {})
                      ).slice(0, 3).map(([estado, count]) => (
                        <span
                          key={estado}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            isSelected ? 'bg-white/70' : (estadoDotColors[estado] || 'bg-gray-400')
                          )}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Day view */
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className={cn(
            'flex-1 overflow-y-auto px-4 pb-20 transition-all duration-150',
            isAnimating ? 'opacity-0' : 'opacity-100'
          )}
        >
          <div className="text-center mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">{dayName}</p>
            <p className="text-4xl font-black text-gray-900 dark:text-[#E7E9EA]">{selectedDayDate.getDate()}</p>
          </div>

          {dayEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-10 w-10 text-gray-200 dark:text-[#2F3336] mx-auto mb-3" />
              <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin cirugías programadas</p>
              {onAdd && (
                <button
                  onClick={() => onAdd(selectedDay)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar cirugía
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCirugia(c)}
                  className={cn(
                    'w-full text-left rounded-xl border p-3.5 transition-all active:scale-[0.98]',
                    estadoBg[c.estado] || 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{c.hora || '—'}</span>
                        <span className={cn('h-2 w-2 rounded-full shrink-0', estadoDotColors[c.estado] || 'bg-gray-400')} />
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-[#E7E9EA] mt-1 truncate">{c.nombre_paciente}</p>
                      {c.procedimiento && (
                        <p className="text-xs text-gray-500 dark:text-[#71767B] mt-0.5 truncate">{c.procedimiento}</p>
                      )}
                    </div>
                    {c.doctor_nombre && (
                      <span className="shrink-0 text-[10px] font-bold text-gray-400 dark:text-[#71767B] bg-gray-100 dark:bg-[#202327] rounded-md px-2 py-1">
                        {c.doctor_nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail Slide-up Panel */}
      {selectedCirugia && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDetail} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] bg-white dark:bg-[#16181C] rounded-t-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-[#3E4144]" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-[#2F3336]">
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
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{selectedCirugia.nombre_paciente}</h3>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                    selectedCirugia.estado === 'agendada' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                    selectedCirugia.estado === 'completada' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    selectedCirugia.estado === 'cancelada' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                    selectedCirugia.estado === 'aplazada' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    selectedCirugia.estado === 'reagendada' && 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
                  )}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', estadoDotColors[selectedCirugia.estado])} />
                    {selectedCirugia.estado}
                  </span>
                </div>
              </div>
              <button onClick={closeDetail} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors">
                <X className="h-5 w-5 text-gray-500 dark:text-[#71767B]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-[#202327]">
                  <Clock className="h-4 w-4 text-primary-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">Hora</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.hora || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-[#202327]">
                  <Eye className="h-4 w-4 text-sky-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">Ojo</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.ojo || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-[#202327]">
                  <Stethoscope className="h-4 w-4 text-violet-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">Tiempo</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.tiempo_estimado || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-[#202327]">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">Estancia</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.tiempo_estancia || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 dark:border-[#2F3336] p-4">
                <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-[#71767B] mb-2">
                  <Stethoscope className="h-3.5 w-3.5" /> Procedimiento
                </h4>
                <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.procedimiento || '—'}</p>
              </div>

              <div className="rounded-xl border border-gray-100 dark:border-[#2F3336] p-4">
                <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-[#71767B] mb-2">
                  <FileText className="h-3.5 w-3.5" /> Diagnóstico
                </h4>
                <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.diagnostico || '—'}</p>
              </div>

              <div className="rounded-xl border border-gray-100 dark:border-[#2F3336] p-4">
                <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-[#71767B] mb-2">
                  <Eye className="h-3.5 w-3.5" /> LIO Asignado
                </h4>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.lio || 'Sin LIO asignado'}</p>
                  {selectedCirugia.marca_lio && (
                    <p className="text-xs text-gray-500 dark:text-[#71767B]">Marca: {selectedCirugia.marca_lio}</p>
                  )}
                </div>
              </div>

              {(selectedCirugia.expediente || selectedCirugia.procedencia || selectedCirugia.jornada) && (
                <div className="rounded-xl border border-gray-100 dark:border-[#2F3336] p-4">
                  <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-[#71767B] mb-2">
                    <FileText className="h-3.5 w-3.5" /> Información Adicional
                  </h4>
                  <div className="space-y-2 text-sm">
                    {selectedCirugia.expediente && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-[#71767B]">Expediente</span>
                        <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.expediente}</span>
                      </div>
                    )}
                    {selectedCirugia.jornada && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-[#71767B]">Jornada</span>
                        <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.jornada}</span>
                      </div>
                    )}
                    {selectedCirugia.procedencia && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-[#71767B]">Procedencia</span>
                        <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{selectedCirugia.procedencia}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedCirugia.notas && (
                <div className="rounded-xl border border-gray-100 dark:border-[#2F3336] p-4">
                  <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-[#71767B] mb-2">
                    <FileText className="h-3.5 w-3.5" /> Notas
                  </h4>
                  <p className="text-sm text-gray-700 dark:text-[#E7E9EA] whitespace-pre-wrap">{selectedCirugia.notas}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
