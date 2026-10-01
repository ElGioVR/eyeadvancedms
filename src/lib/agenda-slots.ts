/**
 * Utilidades puras de intervalos de agenda (sin dependencias de servidor ni de
 * navegador): se pueden usar en API routes y en componentes client.
 *
 * Regla de negocio (Modificaciones agenda, punto III): 1 paciente cada 15 min
 * y sin citas empalmadas para el mismo médico.
 */

/** Duración estándar de una cita de consulta, en minutos. */
export const DURACION_CITA_MIN = 15;

/** Horario visible para elegir hora de cita (inclusive inicio, exclusivo fin). */
export const HORARIO_AGENDA = { inicio: '07:00', fin: '22:00' } as const;

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. */
export function aMinutos(hora: string | null | undefined): number {
  if (!hora) return 0;
  const [h, m] = hora.split(':');
  return parseInt(h || '0', 10) * 60 + parseInt(m || '0', 10);
}

/** Minutos → "HH:MM" (o "HH:MM:SS" si conSegundos). */
export function deMinutos(total: number, conSegundos = false): string {
  const t = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(t / 60)).padStart(2, '0');
  const mm = String(t % 60).padStart(2, '0');
  return conSegundos ? `${hh}:${mm}:00` : `${hh}:${mm}`;
}

export function sumarMinutos(hora: string, minutos: number, conSegundos = false): string {
  return deMinutos(aMinutos(hora) + minutos, conSegundos);
}

/** Duración en minutos entre dos horas; si fin falta o es inválido, la duración estándar. */
export function duracionEntre(inicio: string, fin: string | null | undefined): number {
  if (!fin) return DURACION_CITA_MIN;
  const d = aMinutos(fin) - aMinutos(inicio);
  return d > 0 ? d : DURACION_CITA_MIN;
}

/** Redondea una hora hacia abajo al múltiplo del intervalo (10:07 → 10:00). */
export function alinearASlot(hora: string, paso = DURACION_CITA_MIN): string {
  const m = aMinutos(hora);
  return deMinutos(m - (m % paso));
}

/** Lista de horas "HH:MM" cada `paso` minutos dentro del horario de agenda. */
export function generarSlots(
  paso = DURACION_CITA_MIN,
  inicio: string = HORARIO_AGENDA.inicio,
  fin: string = HORARIO_AGENDA.fin
): string[] {
  const out: string[] = [];
  for (let m = aMinutos(inicio); m < aMinutos(fin); m += paso) out.push(deMinutos(m));
  return out;
}

export interface RangoOcupado {
  hora_inicio: string;
  hora_fin: string;
}

/** ¿El intervalo [hora, hora+duracion) se traslapa con algún rango ocupado? */
export function slotOcupado(hora: string, rangos: RangoOcupado[], duracion = DURACION_CITA_MIN): boolean {
  const a = aMinutos(hora);
  const b = a + duracion;
  return rangos.some((r) => a < aMinutos(r.hora_fin) && b > aMinutos(r.hora_inicio));
}
