/**
 * Switches de estatus para los reportes de agenda (cirugías y entradas/salidas).
 * Compartido por la pantalla (lista de switches) y por los endpoints (filtro).
 */

export interface OpcionEstatusReporte {
  id: string;
  label: string;
}

// Aplazadas y canceladas NO son de interés en estos reportes: no tienen switch y el
// servidor siempre las excluye.
export const ESTATUS_CIRUGIA_REPORTE: OpcionEstatusReporte[] = [
  { id: 'agendada', label: 'Agendada' },
  { id: 'reagendada', label: 'Reagendada' },
  { id: 'completada', label: 'Completada' },
];

export const ESTATUS_CONSULTA_REPORTE: OpcionEstatusReporte[] = [
  { id: 'agendada', label: 'Agendada' },
  { id: 'reagendada', label: 'Reagendada' },
  { id: 'completada', label: 'Completada' },
  { id: 'pendiente', label: 'Pendiente' },
];

/** Valores reales de `consultas.estatus` que cubre cada switch. */
const CRUDOS_CONSULTA: Record<string, string[]> = {
  agendada: ['BORRADOR', 'AGENDADA'],
  reagendada: ['REAGENDADA'],
  aplazada: ['APLAZADA'],
  completada: ['COMPLETADA', 'PROCESADA', 'FINALIZADA'],
  pendiente: ['PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA'],
  cancelada: ['CANCELADA'],
};

/**
 * Convierte el parámetro `estatus=a,b` en la lista de switches activos.
 * Sin parámetro (o sin valores válidos) se usan todos los switches de la lista.
 */
export function parseEstatusReporte(valor: string | null | undefined, opciones: OpcionEstatusReporte[]): string[] {
  const todos = opciones.map((o) => o.id);
  if (!valor) return todos;
  const validos = new Set(todos);
  const elegidos = [...new Set(valor.split(',').map((s) => s.trim()).filter((s) => validos.has(s)))];
  return elegidos.length > 0 ? elegidos : todos;
}

/** Traduce los switches activos a valores de `consultas.estatus` (siempre con filtro). */
export function estatusConsultaCrudos(elegidos: string[]): string[] {
  return elegidos.flatMap((id) => CRUDOS_CONSULTA[id] || []);
}
