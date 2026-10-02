/**
 * Reglas puras de acciones rápidas de agenda (Modificaciones agenda, punto IV).
 * Sin dependencias de React: se prueba en src/lib/__tests__/agenda-acciones.test.ts.
 */
import type { AgendaCirugia } from '@/types';
import { puedeGestionarAgenda } from '@/lib/permisos-agenda';

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
 * reagendada solo admite moverla de nuevo).
 * Consultas/estudios: cualquier estado activo.
 * Admin, recepción y doctor gestionan toda la agenda; enfermería solo la consulta.
 */
export function accionesDisponibles(
  evento: Pick<AgendaCirugia, 'tipo' | 'estado'>,
  userRol: string
): AccionRapida[] {
  if (!puedeGestionarAgenda(userRol)) return [];
  if (evento.estado === 'completada' || evento.estado === 'cancelada') return [];
  if (esEventoConsulta(evento)) return ['aplazar', 'reagendar', 'cancelar'];
  if (evento.estado === 'agendada') return ['aplazar', 'reagendar', 'cancelar'];
  if (evento.estado === 'reagendada') return ['reagendar'];
  return [];
}
