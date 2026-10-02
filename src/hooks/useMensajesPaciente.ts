'use client';

import useSWR from 'swr';
import type { PlantillasMensaje } from '@/lib/mensajes-paciente';

export const URL_MENSAJES_PACIENTE = '/api/configuracion/mensajes';

/**
 * Plantillas configuradas del mensaje al paciente. Mientras carga o si falla
 * devuelve null y se usa el mensaje por defecto.
 */
export function useMensajesPaciente(): PlantillasMensaje | null {
  const { data } = useSWR<{ valor: PlantillasMensaje }>(URL_MENSAJES_PACIENTE, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return data?.valor ?? null;
}
