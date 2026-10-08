import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { consumirLIO } from '@/lib/inventario';

/*
 * Servicio único de lentes de una cirugía (hasta 3: PRIMERO, SEGUNDO, RESPALDO).
 *
 * Reglas (comentarios clínica, oct 2026):
 *  - Programar la cirugía COMPROMETE (reserva) el lente de inventario; no baja stock.
 *  - Lente del HOSPITAL: solo se registra, nunca toca inventario.
 *  - Al COMPLETAR se indica cuáles fueron requeridos: esos descuentan inventario
 *    (SALIDA_CIRUGIA); el resto de reservas se LIBERA.
 *  - Cancelar, reagendar o cambiar de lente libera reservas.
 *
 * Requiere: sql/patch-cirugia-lentes-reservas-supabase.sql y
 *           sql/patch-cirugia-lentes-funciones-supabase.sql
 * Ninguna ruta usa este servicio todavía (Fase 1, sin cambio de comportamiento).
 */

export { ORDENES_LENTE, disponiblesParaReservar } from '@/lib/cirugia-lentes-puro';
export type { OrdenLente, OrigenLente, EstadoLente } from '@/lib/cirugia-lentes-puro';
import type { OrdenLente, OrigenLente, EstadoLente } from '@/lib/cirugia-lentes-puro';

export interface LenteCirugia {
  id: string;
  cirugia_id: string;
  orden: OrdenLente;
  origen: OrigenLente;
  inventario_item_id: string | null;
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  torico: boolean;
  estado: EstadoLente;
  requerido: boolean;
}

export interface ReservarLenteInput {
  cirugiaId: string;
  orden: OrdenLente;
  origen: OrigenLente;
  inventarioItemId?: string | null;
  fabricante?: string | null;
  modelo?: string | null;
  poderD?: number | null;
  torico?: boolean;
}

export type ResultadoLente<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; codigo: CodigoErrorLente; error: string };

export type CodigoErrorLente =
  | 'LENTE_SIN_DISPONIBLE'
  | 'LENTE_YA_USADO'
  | 'ITEM_REQUERIDO'
  | 'ITEM_NO_ENCONTRADO'
  | 'ORDEN_INVALIDO'
  | 'ORIGEN_INVALIDO'
  | 'ERROR_INTERNO';

const MENSAJES: Record<CodigoErrorLente, string> = {
  LENTE_SIN_DISPONIBLE: 'No hay piezas disponibles de este lente (stock menos reservas).',
  LENTE_YA_USADO: 'Este lente ya fue marcado como usado en la cirugía.',
  ITEM_REQUERIDO: 'Falta el lente de inventario a reservar.',
  ITEM_NO_ENCONTRADO: 'El lente de inventario no existe.',
  ORDEN_INVALIDO: 'Orden de lente no válido.',
  ORIGEN_INVALIDO: 'Origen de lente no válido.',
  ERROR_INTERNO: 'Error al procesar los lentes de la cirugía.',
};

/** Traduce el mensaje de PostgreSQL (RAISE EXCEPTION) a un código de negocio. */
function codigoDesdeError(message: string | undefined): CodigoErrorLente {
  const m = (message ?? '').trim();
  const conocidos = Object.keys(MENSAJES) as CodigoErrorLente[];
  return conocidos.find((c) => m.includes(c)) ?? 'ERROR_INTERNO';
}

