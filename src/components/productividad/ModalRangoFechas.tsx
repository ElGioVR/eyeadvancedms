'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarRange, Loader2, Download } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { FORMATOS_DESCARGA, type FormatoDescarga } from '@/lib/exportar-reporte';
import type { OpcionEstatusReporte } from '@/lib/reportes-estatus';

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
  /** Si se pasa, se pregunta el formato (CSV / Excel / PDF). */
  conFormato?: boolean;
  /** Formato marcado al abrir (por defecto CSV). */
  formatoInicial?: FormatoDescarga;
  /** Si se pasa, muestra un switch por estatus (todos activos al abrir). */
  estatusOpciones?: OpcionEstatusReporte[];
  onConfirm: (rango: RangoFechas, doctorId?: string, formato?: FormatoDescarga, estatus?: string[]) => void;
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

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
  conFormato = false,
  formatoInicial = 'csv',
  estatusOpciones,
  onConfirm,
}: ModalRangoFechasProps) {
  const [fechaDesde, setFechaDesde] = useState(desde);
  const [fechaHasta, setFechaHasta] = useState(hasta);
  const [doctorSel, setDoctorSel] = useState(doctorId);
  const [formato, setFormato] = useState<FormatoDescarga>(formatoInicial);
  const [error, setError] = useState<string | null>(null);
  const [estatusSel, setEstatusSel] = useState<string[]>(() => estatusOpciones?.map((o) => o.id) ?? []);

  useEffect(() => {
    if (!isOpen) return;
    setFechaDesde(desde);
    setFechaHasta(hasta);
    setDoctorSel(doctorId);
    setFormato(formatoInicial);
    setEstatusSel(estatusOpciones?.map((o) => o.id) ?? []);
    setError(null);
  }, [isOpen, desde, hasta, doctorId, formatoInicial, estatusOpciones]);

  const valido = !!fechaDesde && !!fechaHasta && fechaDesde <= fechaHasta && (!estatusOpciones || estatusSel.length > 0);

  const confirmar = () => {
    if (!fechaDesde || !fechaHasta) {
      setError('Selecciona ambas fechas.');
      return;
    }
    if (fechaDesde > fechaHasta) {
      setError('El rango es inválido: "Desde" debe ser anterior a "Hasta".');
      return;
    }
    if (estatusOpciones && estatusSel.length === 0) {
      setError('Activa al menos un estatus.');
      return;
    }
    setError(null);
    onConfirm(
      { desde: fechaDesde, hasta: fechaHasta },
      doctorSel,
      conFormato ? formato : undefined,
      estatusOpciones ? estatusSel : undefined
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="pr-6">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-fg">
            <CalendarRange className="w-5 h-5 text-primary-600" />
            {titulo}
          </h2>
          {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
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

        {conFormato && (
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Formato</label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Formato de descarga">
              {FORMATOS_DESCARGA.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={formato === f.id}
                  onClick={() => setFormato(f.id)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-bold transition-colors',
                    formato === f.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                      : 'border-line bg-surface-2 text-fg-2 hover:border-gray-300 dark:hover:border-line-strong'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {estatusOpciones && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Estatus a incluir</span>
              <button
                type="button"
                onClick={() => setEstatusSel(estatusSel.length === estatusOpciones.length ? [] : estatusOpciones.map((o) => o.id))}
                className="text-[11px] font-semibold text-primary-600 hover:underline"
              >
                {estatusSel.length === estatusOpciones.length ? 'Ninguno' : 'Todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {estatusOpciones.map((o) => {
                const activo = estatusSel.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    onClick={() => setEstatusSel((prev) => (activo ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      activo
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                        : 'border-line bg-surface-2 text-muted'
                    )}
                  >
                    <span>{o.label}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                        activo ? 'bg-primary-600' : 'bg-gray-300 dark:bg-line-strong'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                          activo ? 'translate-x-[18px]' : 'translate-x-0.5'
                        )}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
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
            className="px-4 py-2 text-sm font-medium border border-line rounded-lg hover:bg-surface-2 disabled:opacity-50"
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
