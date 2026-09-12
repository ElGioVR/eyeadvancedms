'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Plus,
  Upload,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Eye,
  Stethoscope,
  MapPin,
  StickyNote,
  Timer,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch } from '@/hooks/useFetch';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import SidebarPanel from '@/components/ui/SidebarPanel';
import type { AgendaCirugia, AgendaCirugiaEstado, AgendaCirugiaImportRow } from '@/types';

interface Doctor {
  id: string;
  nombre_completo: string;
}

interface Props {
  userRol: string;
  doctores: Doctor[];
}

const estadoConfig: Record<AgendaCirugiaEstado, { bg: string; text: string; dot: string; border: string; lightBg: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-l-blue-500', lightBg: 'bg-blue-500/10' },
  aplazada: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-l-amber-500', lightBg: 'bg-amber-500/10' },
  completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-l-emerald-500', lightBg: 'bg-emerald-500/10' },
  cancelada: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-l-red-500', lightBg: 'bg-red-500/10' },
};

const estadoLabels: Record<AgendaCirugiaEstado, string> = {
  agendada: 'Agendada',
  aplazada: 'Aplazada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const mesesAno = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(d: string): string {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function formatTime(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getDoctorInitials(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

const doctorColors = [
  'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
];

function getDoctorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return doctorColors[Math.abs(hash) % doctorColors.length];
}

