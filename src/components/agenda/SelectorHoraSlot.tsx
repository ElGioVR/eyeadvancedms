'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import FormField from '@/components/ui/FormField';
import {
  DURACION_CITA_MIN,
  generarSlots,
  slotOcupado,
  type RangoOcupado,
} from '@/lib/agenda-slots';

export interface DisponibilidadResponse {
  fecha: string;
  medico_id: string;
  ocupados: (RangoOcupado & { tipo: string; entidad_id: string })[];
}

interface SelectorHoraSlotProps {
  label?: string;
  medicoId: string | null | undefined;
  fecha: string | null | undefined;
  value: string;
  onChange: (hora: string) => void;
  /** Duración de la cita a colocar (min). Por defecto 15. */
  duracion?: number;
  /** Id de la cita que se está moviendo (no cuenta como ocupada). */
  excluirId?: string;
  required?: boolean;
  className?: string;
}

/**
 * Selector de hora en intervalos de 15 min. Consulta la disponibilidad del
 * médico y deshabilita los horarios ya ocupados (regla: sin citas empalmadas
 * para el mismo médico). El servidor vuelve a validar al guardar (409).
 */
export default function SelectorHoraSlot({
  label = 'Hora',
  medicoId,
  fecha,
  value,
  onChange,
  duracion = DURACION_CITA_MIN,
  excluirId,
  required,
  className,
}: SelectorHoraSlotProps) {
  const key =
    medicoId && fecha
      ? `/api/agenda/disponibilidad?medico_id=${encodeURIComponent(medicoId)}&fecha=${encodeURIComponent(fecha)}${
          excluirId ? `&excluir_id=${encodeURIComponent(excluirId)}` : ''
        }`
      : null;
  const { data, isLoading, error } = useSWR<DisponibilidadResponse>(key, {
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const ocupados = useMemo(() => data?.ocupados ?? [], [data]);
  const slots = useMemo(() => {
    const base = generarSlots();
    // Conserva una hora previa fuera de la rejilla (datos antiguos o importados).
    if (value && !base.includes(value.slice(0, 5))) base.push(value.slice(0, 5));
    return base.sort();
  }, [value]);

  const libres = slots.filter((s) => !slotOcupado(s, ocupados, duracion)).length;
  const valorOcupado = !!value && slotOcupado(value.slice(0, 5), ocupados, duracion);

  return (
    <FormField label={label} required={required} className={className}>
      <div className="relative">
        <select
          value={value ? value.slice(0, 5) : ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="input-field pr-9"
          aria-describedby="selector-hora-ayuda"
        >
          <option value="">Seleccionar hora</option>
          {slots.map((s) => {
            const ocupado = slotOcupado(s, ocupados, duracion);
            return (
              <option key={s} value={s} disabled={ocupado && s !== value?.slice(0, 5)}>
                {s}
                {ocupado ? ' · ocupado' : ''}
              </option>
            );
          })}
        </select>
        {isLoading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-500" />
        )}
      </div>
      <p id="selector-hora-ayuda" className="text-[11px] text-muted">
        {!key
          ? 'Selecciona médico y fecha para ver los horarios libres.'
          : error
            ? 'No se pudo cargar la disponibilidad; se validará al guardar.'
            : `Intervalos de ${DURACION_CITA_MIN} min · ${libres} horarios libres`}
      </p>
      {valorOcupado && (
        <p className="text-[11px] font-semibold text-red-600">El médico ya tiene una cita en ese horario.</p>
      )}
    </FormField>
  );
}
