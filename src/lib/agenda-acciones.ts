/**
 * Reglas puras de acciones rápidas de agenda (Modificaciones agenda, punto IV).
 * Sin dependencias de React: se prueba en src/lib/__tests__/agenda-acciones.test.ts.
 */
import type { AgendaCirugia } from '@/types';
import { puedeAnularCirugia, puedeGestionarAgenda } from '@/lib/permisos-agenda';
import { puedeConfirmarse } from '@/lib/confirmacion-cita';

// «Aplazar» se eliminó: aplazar y reagendar son lo mismo; solo queda reagendar.
export type AccionRapida = 'confirmar' | 'reagendar' | 'cancelar';

export const ETIQUETA_ACCION: Record<AccionRapida, string> = {
  confirmar: 'Confirmar',
  reagendar: 'Reagendar',
  cancelar: 'Cancelar',
};

export function esEventoConsulta(e: Pick<AgendaCirugia, 'tipo'>): boolean {
  return e.tipo === 'consulta' || e.tipo === 'estudio';
}

/**
 * Acciones válidas para el evento según su tipo, estado y el rol del usuario.
 * Cirugías: agendada → reagendada | cancelada; reagendada solo admite moverla de nuevo;
 * completada → cancelada para quien gestiona la agenda (anulación de una cirugía que no se realizó).
 * Consultas/estudios: cualquier estado activo.
 * Admin, recepción y doctor pueden anular una cirugía completada; enfermería no.
 */
export function accionesDisponibles(
  evento: Pick<AgendaCirugia, 'tipo' | 'estado'>,
  userRol: string
): AccionRapida[] {
  if (!puedeGestionarAgenda(userRol)) return [];
  // Cirugía marcada completada que no se realizó: quien gestiona la agenda puede anularla (cancelar con motivo).
  if (evento.estado === 'completada' && !esEventoConsulta(evento) && puedeAnularCirugia(userRol)) return ['cancelar'];
  if (evento.estado === 'completada' || evento.estado === 'cancelada') return [];
  if (esEventoConsulta(evento)) return ['reagendar', 'cancelar'];
  if (evento.estado === 'agendada') return ['reagendar', 'cancelar'];
  if (evento.estado === 'reagendada') return ['reagendar'];
  return [];
}

/**
 * Acciones del popover/hoja móvil: «Confirmar» (asistencia, con medio) primero si la cita
 * está abierta y aún no confirmada, seguida de las acciones normales.
 */
export function accionesConConfirmar(
  evento: Pick<AgendaCirugia, 'tipo' | 'estado' | 'confirmacion'>,
  userRol: string
): AccionRapida[] {
  const base = accionesDisponibles(evento, userRol);
  if (base.length === 0 && !puedeGestionarAgenda(userRol)) return base;
  const confirmable = puedeGestionarAgenda(userRol) && puedeConfirmarse(evento.estado) && evento.confirmacion !== 'confirmada';
  return confirmable ? ['confirmar', ...base] : base;
}
