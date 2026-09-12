'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Plus, Upload, Calendar, List, ChevronLeft, ChevronRight,
  Clock, User, Search, X, AlertTriangle, CheckCircle2,
  FileSpreadsheet, Eye, Stethoscope, MapPin, StickyNote,
  Timer, Building2, Columns3, Square, GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch } from '@/hooks/useFetch';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import SidebarPanel from '@/components/ui/SidebarPanel';
import type { AgendaCirugia, AgendaCirugiaEstado, AgendaCirugiaImportRow } from '@/types';

interface Doctor { id: string; nombre_completo: string; }
interface Props { userRol: string; doctores: Doctor[]; }

const HOUR_START = 6;
const HOUR_END = 21;
const HOUR_HEIGHT = 64;

const estadoConfig: Record<AgendaCirugiaEstado, { bg: string; text: string; dot: string; border: string; lightBg: string; solid: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-l-blue-500', lightBg: 'bg-blue-500/10', solid: 'bg-blue-500' },
  aplazada: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-l-amber-500', lightBg: 'bg-amber-500/10', solid: 'bg-amber-500' },
  completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-l-emerald-500', lightBg: 'bg-emerald-500/10', solid: 'bg-emerald-500' },
  cancelada: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-l-red-500', lightBg: 'bg-red-500/10', solid: 'bg-red-500' },
};

const estadoLabels: Record<AgendaCirugiaEstado, string> = {
  agendada: 'Agendada', aplazada: 'Aplazada', completada: 'Completada', cancelada: 'Cancelada',
};

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
function getDoctorInitials(name: string) { return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }
const docColors = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500'];
function getDocColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return docColors[Math.abs(h) % docColors.length]; }

