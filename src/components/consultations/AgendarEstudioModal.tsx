'use client';

import { useState, useEffect, useRef } from 'react';
import { enviarJSON, mensajeDeError, nuevaClaveIdempotencia } from '@/lib/fetcher';
import { Calendar, Clock, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useInvalidar } from '@/hooks/useFetch';

interface AgendarEstudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: (consultaId: string) => void;
  estudio: {
    nombre: string;
    doctor_id?: string | null;
    doctor_nombre?: string | null;
  };
  consulta: {
    id: string;
    paciente_id: string;
    paciente: string;
    doctor_id: string;
    doctor: string;
    aseguranza_id?: string | null;
  };
}

export default function AgendarEstudioModal({ isOpen, onClose, onScheduled, estudio, consulta }: AgendarEstudioModalProps) {
  const invalidar = useInvalidar();
  const { toast } = useToast();
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [loading, setLoading] = useState(false);
  /** Misma clave en reintentos → no se agenda dos veces el mismo estudio. */
  const claveRef = useRef<string | null>(null);
  const [minDate, setMinDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      setFecha(today.toISOString().split('T')[0]);
      setMinDate(today.toISOString().split('T')[0]);
      setHora('09:00');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (loading) return;
    if (!fecha || !hora) {
      toast('Seleccione fecha y hora', 'error');
      return;
    }

    setLoading(true);
    try {
      if (!claveRef.current) claveRef.current = nuevaClaveIdempotencia();
      const resData = await enviarJSON<{ id?: string }>('/api/consultas', 'POST', {
          paciente_id: consulta.paciente_id,
          doctor_id: estudio.doctor_id || consulta.doctor_id,
          fecha,
          hora_inicio: hora,
          tipo_consulta: 'Estudio',
          tipo_visita: 'PRIMERA_VEZ',
          aseguranza_id: consulta.aseguranza_id,
          consulta_origen_id: consulta.id,
          estudios: [{
            nombre: estudio.nombre,
            doctor_id: estudio.doctor_id || null,
          }],
          diagnostico: `Estudio derivado de consulta ${consulta.id.slice(0, 8)}`,
      }, { idempotencia: claveRef.current });
      claveRef.current = null;
      const nuevaConsultaId = resData?.id;

      // Registrar historial en la consulta original (best-effort: el estudio ya quedó agendado)
      await enviarJSON(`/api/consultas/${consulta.id}/historial`, 'POST', {
          tipo_evento: 'EDICION',
          payload: {
            accion: 'estudio_agendado',
            estudio_nombre: estudio.nombre,
            nueva_consulta_id: nuevaConsultaId || null,
            fecha_estudio: fecha,
            hora_estudio: hora,
            asignado_a: estudio.doctor_nombre || consulta.doctor,
          },
      }).catch(() => undefined);

      if (nuevaConsultaId) onScheduled?.(nuevaConsultaId);
      toast('Estudio agendado correctamente', 'success');
      onClose();
      // Solo se revalidan los datos afectados (agenda, listas, resúmenes); sin recargar la ruta.
      void invalidar('/api/consultas', '/api/agenda', '/api/dashboard');
    } catch (error) {
      toast(mensajeDeError(error, 'Error al agendar estudio'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-fg">
            Agendar Estudio
          </h2>
          <p className="text-sm text-muted">
            Programe una cita para el estudio
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface-2 p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Estudio
          </span>
          <p className="mt-1 text-sm font-medium text-fg">
            {estudio.nombre}
          </p>
          {estudio.doctor_nombre && (
            <p className="text-xs text-muted">
              Dr. {estudio.doctor_nombre}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface-2 p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Paciente
          </span>
          <p className="mt-1 text-sm font-medium text-fg">
            {consulta.paciente}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Fecha
            </label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={minDate}
                className="w-full rounded-lg border border-line bg-white dark:bg-surface-2 pl-10 pr-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Hora
            </label>
            <div className="relative mt-1">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full rounded-lg border border-line bg-white dark:bg-surface-2 pl-10 pr-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-line bg-white dark:bg-surface-2 px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-gray-50 dark:hover:bg-surface-3 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !fecha || !hora}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4" />
            )}
            Agendar
          </button>
        </div>
      </div>
    </Modal>
  );
}
