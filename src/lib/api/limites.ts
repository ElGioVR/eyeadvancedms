import 'server-only';

import { NextResponse } from 'next/server';
import { limitarUso } from '@/lib/rate-limit';

/**
 * Límites por usuario (ventana deslizante simple). Generosos para el uso
 * normal de la clínica; frenan scripts, doble clic masivo o abuso.
 */
export const LIMITES = {
  // La búsqueda corre en cada tecla: límite en memoria (sin latencia extra).
  busqueda: { max: 90, ventanaSeg: 60, compartido: false },
  reporte: { max: 15, ventanaSeg: 60, compartido: true },
  importacion: { max: 6, ventanaSeg: 60, compartido: true },
  sync: { max: 4, ventanaSeg: 60, compartido: true },
} as const;

export type TipoLimite = keyof typeof LIMITES;

/** 429 con mensaje amigable si el usuario superó el límite; null si puede seguir. */
export async function exigirLimite(tipo: TipoLimite, usuarioId: string): Promise<NextResponse | null> {
  const { max, ventanaSeg, compartido } = LIMITES[tipo];
  const r = await limitarUso(`uso:${tipo}:${usuarioId}`, max, ventanaSeg, compartido);
  if (r.permitido) return null;
  return NextResponse.json(
    {
      error: `Demasiadas solicitudes seguidas. Espera ${r.reintentarEn} segundos e intenta de nuevo.`,
      code: 'LIMITE',
    },
    { status: 429, headers: { 'Retry-After': String(r.reintentarEn) } },
  );
}
