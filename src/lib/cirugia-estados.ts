/**
 * Máquina de estados de cirugía (Fase 1).
 *
 * Transiciones válidas según la especificación:
 * - agendada → reagendada
 * - reagendada → agendada
 * - agendada → aplazada
 * - agendada → cancelada
 * - agendada → completada
 */

export type CirugiaEstado = 'agendada' | 'aplazada' | 'reagendada' | 'completada' | 'cancelada';

export const TRANSICIONES_VALIDAS: Record<CirugiaEstado, CirugiaEstado[]> = {
  agendada: ['reagendada', 'aplazada', 'cancelada', 'completada'],
  reagendada: ['agendada'],
  aplazada: [],
  cancelada: [],
  completada: [],
};

export function esTransicionValida(de: CirugiaEstado | null | undefined, a: CirugiaEstado): boolean {
  if (!de) return true;
  const permitidas = TRANSICIONES_VALIDAS[de];
  return permitidas ? permitidas.includes(a) : false;
}

export function estadosValidos(): CirugiaEstado[] {
  return ['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada'];
}
