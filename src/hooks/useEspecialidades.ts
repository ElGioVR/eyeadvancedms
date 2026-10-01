'use client';

import useSWR from 'swr';
import { ESPECIALIDADES_BASE, type Especialidad } from '@/lib/catalogos/especialidades';

/**
 * Catálogo de especialidades (cat_especialidades). Mientras carga o si falla,
 * devuelve la lista base (sin id) para que los selects nunca queden vacíos.
 */
export function useEspecialidades(): { especialidades: Especialidad[]; desdeCatalogo: boolean } {
  const { data } = useSWR<Especialidad[]>('/api/catalogos/especialidades', {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const ok = Array.isArray(data) && data.length > 0;
  return { especialidades: ok ? data : ESPECIALIDADES_BASE, desdeCatalogo: ok };
}