export default function AgendaContent({ userRol, doctores }: Props) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailCirugia, setDetailCirugia] = useState<AgendaCirugia | null>(null);

  const detailPanelRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const fechaDesde = selectedDate || `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
  const fechaHasta = selectedDate || `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())).padStart(2, '0')}`;

  const fetchParams: Record<string, string> = { fechaDesde, fechaHasta, pageSize: '200' };
  if (filterDoctor) fetchParams.doctorId = filterDoctor;
  if (filterEstado) fetchParams.estado = filterEstado;
  if (search) fetchParams.search = search;

  const { data: cirugias, loading, refetch } = useFetch<AgendaCirugia>('/api/agenda', fetchParams);

  const cirugiasPorFecha = useMemo(() => {
    const map: Record<string, AgendaCirugia[]> = {};
    for (const c of cirugias) {
      const key = c.fecha || 'sin-fecha';
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    }
    return map;
  }, [cirugias]);

  const selectedDateCirugias = useMemo(() => {
    if (!selectedDate) return [];
    return cirugiasPorFecha[selectedDate] || [];
  }, [selectedDate, cirugiasPorFecha]);

  const stats = useMemo(() => ({
    total: cirugias.length,
    agendadas: cirugias.filter(c => c.estado === 'agendada').length,
    aplazadas: cirugias.filter(c => c.estado === 'aplazada').length,
    completadas: cirugias.filter(c => c.estado === 'completada').length,
    canceladas: cirugias.filter(c => c.estado === 'cancelada').length,
  }), [cirugias]);

  const navigateMonth = useCallback((dir: number) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
    setSelectedDate(null);
  }, []);

  const handleDayClick = useCallback((day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    setDetailCirugia(null);
  }, [currentDate]);

  const handleGoToToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDate(todayStr);
  }, [todayStr]);

  useEffect(() => {
    if (selectedDate && detailPanelRef.current) {
      detailPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedDate]);

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="AGENDA DE CIRUGÍAS"
        subtitle="Gestión y programación de cirugías."
        action={
          <div className="flex gap-3">
            {userRol !== 'doctor' && (
              <>
                <button
                  onClick={() => setShowImport(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Importar
                </button>
                <button
                  onClick={() => { setEditingId(null); setShowForm(true); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nueva Cirugía
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-[#E7E9EA]', icon: Calendar },
          { label: 'Agendadas', value: stats.agendadas, color: 'text-blue-600', icon: Clock },
          { label: 'Aplazadas', value: stats.aplazadas, color: 'text-amber-600', icon: Timer },
          { label: 'Completadas', value: stats.completadas, color: 'text-emerald-600', icon: CheckCircle2 },
          { label: 'Canceladas', value: stats.canceladas, color: 'text-red-600', icon: X },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 flex items-center gap-3">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', s.color.replace('text-', 'bg-').replace('600', '100').replace('900', '100'))}>
              <s.icon className={cn('h-4 w-4', s.color)} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">{s.label}</p>
              <p className={cn('text-xl font-extrabold', s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#71767B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o expediente..."
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <select
          value={filterDoctor}
          onChange={(e) => setFilterDoctor(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option value="">Todos los doctores</option>
          {doctores.map(d => (
            <option key={d.id} value={d.id}>{d.nombre_completo}</option>
          ))}
        </select>

        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option value="">Todos los estados</option>
          {Object.entries(estadoLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-200 dark:border-[#2F3336] overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3 py-2.5 text-sm font-bold transition-colors',
              viewMode === 'list'
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-[#16181C] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]'
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'px-3 py-2.5 text-sm font-bold transition-colors',
              viewMode === 'calendar'
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-[#16181C] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]'
            )}
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-5">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
              </button>
              <div className="flex items-center gap-3">
                <h3 className="text-base font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                  {mesesAno[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <button
                  onClick={handleGoToToday}
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  Hoy
                </button>
              </div>
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-[#2F3336] rounded-lg overflow-hidden">
              {diasSemana.map(d => (
                <div key={d} className="bg-gray-50 dark:bg-[#202327] text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] py-2.5">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-white dark:bg-[#16181C] min-h-[100px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayCirugias = cirugiasPorFecha[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const agendadas = dayCirugias.filter(c => c.estado === 'agendada').length;
                const completadas = dayCirugias.filter(c => c.estado === 'completada').length;

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={cn(
                      'relative bg-white dark:bg-[#16181C] min-h-[100px] p-2 text-left transition-all hover:bg-gray-50 dark:hover:bg-[#1D1F23] group',
                      isSelected && 'ring-2 ring-inset ring-primary-500 bg-primary-50/50 dark:bg-primary-900/10',
                    )}
                  >
                    {/* Day Number */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={cn(
                        'inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors',
                        isToday
                          ? 'bg-primary-600 text-white'
                          : isSelected
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-[#E7E9EA] group-hover:bg-gray-100 dark:group-hover:bg-[#202327]'
                      )}>
                        {day}
                      </span>
                      {dayCirugias.length > 0 && (
                        <span className="text-[9px] font-bold text-gray-400 dark:text-[#71767B]">
                          {dayCirugias.length} cx
                        </span>
                      )}
                    </div>

                    {/* Surgery Pills */}
                    {dayCirugias.length > 0 && (
                      <div className="space-y-0.5">
                        {dayCirugias.slice(0, 4).map(c => (
                          <div
                            key={c.id}
                            onClick={(e) => { e.stopPropagation(); setDetailCirugia(c); }}
                            className={cn(
                              'flex items-center gap-1 text-[9px] leading-tight px-1.5 py-[3px] rounded-md cursor-pointer transition-all hover:scale-[1.02]',
                              estadoConfig[c.estado].bg,
                              estadoConfig[c.estado].text,
                              'border-l-2',
                              estadoConfig[c.estado].border,
                            )}
                          >
                            <span className="font-bold shrink-0">{formatTime(c.hora)}</span>
                            <span className="truncate font-medium">{c.nombre_paciente.split(' ').slice(0, 2).join(' ')}</span>
                          </div>
                        ))}
                        {dayCirugias.length > 4 && (
                          <span className="text-[9px] font-bold text-gray-400 dark:text-[#71767B] pl-1">
                            +{dayCirugias.length - 4} más
                          </span>
                        )}
                      </div>
                    )}

                    {/* Progress Bar */}
                    {dayCirugias.length > 0 && agendadas + completadas > 0 && (
                      <div className="absolute bottom-1.5 left-2 right-2">
                        <div className="h-1 bg-gray-100 dark:bg-[#202327] rounded-full overflow-hidden flex">
                          {completadas > 0 && (
                            <div
                              className="h-full bg-emerald-400 transition-all"
                              style={{ width: `${(completadas / dayCirugias.length) * 100}%` }}
                            />
                          )}
                          {agendadas > 0 && (
                            <div
                              className="h-full bg-blue-400 transition-all"
                              style={{ width: `${(agendadas / dayCirugias.length) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day Detail Panel */}
          {selectedDate && (
            <div ref={detailPanelRef} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#2F3336]">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA] capitalize">
                      {formatDate(selectedDate)}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-[#71767B]">
                      {selectedDateCirugias.length} cirugía{selectedDateCirugias.length !== 1 ? 's' : ''} programada{selectedDateCirugias.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327] transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400 dark:text-[#71767B]" />
                </button>
              </div>

              {selectedDateCirugias.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Calendar className="h-8 w-8 text-gray-300 dark:text-[#71767B] mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-[#71767B]">No hay cirugías programadas para este día</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-[#2F3336]">
                  {selectedDateCirugias.map(c => (
                    <CirugiaDetailRow
                      key={c.id}
                      cirugia={c}
                      userRol={userRol}
                      onEdit={() => { setEditingId(c.id); setShowForm(true); }}
                      onViewDetail={() => setDetailCirugia(c)}
                      onRefetch={refetch}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-[#202327]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-[#202327] rounded w-1/3" />
                      <div className="h-3 bg-gray-200 dark:bg-[#202327] rounded w-1/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : cirugias.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No hay cirugías programadas"
              description="Crea una nueva cirugía o importa desde un archivo Excel"
            />
          ) : (
            Object.entries(cirugiasPorFecha).map(([fecha, items]) => (
              <div key={fecha}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] mb-2 mt-4 px-1">
                  {fecha === 'sin-fecha' ? 'Sin fecha definida' : formatDateShort(fecha)}
                  <span className="ml-2 text-gray-300 dark:text-[#71767B]">· {items.length} cirugía{items.length !== 1 ? 's' : ''}</span>
                </h3>
                <div className="space-y-2">
                  {items.map(c => (
                    <CirugiaCard
                      key={c.id}
                      cirugia={c}
                      userRol={userRol}
                      onEdit={() => { setEditingId(c.id); setShowForm(true); }}
                      onViewDetail={() => setDetailCirugia(c)}
                      onRefetch={refetch}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!detailCirugia} onClose={() => setDetailCirugia(null)} maxWidth="max-w-xl">
        {detailCirugia && (
          <CirugiaDetailModal
            cirugia={detailCirugia}
            userRol={userRol}
            onEdit={() => { setDetailCirugia(null); setEditingId(detailCirugia.id); setShowForm(true); }}
            onClose={() => setDetailCirugia(null)}
            onRefetch={() => { refetch(); setDetailCirugia(null); }}
          />
        )}
      </Modal>

      {/* Manual Form */}
      <SidebarPanel
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        title={editingId ? 'Editar Cirugía' : 'Nueva Cirugía'}
      >
        <CirugiaForm
          cirugiaId={editingId}
          doctores={doctores}
          userRol={userRol}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSaved={() => { setShowForm(false); setEditingId(null); refetch(); }}
        />
      </SidebarPanel>

      {/* Import Excel */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)}>
        <ImportExcel
          doctores={doctores}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      </Modal>
    </div>
  );
}

function CirugiaDetailRow({
  cirugia,
  userRol,
  onEdit,
  onViewDetail,
  onRefetch,
}: {
  cirugia: AgendaCirugia;
  userRol: string;
  onEdit: () => void;
  onViewDetail: () => void;
  onRefetch: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  const updateEstado = async (nuevoEstado: AgendaCirugiaEstado) => {
    setUpdating(true);
    try {
      await fetch(`/api/agenda/${cirugia.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      onRefetch();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors group">
      {/* Time */}
      <div className="flex-shrink-0 w-16 text-center">
        <span className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
          {formatTime(cirugia.hora) || '--:--'}
        </span>
      </div>

      {/* Status Dot */}
      <div className="flex-shrink-0">
        <span className={cn('h-2.5 w-2.5 rounded-full block', estadoConfig[cirugia.estado].dot)} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</span>
          {cirugia.expediente && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-[#71767B]">#{cirugia.expediente}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {cirugia.doctor_nombre && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-[#71767B]">
              <span className={cn('h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white', getDoctorColor(cirugia.doctor_nombre))}>
                {getDoctorInitials(cirugia.doctor_nombre)}
              </span>
              {cirugia.doctor_nombre}
            </span>
          )}
          {cirugia.procedimiento && (
            <span className="text-xs text-gray-400 dark:text-[#71767B]">· {cirugia.procedimiento}</span>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <span className={cn(
        'text-[10px] font-bold px-2 py-0.5 rounded-full',
        estadoConfig[cirugia.estado].lightBg,
        estadoConfig[cirugia.estado].text,
      )}>
        {estadoLabels[cirugia.estado]}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onViewDetail}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#202327] text-gray-400 dark:text-[#71767B] hover:text-gray-600 dark:hover:text-[#E7E9EA] transition-colors"
          title="Ver detalle"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {userRol !== 'doctor' && cirugia.estado === 'agendada' && (
          <>
            <button
              onClick={() => updateEstado('completada')}
              disabled={updating}
              className="p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500 transition-colors disabled:opacity-50"
              title="Marcar completada"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => updateEstado('cancelada')}
              disabled={updating}
              className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors disabled:opacity-50"
              title="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {userRol !== 'doctor' && (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#202327] text-gray-400 dark:text-[#71767B] hover:text-primary-600 transition-colors"
            title="Editar"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function CirugiaDetailModal({
  cirugia,
  userRol,
  onEdit,
  onClose,
  onRefetch,
}: {
  cirugia: AgendaCirugia;
  userRol: string;
  onEdit: () => void;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  const updateEstado = async (nuevoEstado: AgendaCirugiaEstado) => {
    setUpdating(true);
    try {
      await fetch(`/api/agenda/${cirugia.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      onRefetch();
    } finally {
      setUpdating(false);
    }
  };

  const infoItems = [
    cirugia.expediente && { icon: StickyNote, label: 'Expediente', value: cirugia.expediente },
    cirugia.fecha && { icon: Calendar, label: 'Fecha', value: formatDate(cirugia.fecha) },
    cirugia.hora && { icon: Clock, label: 'Hora', value: formatTime(cirugia.hora) },
    cirugia.jornada && { icon: MapPin, label: 'Jornada', value: cirugia.jornada },
    cirugia.doctor_nombre && { icon: User, label: 'Cirujano', value: cirugia.doctor_nombre },
    cirugia.procedimiento && { icon: Stethoscope, label: 'Procedimiento', value: cirugia.procedimiento },
    cirugia.diagnostico && { icon: AlertTriangle, label: 'Diagnóstico', value: cirugia.diagnostico },
    cirugia.ojo && { icon: Eye, label: 'Ojo', value: cirugia.ojo },
    cirugia.lio && { icon: CircleIcon, label: 'LIO', value: cirugia.lio },
    cirugia.marca_lio && { icon: CircleIcon, label: 'Marca LIO', value: cirugia.marca_lio },
    cirugia.tiempo_estimado && { icon: Timer, label: 'Tiempo estimado', value: cirugia.tiempo_estimado },
    cirugia.tiempo_estancia && { icon: Timer, label: 'Tiempo estancia', value: cirugia.tiempo_estancia },
    cirugia.procedencia && { icon: Building2, label: 'Procedencia', value: cirugia.procedencia },
  ].filter(Boolean) as Array<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string }>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={cn(
          'h-12 w-12 rounded-xl flex items-center justify-center text-sm font-extrabold',
          estadoConfig[cirugia.estado].bg,
          estadoConfig[cirugia.estado].text,
        )}>
          {cirugia.hora ? formatTime(cirugia.hora) : '--:--'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              'inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full',
              estadoConfig[cirugia.estado].lightBg,
              estadoConfig[cirugia.estado].text,
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
              {estadoLabels[cirugia.estado]}
            </span>
            {cirugia.fecha && (
              <span className="text-xs text-gray-500 dark:text-[#71767B]">
                {formatDateShort(cirugia.fecha)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        {infoItems.map((item) => (
          <div key={item.label} className={cn(
            'rounded-lg border border-gray-100 dark:border-[#2F3336] p-3',
            'bg-gray-50/50 dark:bg-[#202327]/50'
          )}>
            <div className="flex items-center gap-1.5 mb-1">
              <item.icon className="h-3 w-3 text-gray-400 dark:text-[#71767B]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">{item.label}</span>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Notas */}
      {cirugia.notas && (
        <div className="rounded-lg bg-gray-50 dark:bg-[#202327] border border-gray-100 dark:border-[#2F3336] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <StickyNote className="h-3 w-3 text-gray-400 dark:text-[#71767B]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">Notas</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-[#E7E9EA]">{cirugia.notas}</p>
        </div>
      )}

      {/* Actions */}
      {userRol !== 'doctor' && (
        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-[#2F3336]">
          {cirugia.estado === 'agendada' && (
            <>
              <button
                onClick={() => updateEstado('completada')}
                disabled={updating}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Completar
              </button>
              <button
                onClick={() => updateEstado('cancelada')}
                disabled={updating}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
            </>
          )}
          <button
            onClick={onEdit}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
          >
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

function CircleIcon({ className }: { className?: string }) {
  return <div className={cn('h-3 w-3 rounded-full border-2 border-current', className)} />;
}

function CirugiaCard({
  cirugia,
  userRol,
  onEdit,
  onViewDetail,
  onRefetch,
}: {
  cirugia: AgendaCirugia;
  userRol: string;
  onEdit: () => void;
  onViewDetail: () => void;
  onRefetch: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  const updateEstado = async (nuevoEstado: AgendaCirugiaEstado) => {
    setUpdating(true);
    try {
      await fetch(`/api/agenda/${cirugia.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      onRefetch();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className={cn(
      'group flex items-start gap-4 rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 shadow-sm transition-all hover:shadow-md border-l-4',
      estadoConfig[cirugia.estado].border,
    )}>
      <div className="flex-shrink-0 mt-0.5">
        <div className={cn(
          'h-10 w-10 rounded-lg flex items-center justify-center text-xs font-extrabold',
          estadoConfig[cirugia.estado].bg,
          estadoConfig[cirugia.estado].text,
        )}>
          {cirugia.hora ? formatTime(cirugia.hora) : '--:--'}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</h3>
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', estadoConfig[cirugia.estado].lightBg, estadoConfig[cirugia.estado].text)}>
            {estadoLabels[cirugia.estado]}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-[#71767B]">
          {cirugia.expediente && <span className="font-mono">Exp: {cirugia.expediente}</span>}
          {cirugia.doctor_nombre && (
            <span className="flex items-center gap-1">
              <span className={cn('h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white', getDoctorColor(cirugia.doctor_nombre))}>
                {getDoctorInitials(cirugia.doctor_nombre)}
              </span>
              {cirugia.doctor_nombre}
            </span>
          )}
          {cirugia.procedimiento && <span>{cirugia.procedimiento}</span>}
          {cirugia.ojo && <span>Ojo: {cirugia.ojo}</span>}
        </div>
        {(cirugia.diagnostico || cirugia.notas) && (
          <p className="mt-1 text-xs text-gray-400 dark:text-[#71767B] truncate">
            {cirugia.diagnostico}{cirugia.diagnostico && cirugia.notas ? ' · ' : ''}{cirugia.notas}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {userRol !== 'doctor' && cirugia.estado === 'agendada' && (
          <>
            <button
              onClick={() => updateEstado('completada')}
              disabled={updating}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" />
            </button>
            <button
              onClick={() => updateEstado('cancelada')}
              disabled={updating}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
        <button
          onClick={onViewDetail}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#202327] text-gray-400 dark:text-[#71767B] hover:text-primary-600 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {userRol !== 'doctor' && (
          <button
            onClick={onEdit}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors"
          >
            Editar
          </button>
        )}
      </div>
    </div>
  );
}

function CirugiaForm({
  cirugiaId,
  doctores,
  userRol,
  onClose,
  onSaved,
}: {
  cirugiaId: string | null;
  doctores: Doctor[];
  userRol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre_paciente: '',
    expediente: '',
    fecha: '',
    hora: '',
    jornada: '',
    diagnostico: '',
    procedimiento: '',
    ojo: '',
    lio: '',
    marca_lio: '',
    tiempo_estimado: '',
    tiempo_estancia: '',
    doctor_id: '',
    notas: '',
    procedencia: '',
  });

  const [loadingCirugia, setLoadingCirugia] = useState(!!cirugiaId);

  useState(() => {
    if (cirugiaId) {
      fetch(`/api/agenda/${cirugiaId}`)
        .then(r => r.json())
        .then(data => {
          setForm({
            nombre_paciente: data.nombre_paciente || '',
            expediente: data.expediente || '',
            fecha: data.fecha || '',
            hora: data.hora?.slice(0, 5) || '',
            jornada: data.jornada || '',
            diagnostico: data.diagnostico || '',
            procedimiento: data.procedimiento || '',
            ojo: data.ojo || '',
            lio: data.lio || '',
            marca_lio: data.marca_lio || '',
            tiempo_estimado: data.tiempo_estimado || '',
            tiempo_estancia: data.tiempo_estancia || '',
            doctor_id: data.doctor_id || '',
            notas: data.notas || '',
            procedencia: data.procedencia || '',
          });
          setLoadingCirugia(false);
        });
    }
  });

  const handleSubmit = async () => {
    if (!form.nombre_paciente.trim()) {
      setError('El nombre del paciente es obligatorio');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        nombre_paciente: form.nombre_paciente.trim(),
        expediente: form.expediente || null,
        fecha: form.fecha || null,
        hora: form.hora || null,
        jornada: form.jornada || null,
        diagnostico: form.diagnostico || null,
        procedimiento: form.procedimiento || null,
        ojo: form.ojo || null,
        lio: form.lio || null,
        marca_lio: form.marca_lio || null,
        tiempo_estimado: form.tiempo_estimado || null,
        tiempo_estancia: form.tiempo_estancia || null,
        doctor_id: form.doctor_id || null,
        notas: form.notas || null,
        procedencia: form.procedencia || null,
      };

      const url = cirugiaId ? `/api/agenda/${cirugiaId}` : '/api/agenda';
      const method = cirugiaId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar');
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (loadingCirugia) {
    return <div className="animate-pulse space-y-4 py-4"><div className="h-8 bg-gray-200 dark:bg-[#202327] rounded" /></div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">
          Nombre del paciente <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.nombre_paciente}
          onChange={(e) => setForm(f => ({ ...f, nombre_paciente: e.target.value }))}
          placeholder="Nombre completo"
          className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Expediente</label>
          <input
            type="text"
            value={form.expediente}
            onChange={(e) => setForm(f => ({ ...f, expediente: e.target.value }))}
            placeholder="Núm. expediente"
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Fecha</label>
          <input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Hora</label>
          <input
            type="time"
            value={form.hora}
            onChange={(e) => setForm(f => ({ ...f, hora: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Jornada</label>
          <input
            type="text"
            value={form.jornada}
            onChange={(e) => setForm(f => ({ ...f, jornada: e.target.value }))}
            placeholder="Ej. TIJUANA"
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>

      {userRol !== 'doctor' && (
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Doctor / Cirujano</label>
          <select
            value={form.doctor_id}
            onChange={(e) => setForm(f => ({ ...f, doctor_id: e.target.value }))}
            className="w-full appearance-none rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="">Sin asignar</option>
            {doctores.map(d => (
              <option key={d.id} value={d.id}>{d.nombre_completo}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Procedimiento</label>
        <input
          type="text"
          value={form.procedimiento}
          onChange={(e) => setForm(f => ({ ...f, procedimiento: e.target.value }))}
          placeholder="Ej. FACO + LIO"
          className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Diagnóstico</label>
        <input
          type="text"
          value={form.diagnostico}
          onChange={(e) => setForm(f => ({ ...f, diagnostico: e.target.value }))}
          placeholder="Diagnóstico"
          className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Ojo</label>
          <select
            value={form.ojo}
            onChange={(e) => setForm(f => ({ ...f, ojo: e.target.value }))}
            className="w-full appearance-none rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="">—</option>
            <option value="OD">OD (Derecho)</option>
            <option value="OI">OI (Izquierdo)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">LIO</label>
          <input
            type="text"
            value={form.lio}
            onChange={(e) => setForm(f => ({ ...f, lio: e.target.value }))}
            placeholder="Potencia"
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Marca LIO</label>
          <input
            type="text"
            value={form.marca_lio}
            onChange={(e) => setForm(f => ({ ...f, marca_lio: e.target.value }))}
            placeholder="Marca"
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Tiempo estimado</label>
          <input
            type="text"
            value={form.tiempo_estimado}
            onChange={(e) => setForm(f => ({ ...f, tiempo_estimado: e.target.value }))}
            placeholder="Ej. 1 HR"
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Tiempo estancia</label>
          <input
            type="text"
            value={form.tiempo_estancia}
            onChange={(e) => setForm(f => ({ ...f, tiempo_estancia: e.target.value }))}
            placeholder="Ej. 3 HR"
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] mb-1">Notas</label>
        <textarea
          value={form.notas}
          onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
          rows={3}
          placeholder="Notas adicionales..."
          className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-[#2F3336]">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
        >
          CANCELAR
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : cirugiaId ? 'ACTUALIZAR' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}

function ImportExcel({
  doctores,
  onClose,
  onImported,
}: {
  doctores: Doctor[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    cirugias: AgendaCirugiaImportRow[];
    aplazadas: AgendaCirugiaImportRow[];
    totalCirugias: number;
    totalAplazadas: number;
    erroresCirugia: number;
    erroresAplazada: number;
    doctorNoEncontrado: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    importadas: number;
    aplazadasImportadas: number;
    errores: number;
    doctorNoEncontrado: number;
  } | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/agenda/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al procesar archivo');
      }

      const data = await res.json();
      if (data.preview) {
        setPreview(data);
        setStep('preview');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('confirmar', 'true');

      const res = await fetch('/api/agenda/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al importar');
      }

      const data = await res.json();
      setResult(data);
      if (data.errores === 0) {
        onImported();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Importar Cirugías desde Excel</h3>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'upload' && !result && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Selecciona un archivo Excel (.xlsx) con las hojas &quot;CIRUGIA&quot; y &quot;APLAZADOS&quot;.
          </p>
          <div className="border-2 border-dashed border-gray-300 dark:border-[#2F3336] rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-400 dark:text-[#71767B] mb-3" />
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary-600 file:text-white hover:file:bg-primary-700"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Previsualizar'}
            </button>
          </div>
        </>
      )}

      {step === 'preview' && preview && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs font-bold text-blue-600 uppercase">Cirugías</p>
              <p className="text-2xl font-extrabold text-blue-800">{preview.totalCirugias}</p>
            </div>
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-xs font-bold text-yellow-600 uppercase">Aplazadas</p>
              <p className="text-2xl font-extrabold text-yellow-800">{preview.totalAplazadas}</p>
            </div>
          </div>

          {(preview.erroresCirugia > 0 || preview.erroresAplazada > 0) && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {preview.erroresCirugia + preview.erroresAplazada} filas con errores serán omitidas
            </div>
          )}

          {preview.doctorNoEncontrado > 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {preview.doctorNoEncontrado} cirugía(s) con cirujano sin match en doctores existentes
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 dark:border-[#2F3336] rounded-lg p-2">
            {preview.cirugias.slice(0, 20).map((c, i) => (
              <div key={i} className="text-xs py-1 px-2 rounded bg-gray-50 dark:bg-[#202327] flex justify-between">
                <span className="font-medium text-gray-900 dark:text-[#E7E9EA]">{c.nombre_paciente}</span>
                <span className="text-gray-500 dark:text-[#71767B]">{c.fecha || 'Sin fecha'}</span>
              </div>
            ))}
            {preview.cirugias.length > 20 && (
              <p className="text-xs text-gray-400 text-center py-1">... y {preview.cirugias.length - 20} más</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setStep('upload'); setPreview(null); }}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
            >
              Volver
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Importando...' : 'Confirmar Importación'}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Importación completada</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-green-50 p-2">
              <span className="font-bold text-green-700">{result.importadas}</span> cirugías
            </div>
            <div className="rounded bg-yellow-50 p-2">
              <span className="font-bold text-yellow-700">{result.aplazadasImportadas}</span> aplazadas
            </div>
            {result.errores > 0 && (
              <div className="rounded bg-red-50 p-2 col-span-2">
                <span className="font-bold text-red-700">{result.errores}</span> errores
              </div>
            )}
          </div>
          <button
            onClick={onImported}
            className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-bold text-white hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
