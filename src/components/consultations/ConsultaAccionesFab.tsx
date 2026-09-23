'use client';

import { useState } from 'react';
import { CalendarClock, CalendarPlus, CalendarX2, X, Loader2, Plus, Clock } from 'lucide-react';
import Modal from '@/components/ui/Modal';

type Accion = 'aplazar' | 'reagendar' | 'cancelar';

interface ConsultaAccionesFabProps {
  consultaId: string;
  fecha: string;
  horaInicio: string;
  horaFin?: string | null;
  visible?: boolean;
  onDone: () => void;
}

const opciones: { accion: Accion; label: string; icon: typeof CalendarClock; color: string }[] = [
  { accion: 'aplazar', label: 'Aplazar', icon: CalendarClock, color: 'bg-amber-500 hover:bg-amber-600' },
  { accion: 'reagendar', label: 'Reagendar', icon: CalendarPlus, color: 'bg-sky-600 hover:bg-sky-700' },
  { accion: 'cancelar', label: 'Cancelar', icon: CalendarX2, color: 'bg-red-600 hover:bg-red-700' },
];

const titulos: Record<Accion, string> = {
  aplazar: 'Aplazar consulta',
  reagendar: 'Reagendar consulta',
  cancelar: 'Cancelar consulta',
};

const confirmLabels: Record<Accion, string> = {
  aplazar: 'Aplazar',
  reagendar: 'Reagendar',
  cancelar: 'Cancelar consulta',
};

export default function ConsultaAccionesFab({
  consultaId,
  fecha,
  horaInicio,
  horaFin,
  visible = true,
  onDone,
}: ConsultaAccionesFabProps) {
  const [open, setOpen] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [motivo, setMotivo] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState(fecha);
  const [nuevaHora, setNuevaHora] = useState(horaInicio.slice(0, 5));
  const [nuevaHoraFin, setNuevaHoraFin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  function abrir(a: Accion) {
    setAccion(a);
    setMotivo('');
    setNuevaFecha(fecha);
    setNuevaHora(horaInicio.slice(0, 5));
    setNuevaHoraFin(horaFin ? horaFin.slice(0, 5) : '');
    setError(null);
    setOpen(false);
  }

  function cerrar() {
    if (saving) return;
    setAccion(null);
    setError(null);
  }

  async function confirmar() {
    if (!accion) return;
    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) {
      setError('El motivo es obligatorio');
      return;
    }
    if (accion === 'reagendar' && (!nuevaFecha || !nuevaHora)) {
      setError('Selecciona fecha y hora nueva');
      return;
    }
    if (accion === 'aplazar' && !nuevaHora) {
      setError('Selecciona la nueva hora del día');
      return;
    }
    if (accion === 'aplazar' && nuevaHoraFin && nuevaHoraFin <= nuevaHora) {
      setError('La hora fin debe ser posterior a la hora de inicio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { accion, motivo: motivoLimpio };
      if (accion === 'reagendar') {
        payload.fecha = nuevaFecha;
        payload.hora_inicio = nuevaHora;
      }
      if (accion === 'aplazar') {
        payload.hora_inicio = nuevaHora;
        if (nuevaHoraFin) payload.hora_fin = nuevaHoraFin;
      }
      const res = await fetch(`/api/consultas/${consultaId}/acciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al aplicar la acción');
      }
      setAccion(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar la acción');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-3 no-print">
        {open && (
          <div className="flex flex-col items-end gap-2">
            {opciones.map(({ accion: a, label, icon: Icon, color }) => (
              <button
                key={a}
                type="button"
                onClick={() => abrir(a)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-colors ${color}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Acciones de consulta"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-xl transition-colors hover:bg-primary-700"
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>

      <Modal isOpen={!!accion} onClose={cerrar}>
        {accion && (
          <div className="space-y-4">
            <h2 className="pr-8 text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">
              {titulos[accion]}
            </h2>

            {accion === 'reagendar' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Nueva fecha</span>
                  <input
                    type="date"
                    value={nuevaFecha}
                    onChange={(e) => setNuevaFecha(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#1D1F23] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] focus:border-primary-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Nueva hora</span>
                  <input
                    type="time"
                    value={nuevaHora}
                    onChange={(e) => setNuevaHora(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#1D1F23] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] focus:border-primary-500 focus:outline-none"
                  />
                </label>
              </div>
            )}

            {accion === 'aplazar' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
                    Nueva hora inicio <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="time"
                    value={nuevaHora}
                    onChange={(e) => setNuevaHora(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#1D1F23] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] focus:border-primary-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Hora fin</span>
                  <input
                    type="time"
                    value={nuevaHoraFin}
                    onChange={(e) => setNuevaHoraFin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#1D1F23] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] focus:border-primary-500 focus:outline-none"
                  />
                </label>
              </div>
            )}

            {(accion === 'aplazar' || accion === 'reagendar') && (
              <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-[#1D1F23] px-3 py-2 text-xs text-gray-600 dark:text-[#71767B]">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Actual: {fecha} {horaInicio.slice(0, 5)}{horaFin ? `–${horaFin.slice(0, 5)}` : ''}
                  {accion === 'aplazar' && nuevaHora && nuevaHora !== horaInicio.slice(0, 5) && (
                    <> → {fecha} {nuevaHora}{nuevaHoraFin ? `–${nuevaHoraFin}` : ''}</>
                  )}
                </span>
              </div>
            )}

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
                Motivo <span className="text-red-500">*</span>
              </span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Describe el motivo (obligatorio)"
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#1D1F23] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] focus:border-primary-500 focus:outline-none"
              />
            </label>

            {error && <p className="text-xs font-bold text-red-600">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={cerrar}
                disabled={saving}
                className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={saving}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-50 ${
                  accion === 'cancelar'
                    ? 'bg-red-600 hover:bg-red-700'
                    : accion === 'aplazar'
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmLabels[accion]}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
