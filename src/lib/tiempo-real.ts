'use client';

import { useSyncExternalStore } from 'react';

/**
 * Estado global de la conexión de tiempo real (Supabase Realtime).
 * Mientras está conectada, el polling de datos compartidos baja de 30 s a
 * 2 min (solo como respaldo): los cambios llegan por el canal al instante.
 */
let conectado = false;
const oyentes = new Set<() => void>();

export function marcarTiempoReal(valor: boolean) {
  if (conectado === valor) return;
  conectado = valor;
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

export function useTiempoRealConectado(): boolean {
  return useSyncExternalStore(suscribir, () => conectado, () => false);
}

/** Intervalo de refresco para datos que cambian por la acción de otros usuarios. */
export const REFRESCO_SIN_TIEMPO_REAL_MS = 30_000;
export const REFRESCO_CON_TIEMPO_REAL_MS = 120_000;

export function useRefrescoCompartido(): number {
  return useTiempoRealConectado() ? REFRESCO_CON_TIEMPO_REAL_MS : REFRESCO_SIN_TIEMPO_REAL_MS;
}

/** Qué cachés de SWR revalidar según la tabla que cambió. */
export const PREFIJOS_POR_TABLA: Record<string, string[]> = {
  consultas: ['/api/consultas', '/api/agenda', '/api/dashboard', '/api/pacientes'],
  agenda_cirugias: ['/api/agenda', '/api/cirugias', '/api/dashboard', '/api/pacientes'],
};
