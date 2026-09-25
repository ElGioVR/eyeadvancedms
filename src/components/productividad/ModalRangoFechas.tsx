'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarRange, Loader2, Download } from 'lucide-react';
import Modal from '@/components/ui/Modal';

export interface RangoFechas {
  desde: string;
  hasta: string;
}

export interface OpcionDoctor {
  id: string;
  nombre: string;
}

interface ModalRangoFechasProps {
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  descripcion?: string;
  desde?: string;
  hasta?: string;
  cargando?: boolean;
  textoConfirmar?: string;
  doctores?: OpcionDoctor[];
  doctorId?: string;
  onConfirm: (rango: RangoFechas, doctorId?: string) => void;
}

const inputCls =
  'w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

export default function ModalRangoFechas({
  isOpen,
  onClose,
  titulo,
  descripcion,
  desde = '',
  hasta = '',
  cargando = false,
  textoConfirmar = 'Descargar',
  doctores,
  doctorId = '',
  onConfirm,
}: ModalRangoFechasProps) {
  const [fechaDesde, setFechaDesde] = useState(desde);
  const [fechaHasta, setFechaHasta] = useState(hasta);
  const [doctorSel, setDoctorSel] = useState(doctorId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFechaDesde(desde);
    setFechaHasta(hasta);
    setDoctorSel(doctorId);
    setError(null);
  }, [isOpen, desde, hasta, doctorId]);

  const valido = !!fechaDesde && !!fechaHasta && fechaDesde <= fechaHasta;

  const confirmar = () => {
    if (!fechaDesde || !fechaHasta) {
      setError('Selecciona ambas fechas.');
      return;
    }
    if (fechaDesde > fechaHasta) {
      setError('El rango es inválido: "Desde" debe ser anterior a "Hasta".');
      return;
    }
    setError(null);
    onConfirm({ desde: fechaDesde, hasta: fechaHasta }, doctorSel);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="pr-6">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-[#E7E9EA]">
            <CalendarRange className="w-5 h-5 text-primary-600" />
            {titulo}
          </h2>
          {descripcion && <p className="mt-1 text-sm text-gray-500 dark:text-[#71767B]">{descripcion}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {doctores && (
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Doctor</label>
            <select
              value={doctorSel}
              onChange={(e) => setDoctorSel(e.target.value)}
              className={inputCls}
            >
              <option value="">Todos los doctores</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={cargando}
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-[#2F3336] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!valido || cargando}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {cargando ? 'Generando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </Modal>
  );
}
