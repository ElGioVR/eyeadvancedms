/** Inventario de insumos (sql/patch-insumos-inventario-supabase.sql). Compartido por API y UI. */

export const CATEGORIAS_INSUMO = ['CASSETTE', 'MEDICAMENTO', 'MATERIAL_CURACION', 'DESECHABLE', 'OTRO'] as const;
export type CategoriaInsumo = (typeof CATEGORIAS_INSUMO)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaInsumo, string> = {
  CASSETTE: 'Cassette',
  MEDICAMENTO: 'Medicamento',
  MATERIAL_CURACION: 'Material de curación',
  DESECHABLE: 'Desechable',
  OTRO: 'Otro',
};

export const POLITICAS_SALIDA = ['FEFO', 'FIFO', 'LIFO'] as const;
export type PoliticaSalida = (typeof POLITICAS_SALIDA)[number];
export const ETIQUETA_POLITICA: Record<PoliticaSalida, { corta: string; larga: string }> = {
  FEFO: { corta: 'Caduca primero', larga: 'Sale primero lo que caduca antes. Recomendado para medicamentos y material estéril.' },
  FIFO: { corta: 'Más antiguo primero', larga: 'Sale primero lo que entró antes.' },
  LIFO: { corta: 'Más reciente primero', larga: 'Sale primero lo último que entró.' },
};

export type TipoMovInsumo = 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'TRASLADO' | 'MERMA';

export interface UbicacionInsumo { id: string; nombre: string; activa: boolean; orden: number }
export interface LoteInsumo {
  id: string;
  ubicacion_id: string;
  lote: string | null;
  fecha_caducidad: string | null;
  cantidad: number;
  /** Lote generado por el sistema porque el producto no traía número. */
  lote_interno?: boolean;
  fecha_ingreso?: string | null;
}
export interface Insumo {
  id: string;
  nombre: string;
  categoria: CategoriaInsumo;
  presentacion: string | null;
  codigo: string | null;
  fabricante: string | null;
  stock_minimo: number;
  notas: string | null;
  politica_salida: PoliticaSalida;
  lotes: LoteInsumo[];
}
export interface MovimientoInsumo {
  id: string;
  tipo: TipoMovInsumo;
  cantidad: number;
  cantidad_resultante: number | null;
  ubicacion_id: string | null;
  ubicacion_destino_id: string | null;
  lote: string | null;
  fecha_caducidad: string | null;
  motivo: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

/**
 * Lotes vigentes en el orden en que saldrían (misma regla que insumo_salida_auto en SQL).
 * `hoy` en AAAA-MM-DD; los vencidos no salen (van por merma).
 */
export function ordenSalida(lotes: LoteInsumo[], politica: PoliticaSalida, hoy: string, ubicacionId?: string | null): LoteInsumo[] {
  const ingreso = (l: LoteInsumo) => l.fecha_ingreso ?? '';
  return lotes
    .filter((l) => l.cantidad > 0 && (!l.fecha_caducidad || l.fecha_caducidad >= hoy) && (!ubicacionId || l.ubicacion_id === ubicacionId))
    .sort((a, b) => {
      if (politica === 'FEFO') {
        const fa = a.fecha_caducidad ?? '9999-12-31';
        const fb = b.fecha_caducidad ?? '9999-12-31';
        if (fa !== fb) return fa < fb ? -1 : 1;
      }
      if (politica === 'LIFO' && ingreso(a) !== ingreso(b)) return ingreso(a) < ingreso(b) ? 1 : -1;
      return ingreso(a) < ingreso(b) ? -1 : ingreso(a) > ingreso(b) ? 1 : a.id.localeCompare(b.id);
    });
}

/** Días para considerar un lote «por vencer». */
export const DIAS_POR_VENCER = 60;

/** Las tablas de insumos aún no existen (falta correr el SQL). */
export function faltanTablasInsumos(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code ?? '') || /insumo/i.test(error.message ?? '') && /does not exist|could not find/i.test(error.message ?? '');
}

export function diasParaVencer(fecha: string | null, hoy = new Date()): number | null {
  if (!fecha) return null;
  const f = new Date(`${fecha}T12:00:00`);
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  return Math.round((f.getTime() - h.getTime()) / 86_400_000);
}
