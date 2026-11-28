import { DIAS_POR_VENCER, diasParaVencer, type CategoriaInsumo, type Insumo, type LoteInsumo } from '@/lib/insumos';

export const COLOR_CATEGORIA: Record<CategoriaInsumo, string> = {
  CASSETTE: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  MEDICAMENTO: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  MATERIAL_CURACION: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
  DESECHABLE: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  OTRO: 'bg-surface-2 text-fg-2',
};

export const fmtFecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export type EstadoCaducidad = 'vencido' | 'por-vencer' | 'ok' | 'sin-fecha';
export function estadoCaducidad(fecha: string | null): EstadoCaducidad {
  const d = diasParaVencer(fecha);
  if (d === null) return 'sin-fecha';
  if (d < 0) return 'vencido';
  if (d <= DIAS_POR_VENCER) return 'por-vencer';
  return 'ok';
}

export const total = (i: Insumo) => i.lotes.reduce((s, l) => s + l.cantidad, 0);
const vencido = (l: LoteInsumo) => estadoCaducidad(l.fecha_caducidad) === 'vencido';
/** Piezas que se pueden usar (sin contar lotes vencidos). */
export const vigentes = (i: Insumo) => i.lotes.reduce((s, l) => s + (vencido(l) ? 0 : l.cantidad), 0);
export const vencidas = (i: Insumo) => total(i) - vigentes(i);
/** El mínimo se compara contra lo vigente: lo vencido no sirve. */
export const bajoMinimo = (i: Insumo) => i.stock_minimo > 0 && vigentes(i) < i.stock_minimo;
/** Lote vigente con caducidad más cercana (los lotes vienen ordenados por caducidad). */
export const proximoLote = (i: Insumo): LoteInsumo | undefined => i.lotes.find((l) => l.fecha_caducidad && !vencido(l));

const fmtCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' });
/** Texto compacto para selects (cabe en móvil): «A1 · CINTAR · 4 pz · vence 10 dic 26». */
export function textoLote(l: LoteInsumo, nombreUbicacion: (id: string) => string) {
  const cad = l.fecha_caducidad ? `${vencido(l) ? 'VENCIDO' : 'vence'} ${fmtCorta(l.fecha_caducidad)}` : null;
  return [l.lote ?? 'Sin lote', nombreUbicacion(l.ubicacion_id), `${l.cantidad} pz`, cad].filter(Boolean).join(' · ');
}
