/**
 * Reglas puras de acciones rápidas de agenda (Modificaciones agenda, punto IV).
 * Sin dependencias de React: se prueba en src/lib/__tests__/agenda-acciones.test.ts.
 */
import type { AgendaCirugia } from '@/types';

export type AccionRapida = 'aplazar' | 'reagendar' | 'cancelar';

export const ETIQUETA_ACCION: Record<AccionRapida, string> = {
  aplazar: 'Aplazar',
  reagendar: 'Reagendar',
  cancelar: 'Cancelar',
};

export function esEventoConsulta(e: Pick<AgendaCirugia, 'tipo'>): boolean {
  return e.tipo === 'consulta' || e.tipo === 'estudio';
}

/**
 * Acciones válidas para el evento según su tipo, estado y el rol del usuario.
 * Cirugías: máquina de estados (agendada → aplazada|reagendada|cancelada;
 * reagendada solo admite moverla de nuevo) y solo admin/recepción.
 * Consultas/estudios: cualquier estado activo; el doctor solo las suyas (lo valida la API).
 */
export function accionesDisponibles(
  evento: Pick<AgendaCirugia, 'tipo' | 'estado'>,
  userRol: string
): AccionRapida[] {
  // Enfermería (rol restringido): solo consulta su agenda.
  if (userRol === 'enfermero') return [];
  if (evento.estado === 'completada' || evento.estado === 'cancelada') return [];
  if (esEventoConsulta(evento)) return ['aplazar', 'reagendar', 'cancelar'];
  if (userRol === 'doctor') return [];
  if (evento.estado === 'agendada') return ['aplazar', 'reagendar', 'cancelar'];
  if (evento.estado === 'reagendada') return ['reagendar'];
  return [];
}
