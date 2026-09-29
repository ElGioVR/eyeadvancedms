'use client';

import { useEffect, useState } from 'react';
import { fetchJSON } from '@/lib/fetcher';

export interface DoctorSyncFila {
  doctor_id: string;
  doctor_nombre: string;
  origen: string;
  ref: string;
  eventos?: number;
}

export interface SyncResultado {
  consultas_verificadas?: number;
  cirugias_verificadas?: number;
  eventos_creados?: number;
  eventos_existentes?: number;
  consultas_desplegadas?: number;
  cirugias_desplegadas?: number;
  pendientes_antes?: { consultas?: number; cirugias?: number; doctores_sin_evento?: number };
  doctores_sin_evento?: DoctorSyncFila[];
  doctores_en_modulo?: DoctorSyncFila[];
  doctores_total?: number;
  errores?: string[];
  duracion_ms?: number;
}

export interface SyncPreview {
  consultas_pendientes?: number;
  cirugias_pendientes?: number;
  doctores_sin_evento?: DoctorSyncFila[];
  doctores_en_modulo?: DoctorSyncFila[];
  doctores_total?: number;
}

/** Tiempo máximo que el cliente espera la respuesta del sync. */
export const SYNC_TIMEOUT_MS = 120_000;

/** URL del preview de pendientes (misma forma en pestaña y modal → caché compartida). */
export function urlPreviewSync(desde?: string, hasta?: string): string {
  const params = new URLSearchParams({ preview: '1' });
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  return `/api/productividad/sync?${params}`;
}

export function esAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

/**
 * Ejecuta el sync (POST). Lanza ApiError con el mensaje del servidor, o un
 * error claro si se supera SYNC_TIMEOUT_MS (el servidor puede seguir
 * procesando; conviene revisar el historial antes de reintentar).
 */
export async function ejecutarSync(body: {
  fecha_desde?: string;
  fecha_hasta?: string;
  solo_pendientes?: boolean;
}): Promise<SyncResultado> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const data = await fetchJSON<({ sync?: SyncResultado } & SyncResultado) | null>('/api/productividad/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return data?.sync ?? data ?? {};
  } catch (err) {
    if (esAbort(err)) {
      throw new Error(
        `El sync tardó más de ${Math.round(SYNC_TIMEOUT_MS / 60_000)} min sin responder. Puede seguir ejecutándose en el servidor: revisa el historial antes de reintentar.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Segundos transcurridos mientras `activo` (para mostrar progreso de tareas largas). */
export function useSegundosTranscurridos(activo: boolean): number {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!activo) return;
    setSegundos(0);
    const inicio = Date.now();
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(id);
  }, [activo]);
  return segundos;
}
