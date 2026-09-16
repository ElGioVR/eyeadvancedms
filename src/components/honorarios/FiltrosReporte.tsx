'use client';

import { useState, useCallback } from 'react';
import { Calendar, Search, X } from 'lucide-react';

interface FiltrosReporteProps {
  onFilter: (filtros: { fecha_desde?: string; fecha_hasta?: string; doctor_id?: string }) => void;
  showDoctor?: boolean;
  doctores?: Array<{ id: string; nombre: string }>;
  loading?: boolean;
}

const PRESETS = [
  { label: 'Hoy', value: 'hoy' },
  { label: 'Semana', value: 'semana' },
  { label: 'Mes actual', value: 'mes_actual' },
  { label: 'Mes anterior', value: 'mes_anterior' },
  { label: 'Año', value: 'anio' },
  { label: 'Últimos 30 días', value: '30_dias' },
  { label: 'Libre', value: 'libre' },
];

function getPresetRange(preset: string): { fecha_desde: string; fecha_hasta: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  switch (preset) {
    case 'hoy':
      return { fecha_desde: fmt(today), fecha_hasta: fmt(today) };
    case 'semana': {
      const monday = new Date(today);
      monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { fecha_desde: fmt(monday), fecha_hasta: fmt(sunday) };
    }
    case 'mes_actual':
      return { fecha_desde: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), fecha_hasta: fmt(today) };
    case 'mes_anterior': {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { fecha_desde: fmt(prev), fecha_hasta: fmt(lastDay) };
    }
    case 'anio':
      return { fecha_desde: `${today.getFullYear()}-01-01`, fecha_hasta: fmt(today) };
    case '30_dias': {
      const hace30 = new Date(today);
      hace30.setDate(today.getDate() - 30);
      return { fecha_desde: fmt(hace30), fecha_hasta: fmt(today) };
    }
    default:
      return { fecha_desde: '', fecha_hasta: '' };
  }
}

export default function FiltrosReporte({ onFilter, showDoctor, doctores, loading }: FiltrosReporteProps) {
  const [preset, setPreset] = useState('mes_actual');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [doctorId, setDoctorId] = useState('');

  const applyPreset = useCallback((p: string) => {
    setPreset(p);
    if (p !== 'libre') {
      const range = getPresetRange(p);
      setFechaDesde(range.fecha_desde);
      setFechaHasta(range.fecha_hasta);
      onFilter({ fecha_desde: range.fecha_desde, fecha_hasta: range.fecha_hasta, doctor_id: doctorId || undefined });
    }
  }, [doctorId, onFilter]);

  const handleCustomDate = useCallback(() => {
    onFilter({ fecha_desde: fechaDesde || undefined, fecha_hasta: fechaHasta || undefined, doctor_id: doctorId || undefined });
  }, [fechaDesde, fechaHasta, doctorId, onFilter]);

  const handleDoctorChange = useCallback((id: string) => {
    setDoctorId(id);
    const fd = preset !== 'libre' ? getPresetRange(preset).fecha_desde : fechaDesde;
    const fh = preset !== 'libre' ? getPresetRange(preset).fecha_hasta : fechaHasta;
    onFilter({ fecha_desde: fd || undefined, fecha_hasta: fh || undefined, doctor_id: id || undefined });
  }, [preset, fechaDesde, fechaHasta, onFilter]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => applyPreset(p.value)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              preset === p.value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-[#202327] text-gray-600 dark:text-[#71767B] hover:bg-gray-200 dark:hover:bg-[#2F3336]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'libre' && (
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} onBlur={handleCustomDate}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} onBlur={handleCustomDate}
              className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
          </div>
        </div>
      )}

      {showDoctor && doctores && (
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 text-gray-400" />
          <select value={doctorId} onChange={(e) => handleDoctorChange(e.target.value)}
            className="flex-1 max-w-xs rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
            <option value="">Todos los doctores</option>
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
          {doctorId && (
            <button onClick={() => handleDoctorChange('')} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
