import { claveTexto } from '@/lib/import-agenda';

/*
 * Lectura de la columna LIO del Excel de cirugías (sin dependencias de servidor).
 * Ejemplos reales: "23.00 CLAREON", "ISERT 21.0/CT LUCIA 22.5", "CLAREON 22.5".
 * El "/" separa primero y segundo lente; el poder es el número decimal de la pieza.
 */
export interface LenteLeido {
  orden: 'PRIMERO' | 'SEGUNDO' | 'RESPALDO';
  poder: number | null;
  marca: string;
}

const ORDENES = ['PRIMERO', 'SEGUNDO', 'RESPALDO'] as const;

export function parsearLio(texto: string | null | undefined, marcaColumna?: string | null): LenteLeido[] {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  const segmentos = limpio.split('/').map((s) => s.trim()).filter(Boolean).slice(0, ORDENES.length);
  const marcaCol = (marcaColumna ?? '').trim();
  return segmentos.map((seg, i) => {
    const poderMatch = seg.match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
    const poder = poderMatch ? Number(poderMatch[1].replace(',', '.')) : null;
    let marca = seg.replace(/(\d{1,2}(?:[.,]\d{1,2})?)/, '').replace(/\s+/g, ' ').trim();
    if (!marca && segmentos.length === 1) marca = marcaCol;
    return { orden: ORDENES[i], poder: Number.isFinite(poder as number) ? poder : null, marca };
  });
}

/** Clave para emparejar marca y poder con inventario. */
export function claveLente(marca: string, poder: number | null): string {
  return `${claveTexto(marca)}|${poder == null ? '' : poder.toFixed(2)}`;
}