function parseTimeToMinutes(t: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export default function AgendaContent({ userRol, doctores }: Props) {
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailCirugia, setDetailCirugia] = useState<AgendaCirugia | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddHour, setQuickAddHour] = useState<string>('');
  const [transitionDir, setTransitionDir] = useState(0);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ x: number; y: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayStr = toDateStr(today);
  const [now, setNow] = useState(new Date());

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  // On mobile, auto-select today on mount for the week strip
  useEffect(() => {
    if (!selectedDate) setSelectedDate(todayStr);
  }, []);

  useEffect(() => {
    if ((calendarView === 'week' || calendarView === 'day') && timeGridRef.current) {
      const viewDate = calendarView === 'day' ? (selectedDate || todayStr) : todayStr;
      if (viewDate === todayStr) {
        const px = Math.max(0, (now.getHours() - HOUR_START) * HOUR_HEIGHT - 100);
        timeGridRef.current.scrollTo({ top: px, behavior: 'smooth' });
      }
    }
  }, [calendarView, now, todayStr, selectedDate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft') navigate(-1);
      else if (e.key === 'ArrowRight') navigate(1);
      else if (e.key === 't' || e.key === 'T') handleGoToday();
      else if (e.key === 'm' || e.key === 'M') setCalendarView('month');
      else if (e.key === 'w' || e.key === 'W') setCalendarView('week');
      else if (e.key === 'd' || e.key === 'D') setCalendarView('day');
      else if (e.key === 'Escape') { setSelectedDate(null); setDetailCirugia(null); setDetailPosition(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fechaDesde = calendarView === 'month'
    ? dateStr(currentDate.getFullYear(), currentDate.getMonth(), 1)
    : calendarView === 'week'
      ? toDateStr(getMonday(currentDate))
      : toDateStr(currentDate);
  const fechaHasta = calendarView === 'month'
    ? dateStr(currentDate.getFullYear(), currentDate.getMonth(), daysInMonth(currentDate.getFullYear(), currentDate.getMonth()))
    : calendarView === 'week'
      ? toDateStr(addDays(getMonday(currentDate), 6))
      : toDateStr(currentDate);

  const fetchParams: Record<string, string> = { fechaDesde, fechaHasta, pageSize: '500' };
  if (filterDoctor) fetchParams.doctorId = filterDoctor;
  if (filterEstado) fetchParams.estado = filterEstado;
  if (search) fetchParams.search = search;

  const { data: cirugias, loading, refetch } = useFetch<AgendaCirugia>('/api/agenda', fetchParams);

  const cirugiasPorFecha = useMemo(() => {
    const map: Record<string, AgendaCirugia[]> = {};
    for (const c of cirugias) { const k = c.fecha || 'sin-fecha'; if (!map[k]) map[k] = []; map[k].push(c); }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    return map;
  }, [cirugias]);

  const weekDays = useMemo(() => {
    const mon = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      return { date: d, dateStr: toDateStr(d), day: d.getDate(), dayName: DIAS_CORTOS[i], isToday: toDateStr(d) === todayStr };
    });
  }, [currentDate, todayStr]);

  const stats = useMemo(() => ({
    total: cirugias.length,
    agendadas: cirugias.filter(c => c.estado === 'agendada').length,
    aplazadas: cirugias.filter(c => c.estado === 'aplazada').length,
    completadas: cirugias.filter(c => c.estado === 'completada').length,
    canceladas: cirugias.filter(c => c.estado === 'cancelada').length,
  }), [cirugias]);

  const navigate = useCallback((dir: number) => {
    setTransitionDir(dir);
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (calendarView === 'month') d.setMonth(d.getMonth() + dir);
      else if (calendarView === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  }, [calendarView]);

  const handleGoToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDate(todayStr);
  }, [todayStr]);

  const handleDayClick = useCallback((ds: string) => {
    setSelectedDate(prev => prev === ds ? null : ds);
    setDetailCirugia(null);
    setDetailPosition(null);
    if (calendarView === 'month') setCalendarView('day');
  }, [calendarView]);

  const handleQuickAdd = useCallback((ds: string, hour: number) => {
    setQuickAddDate(ds);
    setQuickAddHour(`${String(hour).padStart(2, '0')}:00`);
    setEditingId(null);
    setShowForm(true);
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
    try {
      await fetch(`/api/agenda/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: ds }),
      });
      refetch();
    } catch { /* ignore */ }
  }, [refetch]);

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

  const hours = useMemo(() => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i), []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showTimeIndicator = (calendarView === 'week' || calendarView === 'day') && nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60;
  const timeIndicatorTop = ((nowMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;

  // On mobile, day view uses selectedDate (from week strip) instead of currentDate
  const dayViewDate = selectedDate || toDateStr(currentDate);
  const dayViewDateObj = new Date(dayViewDate + 'T00:00:00');

  return (
    <div className="w-full h-full flex flex-col">
      {/* ─── Desktop Header ─── */}
      <div className="hidden lg:block">
        <PageHeader
          title="AGENDA DE CIRUGÍAS"
          subtitle="Gestión y programación de cirugías."
          action={
            <div className="flex gap-3">
              {userRol !== 'doctor' && (
                <>
                  <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                    <Upload className="h-4 w-4" /> Importar
                  </button>
                  <button onClick={() => { setEditingId(null); setQuickAddDate(null); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
                    <Plus className="h-4 w-4" /> Nueva Cirugía
                  </button>
                </>
              )}
            </div>
          }
        />

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-[#E7E9EA]', Icon: Calendar },
            { label: 'Agendadas', value: stats.agendadas, color: 'text-blue-600', Icon: Clock },
            { label: 'Aplazadas', value: stats.aplazadas, color: 'text-amber-600', Icon: Timer },
            { label: 'Completadas', value: stats.completadas, color: 'text-emerald-600', Icon: CheckCircle2 },
            { label: 'Canceladas', value: stats.canceladas, color: 'text-red-600', Icon: X },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 flex items-center gap-3">
              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', s.color.replace('text-', 'bg-').replace('600', '100').replace('900', '100'))}>
                <s.Icon className={cn('h-4 w-4', s.color)} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">{s.label}</p>
                <p className={cn('text-xl font-extrabold', s.color)}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Mobile Top Bar ─── */}
      <div className="flex lg:hidden items-center justify-between px-1 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327]">
            <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
          </button>
          <h2 className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
            {MESES[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button onClick={() => navigate(1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327]">
            <ChevronRight className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {userRol !== 'doctor' && (
            <button onClick={() => { setEditingId(null); setQuickAddDate(null); setShowForm(true); }} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#202327]">
              <Plus className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Mobile Week Strip ─── */}
      <div className="lg:hidden shrink-0 border-b border-gray-200 dark:border-[#2F3336]">
        <div className="grid grid-cols-7">
          {weekDays.map(wd => (
            <button key={wd.dateStr}
              onClick={() => { setCurrentDate(new Date(wd.dateStr + 'T00:00:00')); setSelectedDate(wd.dateStr); }}
              className={cn('flex flex-col items-center py-2 transition-colors',
                wd.dateStr === selectedDate && 'bg-primary-50 dark:bg-primary-900/10'
              )}>
              <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">{wd.dayName}</span>
              <span className={cn('mt-0.5 inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-extrabold transition-all',
                wd.isToday ? 'bg-red-500 text-white' : wd.dateStr === selectedDate ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700' : 'text-gray-900 dark:text-[#E7E9EA]'
              )}>{wd.day}</span>
              {(cirugiasPorFecha[wd.dateStr] || []).length > 0 && (
                <span className={cn('h-1.5 w-1.5 rounded-full mt-1', wd.isToday ? 'bg-red-400' : 'bg-primary-400')} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Layout: Sidebar + Calendar */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Mini Calendar Sidebar */}
        <div className="hidden xl:block w-[220px] shrink-0">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                  {MESES[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <div className="flex gap-0.5">
                  <button onClick={() => { setCurrentDate(p => { const d = new Date(p); d.setMonth(d.getMonth() - 1); return d; }); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#202327]"><ChevronLeft className="h-3.5 w-3.5 text-gray-500" /></button>
                  <button onClick={() => { setCurrentDate(p => { const d = new Date(p); d.setMonth(d.getMonth() + 1); return d; }); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#202327]"><ChevronRight className="h-3.5 w-3.5 text-gray-500" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                  <div key={d} className="text-center text-[9px] font-bold text-gray-400 dark:text-[#71767B] py-1">{d}</div>
                ))}
                {miniMonth.map((cell, i) => (
                  <button
                    key={i}
                    onClick={() => { setCurrentDate(new Date(cell.date + 'T00:00:00')); setSelectedDate(cell.date); setCalendarView('day'); }}
                    className={cn(
                      'h-7 w-full flex items-center justify-center text-[11px] rounded-full transition-colors',
                      !cell.isCurrentMonth && 'text-gray-300 dark:text-[#71767B]',
                      cell.isCurrentMonth && !cell.isToday && 'text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-100 dark:hover:bg-[#202327]',
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
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                  className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] pl-8 pr-3 py-2 text-xs text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500/30" />
              </div>
              <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-1 focus:ring-primary-500/30">
                <option value="">Todos los doctores</option>
                {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
              </select>
              <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-1 focus:ring-primary-500/30">
                <option value="">Todos los estados</option>
                {Object.entries(estadoLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Legend */}
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] mb-2">Leyenda</p>
              <div className="space-y-1.5">
                {Object.entries(estadoLabels).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 rounded-full', estadoConfig[k as AgendaCirugiaEstado].dot)} />
                    <span className="text-[11px] text-gray-600 dark:text-[#E7E9EA]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Desktop Toolbar */}
          <div className="hidden lg:flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors">
                <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
              </button>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors">
                <ChevronRight className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
              </button>
              <button onClick={handleGoToday}
                className="ml-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                Hoy
              </button>
              <h2 className="ml-3 text-base font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                {calendarView === 'month' && `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                {calendarView === 'week' && `${fmtDateShort(toDateStr(getMonday(currentDate)))} – ${fmtDateShort(toDateStr(addDays(getMonday(currentDate), 6)))}, ${currentDate.getFullYear()}`}
                {calendarView === 'day' && fmtDate(toDateStr(currentDate))}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile search */}
              <div className="relative lg:hidden">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                  className="w-40 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] pl-8 pr-3 py-2 text-xs text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500/30" />
              </div>
              {/* View Toggle */}
              <div className="flex rounded-lg border border-gray-200 dark:border-[#2F3336] overflow-hidden bg-white dark:bg-[#16181C]">
                {([['month', Square, 'Mes'], ['week', Columns3, 'Semana'], ['day', Calendar, 'Día']] as const).map(([v, Icon, label]) => (
                  <button key={v} onClick={() => setCalendarView(v)}
                    className={cn('px-3 py-2 text-xs font-bold transition-colors flex items-center gap-1.5',
                      calendarView === v ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]')}>
                    <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* View Container with transition */}
          <div className="relative overflow-hidden lg:rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] flex-1 min-h-0 flex flex-col">

            {/* MONTH VIEW */}
            {calendarView === 'month' && (
              <div className="animate-in fade-in duration-200 flex flex-col flex-1 min-h-0">
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-[#2F3336]">
                  {DIAS_CORTOS.map(d => (
                    <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] py-2.5 border-r border-gray-100 dark:border-[#2F3336] last:border-r-0">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-[#2F3336] flex-1 min-h-0">
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
                        onClick={() => handleDayClick(cellDateStr)}
                        onDragOver={e => handleDragOver(e, cellDateStr)}
                        onDragLeave={() => setDragOverDate(null)}
                        onDrop={e => handleDrop(e, cellDateStr)}
                        className={cn(
                          'p-1.5 cursor-pointer transition-all border-b border-gray-100 dark:border-[#2F3336]',
                          !isCurrentMonth && 'bg-gray-50/50 dark:bg-[#16181C]/50',
                          isToday && 'bg-primary-50/30 dark:bg-primary-900/5',
                          isSelected && 'bg-primary-50/60 dark:bg-primary-900/10 ring-2 ring-inset ring-primary-400',
                          isDragOver && 'bg-primary-100 dark:bg-primary-900/20 ring-2 ring-inset ring-primary-300',
                          'hover:bg-gray-50 dark:hover:bg-[#1D1F23]',
                        )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn('inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold transition-all',
                            isToday ? 'bg-primary-600 text-white' : isCurrentMonth ? 'text-gray-700 dark:text-[#E7E9EA]' : 'text-gray-300 dark:text-[#71767B]',
                            isSelected && !isToday && 'bg-primary-100 dark:bg-primary-900/30 text-primary-700'
                          )}>{dayNum}</span>
                          {dayCx.length > 0 && <span className="text-[9px] font-bold text-gray-400">{dayCx.length}</span>}
                        </div>
                        <div className="space-y-px">
                          {dayCx.slice(0, 3).map(c => (
                            <div key={c.id}
                              draggable={userRol !== 'doctor'}
                              onDragStart={e => handleDragStart(e, c.id)}
                              onClick={e => { e.stopPropagation(); setDetailCirugia(c); setDetailPosition({ x: e.clientX, y: e.clientY }); }}
                              className={cn(
                                'flex items-center gap-1 text-[9px] leading-tight px-1.5 py-[3px] rounded cursor-pointer transition-all',
                                'hover:brightness-95 hover:shadow-sm',
                                draggingId === c.id && 'opacity-40 scale-95',
                                estadoConfig[c.estado].bg, estadoConfig[c.estado].text,
                                'border-l-2', estadoConfig[c.estado].border,
                              )}>
                              <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-30 hidden group-hover:block" />
                              <span className="font-bold shrink-0">{fmtTime(c.hora)}</span>
                              <span className="truncate font-medium">{c.nombre_paciente.split(' ').slice(0, 2).join(' ')}</span>
                            </div>
                          ))}
                          {dayCx.length > 3 && (
                            <button onClick={e => { e.stopPropagation(); handleDayClick(cellDateStr); }}
                              className="text-[9px] font-bold text-primary-600 hover:text-primary-700 pl-1">
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
                <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-gray-200 dark:border-[#2F3336] sticky top-0 bg-white dark:bg-[#16181C] z-10">
                  <div className="border-r border-gray-100 dark:border-[#2F3336]" />
                  {weekDays.map(wd => (
                    <div key={wd.dateStr}
                      onClick={() => { setSelectedDate(wd.dateStr); setCalendarView('day'); }}
                      className={cn('text-center py-2.5 border-r border-gray-100 dark:border-[#2F3336] last:border-r-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors')}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">{wd.dayName}</div>
                      <div className={cn('inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-extrabold mt-0.5',
                        wd.isToday ? 'bg-primary-600 text-white' : 'text-gray-900 dark:text-[#E7E9EA]'
                      )}>{wd.day}</div>
                    </div>
                  ))}
                </div>

                {/* Time Grid */}
                <div ref={timeGridRef} className="flex-1 overflow-y-auto relative" style={{ maxHeight: HOUR_HEIGHT * (HOUR_END - HOUR_START) }}>
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] relative">
                    {/* Hour Labels */}
                    <div className="relative">
                      {hours.map(h => (
                        <div key={h} className="border-r border-gray-100 dark:border-[#2F3336]" style={{ height: HOUR_HEIGHT }}>
                          <span className="absolute -top-2.5 right-2 text-[11px] font-semibold text-gray-400 dark:text-[#71767B]">{fmtHourAMPM(h)}</span>
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
                          className={cn('relative border-r border-gray-100 dark:border-[#2F3336] last:border-r-0',
                            wd.isToday && 'bg-primary-50/20 dark:bg-primary-900/5'
                          )}>
                          {hours.map(h => (
                            <div key={h}
                              onClick={() => userRol !== 'doctor' && handleQuickAdd(wd.dateStr, h)}
                              className={cn('border-b border-gray-100 dark:border-[#2F3336] transition-colors',
                                userRol !== 'doctor' && 'hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer'
                              )} style={{ height: HOUR_HEIGHT }} />
                          ))}

                          {/* Surgery Blocks */}
                          {dayCx.map(c => {
                            if (!c.hora) return null;
                            const startMin = parseTimeToMinutes(c.hora);
                            if (startMin < HOUR_START * 60 || startMin >= HOUR_END * 60) return null;
                            const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                            const durationMin = c.tiempo_estimado ? parseInt(c.tiempo_estimado) * 60 : 60;
                            const height = Math.max(28, (durationMin / 60) * HOUR_HEIGHT - 2);

                            return (
                              <div key={c.id}
                                draggable={userRol !== 'doctor'}
                                onDragStart={e => handleDragStart(e, c.id)}
                              onClick={e => { e.stopPropagation(); setDetailCirugia(c); setDetailPosition({ x: e.clientX, y: e.clientY }); }}
                                className={cn(
                                  'absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 cursor-pointer transition-all z-10',
                                  'hover:brightness-95 hover:shadow-md hover:scale-[1.01]',
                                  draggingId === c.id && 'opacity-40',
                                  estadoConfig[c.estado].bg, estadoConfig[c.estado].text,
                                  'border-l-[3px]', estadoConfig[c.estado].border,
                                )} style={{ top, height }}>
                                <div className="text-[10px] font-extrabold leading-tight truncate">{c.nombre_paciente.split(' ').slice(0, 2).join(' ')}</div>
                                {height > 32 && (
                                  <div className="text-[9px] font-medium opacity-70 truncate">{fmtTime(c.hora)}{c.procedimiento ? ' · ' + c.procedimiento : ''}</div>
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
                          })}

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
                <div className="grid grid-cols-[64px_1fr] border-b border-gray-200 dark:border-[#2F3336] sticky top-0 bg-white dark:bg-[#16181C] z-10">
                  <div className="border-r border-gray-100 dark:border-[#2F3336]" />
                  <div className="text-center py-2">
                    <span className="text-xs font-bold text-gray-400 dark:text-[#71767B]">{DIAS_CORTOS[(dayViewDateObj.getDay() + 6) % 7]}</span>
                    <span className={cn('ml-2 inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-extrabold',
                      dayViewDate === todayStr ? 'bg-primary-600 text-white' : 'text-gray-900 dark:text-[#E7E9EA]'
                    )}>{dayViewDateObj.getDate()}</span>
                  </div>
                </div>

                {/* Time Grid */}
                <div ref={timeGridRef} className="flex-1 overflow-y-auto relative" style={{ maxHeight: HOUR_HEIGHT * (HOUR_END - HOUR_START) }}>
                  <div className="grid grid-cols-[64px_1fr] relative">
                    {/* Hour Labels — sticky so they stay visible while scrolling */}
                    <div className="relative">
                      {hours.map(h => (
                        <div key={h} className="border-r border-gray-100 dark:border-[#2F3336]" style={{ height: HOUR_HEIGHT }}>
                          <span className="absolute -top-2.5 right-2 text-[11px] font-semibold text-gray-400 dark:text-[#71767B]">{fmtHourAMPM(h)}</span>
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
                          onClick={() => userRol !== 'doctor' && handleQuickAdd(dayViewDate, h)}
                          className={cn('border-b border-gray-100 dark:border-[#2F3336] transition-colors',
                            userRol !== 'doctor' && 'hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer'
                          )} style={{ height: HOUR_HEIGHT }} />
                      ))}

                      {/* Surgery Blocks */}
                      {(cirugiasPorFecha[dayViewDate] || []).map(c => {
                        if (!c.hora) return null;
                        const startMin = parseTimeToMinutes(c.hora);
                        if (startMin < HOUR_START * 60 || startMin >= HOUR_END * 60) return null;
                        const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                        const durationMin = c.tiempo_estimado ? parseInt(c.tiempo_estimado) * 60 : 60;
                        const height = Math.max(36, (durationMin / 60) * HOUR_HEIGHT - 2);

                        return (
                          <div key={c.id}
                            draggable={userRol !== 'doctor'}
                            onDragStart={e => handleDragStart(e, c.id)}
                            onClick={e => { e.stopPropagation(); setDetailCirugia(c); setDetailPosition({ x: e.clientX, y: e.clientY }); }}
                            className={cn(
                              'absolute left-1 right-3 rounded-lg px-3 py-2 cursor-pointer transition-all z-10',
                              'hover:brightness-95 hover:shadow-lg hover:scale-[1.005]',
                              draggingId === c.id && 'opacity-40',
                              estadoConfig[c.estado].bg, estadoConfig[c.estado].text,
                              'border-l-[4px]', estadoConfig[c.estado].border,
                              'shadow-sm',
                            )} style={{ top, height }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold truncate">{c.nombre_paciente}</span>
                              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-2 shrink-0', estadoConfig[c.estado].lightBg, estadoConfig[c.estado].text)}>
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
                      })}

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

      {/* Detail Popover Card */}
      {detailCirugia && detailPosition && (
        <DetailPopoverCard
          cirugia={detailCirugia}
          position={detailPosition}
          userRol={userRol}
          onEdit={() => { setDetailCirugia(null); setDetailPosition(null); setEditingId(detailCirugia.id); setShowForm(true); }}
          onClose={() => { setDetailCirugia(null); setDetailPosition(null); }}
          onRefetch={() => { refetch(); setDetailCirugia(null); setDetailPosition(null); }}
        />
      )}

      {/* Sidebar Form */}
      <SidebarPanel isOpen={showForm} onClose={() => { setShowForm(false); setEditingId(null); setQuickAddDate(null); }} title={editingId ? 'Editar Cirugía' : 'Nueva Cirugía'}>
        <CirugiaForm cirugiaId={editingId} doctores={doctores} userRol={userRol} initialDate={quickAddDate} initialHour={quickAddHour} onClose={() => { setShowForm(false); setEditingId(null); setQuickAddDate(null); }} onSaved={() => { setShowForm(false); setEditingId(null); setQuickAddDate(null); refetch(); }} />
      </SidebarPanel>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)}>
        <ImportExcel doctores={doctores} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); refetch(); }} />
      </Modal>
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
    cirugia.ojo && { Icon: Eye, label: 'Ojo', value: cirugia.ojo },
    cirugia.lio && { Icon: () => <div className="h-3 w-3 rounded-full border-2 border-current" />, label: 'LIO', value: cirugia.lio },
    cirugia.marca_lio && { Icon: () => <div className="h-3 w-3 rounded-full border-2 border-current" />, label: 'Marca LIO', value: cirugia.marca_lio },
    cirugia.tiempo_estimado && { Icon: Timer, label: 'Tiempo estimado', value: cirugia.tiempo_estimado },
    cirugia.tiempo_estancia && { Icon: Timer, label: 'Tiempo estancia', value: cirugia.tiempo_estancia },
    cirugia.procedencia && { Icon: Building2, label: 'Procedencia', value: cirugia.procedencia },
  ].filter(Boolean) as Array<{ Icon: React.ComponentType<{ className?: string }>; label: string; value: string }>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center text-sm font-extrabold', estadoConfig[cirugia.estado].bg, estadoConfig[cirugia.estado].text)}>
          {cirugia.hora ? fmtTime(cirugia.hora) : '--:--'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full', estadoConfig[cirugia.estado].lightBg, estadoConfig[cirugia.estado].text)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
              {estadoLabels[cirugia.estado]}
            </span>
            {cirugia.fecha && <span className="text-xs text-gray-500 dark:text-[#71767B]">{fmtDateShort(cirugia.fecha)}</span>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg border border-gray-100 dark:border-[#2F3336] p-3 bg-gray-50/50 dark:bg-[#202327]/50">
            <div className="flex items-center gap-1.5 mb-1">
              <item.Icon className="h-3 w-3 text-gray-400 dark:text-[#71767B]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">{item.label}</span>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{item.value}</p>
          </div>
        ))}
      </div>
      {cirugia.notas && (
        <div className="rounded-lg bg-gray-50 dark:bg-[#202327] border border-gray-100 dark:border-[#2F3336] p-3">
          <div className="flex items-center gap-1.5 mb-1"><StickyNote className="h-3 w-3 text-gray-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Notas</span></div>
          <p className="text-sm text-gray-700 dark:text-[#E7E9EA]">{cirugia.notas}</p>
        </div>
      )}
      {userRol !== 'doctor' && (
        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-[#2F3336]">
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
          <button onClick={onEdit} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── Detail Popover Card (Google Calendar style) ───────── */
function DetailPopoverCard({ cirugia, position, userRol, onEdit, onClose, onRefetch }: {
  cirugia: AgendaCirugia; position: { x: number; y: number }; userRol: string;
  onEdit: () => void; onClose: () => void; onRefetch: () => void;
}) {
  const [updating, setUpdating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

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
    setUpdating(true);
    try {
      await fetch(`/api/agenda/${cirugia.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: s }) });
      onRefetch();
    } finally { setUpdating(false); }
  };

  return (
    <div ref={cardRef}
      className="fixed z-50 w-[340px] rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('h-3 w-3 rounded-full shrink-0', estadoConfig[cirugia.estado].dot)} />
          <h3 className="text-base font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {userRol !== 'doctor' && (
            <button onClick={() => updateEstado('cancelada')} disabled={updating}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors text-gray-400 hover:text-red-500"
              title="Eliminar">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
            </button>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-[#E7E9EA]"
            title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-4 pb-2">
        <p className="text-xs text-gray-500 dark:text-[#71767B]">
          {cirugia.fecha && fmtDate(cirugia.fecha)}
        </p>
      </div>

      {/* Details */}
      <div className="px-4 pb-3 space-y-2">
        {cirugia.jornada && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-[#E7E9EA]">
            <MapPin className="h-4 w-4 text-gray-400 dark:text-[#71767B] shrink-0" />
            <span>{cirugia.jornada}</span>
          </div>
        )}
        {cirugia.procedimiento && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-[#E7E9EA]">
            <Stethoscope className="h-4 w-4 text-gray-400 dark:text-[#71767B] shrink-0" />
            <span>{cirugia.procedimiento}</span>
          </div>
        )}
        {cirugia.doctor_nombre && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-[#E7E9EA]">
            <User className="h-4 w-4 text-gray-400 dark:text-[#71767B] shrink-0" />
            <span>{cirugia.doctor_nombre}</span>
          </div>
        )}
        {cirugia.hora && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-[#E7E9EA]">
            <Clock className="h-4 w-4 text-gray-400 dark:text-[#71767B] shrink-0" />
            <span>{fmtTime(cirugia.hora)}{cirugia.tiempo_estimado ? ` · ${cirugia.tiempo_estimado}` : ''}</span>
          </div>
        )}
        {cirugia.ojo && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-[#E7E9EA]">
            <Eye className="h-4 w-4 text-gray-400 dark:text-[#71767B] shrink-0" />
            <span>{cirugia.ojo}</span>
          </div>
        )}
      </div>

      {/* Status + Actions */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-[#2F3336] flex items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full', estadoConfig[cirugia.estado].lightBg, estadoConfig[cirugia.estado].text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
          {estadoLabels[cirugia.estado]}
        </span>
        <div className="flex-1" />
        {userRol !== 'doctor' && cirugia.estado === 'agendada' && (
          <>
            <button onClick={() => updateEstado('completada')} disabled={updating}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50">
              Completar
            </button>
            <button onClick={() => updateEstado('cancelada')} disabled={updating}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </>
        )}
        <button onClick={onEdit}
          className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
          Editar
        </button>
      </div>
    </div>
  );
}

/* ───────── Quick Add / Form ───────── */
function CirugiaForm({ cirugiaId, doctores, userRol, initialDate, initialHour, onClose, onSaved }: {
  cirugiaId: string | null; doctores: Doctor[]; userRol: string; initialDate?: string | null; initialHour?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre_paciente: '', expediente: '', fecha: initialDate || '', hora: initialHour || '',
    jornada: '', diagnostico: '', procedimiento: '', ojo: '', lio: '', marca_lio: '',
    tiempo_estimado: '', tiempo_estancia: '', doctor_id: '', notas: '', procedencia: '',
  });
  const [loadingCirugia, setLoadingCirugia] = useState(!!cirugiaId);

  useState(() => {
    if (cirugiaId) {
      fetch(`/api/agenda/${cirugiaId}`).then(r => r.json()).then(data => {
        setForm({
          nombre_paciente: data.nombre_paciente || '', expediente: data.expediente || '', fecha: data.fecha || '',
          hora: data.hora?.slice(0, 5) || '', jornada: data.jornada || '', diagnostico: data.diagnostico || '',
          procedimiento: data.procedimiento || '', ojo: data.ojo || '', lio: data.lio || '', marca_lio: data.marca_lio || '',
          tiempo_estimado: data.tiempo_estimado || '', tiempo_estancia: data.tiempo_estancia || '', doctor_id: data.doctor_id || '',
          notas: data.notas || '', procedencia: data.procedencia || '',
        });
        setLoadingCirugia(false);
      });
    }
  });

  const handleSubmit = async () => {
    if (!form.nombre_paciente.trim()) { setError('El nombre del paciente es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        nombre_paciente: form.nombre_paciente.trim(), expediente: form.expediente || null, fecha: form.fecha || null,
        hora: form.hora || null, jornada: form.jornada || null, diagnostico: form.diagnostico || null,
        procedimiento: form.procedimiento || null, ojo: form.ojo || null, lio: form.lio || null,
        marca_lio: form.marca_lio || null, tiempo_estimado: form.tiempo_estimado || null, tiempo_estancia: form.tiempo_estancia || null,
        doctor_id: form.doctor_id || null, notas: form.notas || null, procedencia: form.procedencia || null,
      };
      const url = cirugiaId ? `/api/agenda/${cirugiaId}` : '/api/agenda';
      const res = await fetch(url, { method: cirugiaId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error al guardar'); }
      onSaved();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error desconocido'); } finally { setSaving(false); }
  };

  if (loadingCirugia) return <div className="animate-pulse space-y-4 py-4"><div className="h-8 bg-gray-200 dark:bg-[#202327] rounded" /></div>;

  const inputCls = "w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500";
  const labelCls = "block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1";

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
      {userRol !== 'doctor' && (
        <div><label className={labelCls}>Doctor / Cirujano</label>
          <select value={form.doctor_id} onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value }))} className={cn(inputCls, 'appearance-none')}>
            <option value="">Sin asignar</option>
            {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
          </select>
        </div>
      )}
      <div><label className={labelCls}>Procedimiento</label><input type="text" value={form.procedimiento} onChange={e => setForm(f => ({ ...f, procedimiento: e.target.value }))} placeholder="Ej. FACO + LIO" className={inputCls} /></div>
      <div><label className={labelCls}>Diagnóstico</label><input type="text" value={form.diagnostico} onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))} placeholder="Diagnóstico" className={inputCls} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelCls}>Ojo</label>
          <select value={form.ojo} onChange={e => setForm(f => ({ ...f, ojo: e.target.value }))} className={cn(inputCls, 'appearance-none')}>
            <option value="">—</option><option value="OD">OD</option><option value="OI">OI</option>
          </select>
        </div>
        <div><label className={labelCls}>LIO</label><input type="text" value={form.lio} onChange={e => setForm(f => ({ ...f, lio: e.target.value }))} placeholder="Potencia" className={inputCls} /></div>
        <div><label className={labelCls}>Marca LIO</label><input type="text" value={form.marca_lio} onChange={e => setForm(f => ({ ...f, marca_lio: e.target.value }))} placeholder="Marca" className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Tiempo estimado</label><input type="text" value={form.tiempo_estimado} onChange={e => setForm(f => ({ ...f, tiempo_estimado: e.target.value }))} placeholder="Ej. 1 HR" className={inputCls} /></div>
        <div><label className={labelCls}>Tiempo estancia</label><input type="text" value={form.tiempo_estancia} onChange={e => setForm(f => ({ ...f, tiempo_estancia: e.target.value }))} placeholder="Ej. 3 HR" className={inputCls} /></div>
      </div>
      <div><label className={labelCls}>Notas</label><textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} placeholder="Notas adicionales..." className={cn(inputCls, 'resize-none')} /></div>
      <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-[#2F3336]">
        <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">CANCELAR</button>
        <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50">
          {saving ? 'Guardando...' : cirugiaId ? 'ACTUALIZAR' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}

/* ───────── Import Excel ───────── */
function ImportExcel({ doctores, onClose, onImported }: { doctores: Doctor[]; onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ cirugias: AgendaCirugiaImportRow[]; aplazadas: AgendaCirugiaImportRow[]; totalCirugias: number; totalAplazadas: number; erroresCirugia: number; erroresAplazada: number; doctorNoEncontrado: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ importadas: number; aplazadasImportadas: number; errores: number; doctorNoEncontrado: number } | null>(null);

  const handleUpload = async () => {
    if (!file) return; setLoading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/agenda/import', { method: 'POST', body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      const data = await res.json(); if (data.preview) { setPreview(data); setStep('preview'); }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!file) return; setLoading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('confirmar', 'true');
      const res = await fetch('/api/agenda/import', { method: 'POST', body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      const data = await res.json(); setResult(data); if (data.errores === 0) onImported();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Importar Cirugías desde Excel</h3>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {step === 'upload' && !result && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">Selecciona un archivo Excel (.xlsx) con las hojas &quot;CIRUGIA&quot; y &quot;APLAZADOS&quot;.</p>
          <div className="border-2 border-dashed border-gray-300 dark:border-[#2F3336] rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-400 dark:text-[#71767B] mb-3" />
            <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary-600 file:text-white hover:file:bg-primary-700" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50">Cancelar</button>
            <button onClick={handleUpload} disabled={!file || loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Procesando...' : 'Previsualizar'}</button>
          </div>
        </>
      )}
      {step === 'preview' && preview && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3"><p className="text-xs font-bold text-blue-600 uppercase">Cirugías</p><p className="text-2xl font-extrabold text-blue-800">{preview.totalCirugias}</p></div>
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3"><p className="text-xs font-bold text-yellow-600 uppercase">Aplazadas</p><p className="text-2xl font-extrabold text-yellow-800">{preview.totalAplazadas}</p></div>
          </div>
          {(preview.erroresCirugia > 0 || preview.erroresAplazada > 0) && <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700"><AlertTriangle className="h-4 w-4 inline mr-1" />{preview.erroresCirugia + preview.erroresAplazada} filas con errores serán omitidas</div>}
          {preview.doctorNoEncontrado > 0 && <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700"><AlertTriangle className="h-4 w-4 inline mr-1" />{preview.doctorNoEncontrado} cirugía(s) con cirujano sin match</div>}
          <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 dark:border-[#2F3336] rounded-lg p-2">
            {preview.cirugias.slice(0, 20).map((c, i) => <div key={i} className="text-xs py-1 px-2 rounded bg-gray-50 dark:bg-[#202327] flex justify-between"><span className="font-medium text-gray-900 dark:text-[#E7E9EA]">{c.nombre_paciente}</span><span className="text-gray-500 dark:text-[#71767B]">{c.fecha || 'Sin fecha'}</span></div>)}
            {preview.cirugias.length > 20 && <p className="text-xs text-gray-400 text-center py-1">... y {preview.cirugias.length - 20} más</p>}
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setStep('upload'); setPreview(null); }} className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50">Volver</button>
            <button onClick={handleConfirm} disabled={loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Importando...' : 'Confirmar Importación'}</button>
          </div>
        </>
      )}
      {result && (
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Importación completada</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-green-50 p-2"><span className="font-bold text-green-700">{result.importadas}</span> cirugías</div>
            <div className="rounded bg-yellow-50 p-2"><span className="font-bold text-yellow-700">{result.aplazadasImportadas}</span> aplazadas</div>
            {result.errores > 0 && <div className="rounded bg-red-50 p-2 col-span-2"><span className="font-bold text-red-700">{result.errores}</span> errores</div>}
          </div>
          <button onClick={onImported} className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-bold text-white hover:bg-primary-700">Cerrar</button>
        </div>
      )}
    </div>
  );
}