/** Reserva (o reemplaza) el lente de una orden de la cirugía. */
export async function reservarLente(input: ReservarLenteInput): Promise<ResultadoLente<LenteCirugia>> {
  const { data, error } = await getSupabaseAdmin().rpc('reservar_lente_cirugia', {
    p_cirugia_id: input.cirugiaId,
    p_orden: input.orden,
    p_origen: input.origen,
    p_item_id: input.origen === 'INVENTARIO' ? input.inventarioItemId ?? null : null,
    p_fabricante: input.fabricante ?? null,
    p_modelo: input.modelo ?? null,
    p_poder: input.poderD ?? null,
    p_torico: input.torico ?? false,
  });
  if (error) {
    const codigo = codigoDesdeError(error.message);
    return { ok: false, codigo, error: MENSAJES[codigo] };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as LenteCirugia | undefined;
  if (!fila) return { ok: false, codigo: 'ERROR_INTERNO', error: MENSAJES.ERROR_INTERNO };
  return { ok: true, data: fila } as ResultadoLente<LenteCirugia>;
}

/** Libera reservas (una orden o todas). Devuelve cuántas se liberaron. */
export async function liberarLentes(cirugiaId: string, orden?: OrdenLente): Promise<ResultadoLente<number>> {
  const { data, error } = await getSupabaseAdmin().rpc('liberar_lentes_cirugia', {
    p_cirugia_id: cirugiaId,
    p_orden: orden ?? null,
  });
  if (error) return { ok: false, codigo: 'ERROR_INTERNO', error: MENSAJES.ERROR_INTERNO };
  return { ok: true, data: Number(data ?? 0) } as ResultadoLente<number>;
}

/**
 * Completa la cirugía: `requeridos` son los órdenes realmente usados.
 * - Usados de inventario: SALIDA_CIRUGIA (consumirLIO, idempotente por cirugía).
 * - Reservas no usadas: LIBERADO.
 * - Usados de hospital: solo se marcan USADO (sin inventario).
 * Orden de operaciones: primero el movimiento de inventario (idempotente), después
 * el estado en BD. Si el movimiento falla, no se toca el estado.
 */
export async function completarLentesCirugia(
  cirugiaId: string,
  requeridos: OrdenLente[],
  usuarioId: string,
): Promise<ResultadoLente<LenteCirugia[]>> {
  const supabase = getSupabaseAdmin();
  const { data: filas, error: errLectura } = await supabase
    .from('cirugia_lentes')
    .select('id, cirugia_id, orden, origen, inventario_item_id, fabricante, modelo, poder_d, torico, estado, requerido')
    .eq('cirugia_id', cirugiaId)
    .neq('estado', 'LIBERADO');
  if (errLectura) return { ok: false, codigo: 'ERROR_INTERNO', error: MENSAJES.ERROR_INTERNO };

  const lentes = (filas ?? []) as LenteCirugia[];
  const usados = lentes.filter((l) => requeridos.includes(l.orden) && l.estado !== 'USADO');

  for (const l of usados) {
    if (l.origen === 'INVENTARIO' && l.inventario_item_id) {
      const r = await consumirLIO(l.inventario_item_id, cirugiaId, usuarioId);
      if (!r.success) {
        return { ok: false, codigo: 'LENTE_SIN_DISPONIBLE', error: r.error ?? MENSAJES.ERROR_INTERNO };
      }
    }
  }

  const ahora = new Date().toISOString();
  const { error: errUsados } = await supabase
    .from('cirugia_lentes')
    .update({ estado: 'USADO', requerido: true, updated_at: ahora })
    .eq('cirugia_id', cirugiaId)
    .in('orden', requeridos)
    .neq('estado', 'LIBERADO');
  if (errUsados) return { ok: false, codigo: 'ERROR_INTERNO', error: MENSAJES.ERROR_INTERNO };

  const noUsados = lentes.map((l) => l.orden).filter((o) => !requeridos.includes(o));
  if (noUsados.length > 0) {
    const { error: errLib } = await supabase
      .from('cirugia_lentes')
      .update({ estado: 'LIBERADO', requerido: false, updated_at: ahora })
      .eq('cirugia_id', cirugiaId)
      .in('orden', noUsados)
      .eq('estado', 'RESERVADO');
    if (errLib) return { ok: false, codigo: 'ERROR_INTERNO', error: MENSAJES.ERROR_INTERNO };
  }

  const { data: final, error: errFinal } = await supabase
    .from('cirugia_lentes')
    .select('id, cirugia_id, orden, origen, inventario_item_id, fabricante, modelo, poder_d, torico, estado, requerido')
    .eq('cirugia_id', cirugiaId)
    .order('orden');
  if (errFinal) return { ok: false, codigo: 'ERROR_INTERNO', error: MENSAJES.ERROR_INTERNO };
  return { ok: true, data: (final ?? []) as LenteCirugia[] } as ResultadoLente<LenteCirugia[]>;
}
