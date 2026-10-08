/*
 * Tipos y reglas puras de lentes de cirugía. Sin dependencias de servidor
 * (Supabase/inventario), para poder usarse en pruebas y en componentes cliente.
 */

export const ORDENES_LENTE = ['PRIMERO', 'SEGUNDO', 'RESPALDO'] as const;
export type OrdenLente = (typeof ORDENES_LENTE)[number];
export type OrigenLente = 'INVENTARIO' | 'HOSPITAL';
export type EstadoLente = 'RESERVADO' | 'USADO' | 'LIBERADO';

/** Stock disponible para reservar = stock físico − reservas activas. */
export function disponiblesParaReservar(stock: number, reservadas: number): number {
  return Math.max(0, Math.trunc(stock) - Math.trunc(reservadas));
}
