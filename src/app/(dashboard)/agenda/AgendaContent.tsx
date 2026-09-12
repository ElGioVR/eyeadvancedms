'use client';

import { useState, useMemo, useCallback } from 'react';
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

const estadoColors: Record<AgendaCirugiaEstado, string> = {
  agendada: 'bg-blue-100 text-blue-800 border-blue-200',
  aplazada: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  completada: 'bg-green-100 text-green-800 border-green-200',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
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
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
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

export default function AgendaContent({ userRol, doctores }: Props) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
  }, [currentDate]);

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
                  Importar Excel
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
          { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-[#E7E9EA]' },
          { label: 'Agendadas', value: stats.agendadas, color: 'text-blue-600' },
          { label: 'Aplazadas', value: stats.aplazadas, color: 'text-yellow-600' },
          { label: 'Completadas', value: stats.completadas, color: 'text-green-600' },
          { label: 'Canceladas', value: stats.canceladas, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">{s.label}</p>
            <p className={cn('text-2xl font-extrabold mt-0.5', s.color)}>{s.value}</p>
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
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327]">
              <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
            </button>
            <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
              {mesesAno[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#202327]">
              <ChevronRight className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {diasSemana.map(d => (
              <div key={d} className="text-center text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B] py-2">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayCirugias = cirugiasPorFecha[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'relative min-h-[60px] rounded-lg p-1.5 text-left transition-all border',
                    isSelected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : isToday
                        ? 'border-primary-300 bg-primary-25'
                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-[#202327]'
                  )}
                >
                  <span className={cn(
                    'text-xs font-bold',
                    isToday ? 'text-primary-600' : 'text-gray-700 dark:text-[#E7E9EA]'
                  )}>
                    {day}
                  </span>
                  {dayCirugias.length > 0 && (
                    <div className="mt-0.5 space-y-0.5">
                      {dayCirugias.slice(0, 3).map(c => (
                        <div
                          key={c.id}
                          className={cn(
                            'text-[8px] leading-tight px-1 py-0.5 rounded truncate font-medium',
                            c.estado === 'agendada' ? 'bg-blue-100 text-blue-700' :
                            c.estado === 'aplazada' ? 'bg-yellow-100 text-yellow-700' :
                            c.estado === 'completada' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          )}
                        >
                          {formatTime(c.hora)} {c.nombre_paciente.split(' ').slice(0, 2).join(' ')}
                        </div>
                      ))}
                      {dayCirugias.length > 3 && (
                        <span className="text-[8px] text-gray-400">+{dayCirugias.length - 3} más</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
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
                  {fecha === 'sin-fecha' ? 'Sin fecha definida' : formatDate(fecha)}
                </h3>
                <div className="space-y-2">
                  {items.map(c => (
                    <CirugiaCard
                      key={c.id}
                      cirugia={c}
                      userRol={userRol}
                      onEdit={() => { setEditingId(c.id); setShowForm(true); }}
                      onRefetch={refetch}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

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

function CirugiaCard({
  cirugia,
  userRol,
  onEdit,
  onRefetch,
}: {
  cirugia: AgendaCirugia;
  userRol: string;
  onEdit: () => void;
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
    <div className="group flex items-start gap-4 rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 shadow-sm transition-all hover:shadow-md">
      <div className="flex-shrink-0 mt-0.5">
        <div className={cn(
          'h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold',
          cirugia.estado === 'agendada' ? 'bg-blue-100 text-blue-700' :
          cirugia.estado === 'aplazada' ? 'bg-yellow-100 text-yellow-700' :
          cirugia.estado === 'completada' ? 'bg-green-100 text-green-700' :
          'bg-red-100 text-red-700'
        )}>
          {cirugia.hora ? formatTime(cirugia.hora) : '--:--'}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{cirugia.nombre_paciente}</h3>
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', estadoColors[cirugia.estado])}>
            {estadoLabels[cirugia.estado]}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-[#71767B]">
          {cirugia.expediente && <span>Exp: {cirugia.expediente}</span>}
          {cirugia.doctor_nombre && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
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
              className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[11px] font-bold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
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
