'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const { toast } = useToast();
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [loading, setLoading] = useState(false);
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
    if (!fecha || !hora) {
      toast('Seleccione fecha y hora', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/consultas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al agendar estudio');
      }

      const resData = await res.json();
      const nuevaConsultaId = resData.id;

      // Registrar historial en la consulta original
      await fetch(`/api/consultas/${consulta.id}/historial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_evento: 'EDICION',
          payload: {
            accion: 'estudio_agendado',
            estudio_nombre: estudio.nombre,
            nueva_consulta_id: nuevaConsultaId || null,
            fecha_estudio: fecha,
            hora_estudio: hora,
            asignado_a: estudio.doctor_nombre || consulta.doctor,
          },
        }),
      });

      if (nuevaConsultaId) onScheduled?.(nuevaConsultaId);
      toast('Estudio agendado correctamente', 'success');
      onClose();
      router.refresh();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Error al agendar estudio',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">
            Agendar Estudio
          </h2>
          <p className="text-sm text-gray-500 dark:text-[#71767B]">
            Programe una cita para el estudio
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
            Estudio
          </span>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">
            {estudio.nombre}
          </p>
          {estudio.doctor_nombre && (
            <p className="text-xs text-gray-500 dark:text-[#71767B]">
              Dr. {estudio.doctor_nombre}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
            Paciente
          </span>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">
            {consulta.paciente}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
              Fecha
            </label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={minDate}
                className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] pl-10 pr-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">
              Hora
            </label>
            <div className="relative mt-1">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] pl-10 pr-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#1D1F23] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#25282C] transition-colors disabled:opacity-50"
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
