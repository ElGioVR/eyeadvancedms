import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { registrarMovimiento, siguienteFolioLente } from '@/lib/inventario';
import { coincideConModelo } from '@/lib/catalogos/modelos-lio';

export interface LenteAIngresar {
  fabricante: string;
  modelo: string;
  poder_d: number | null;
  cilindro?: number | null;
  torico?: boolean;
  lote?: string | null;
  expiration_date?: string | null;
  serial_number?: string | null;
}

export type ResultadoIngreso =
  | { ok: true; itemId: string; creado: boolean }
  | { ok: false; error: string; status: number };

/**
 * Da entrada (+1, Kardex ENTRADA) a un lente: si ya existe el mismo (marca, modelo, potencia y
 * cilindro) se suma; si no, se crea el ítem. Lo usan la recepción del plan de resurtimiento y
 * los lentes de compra directa no usados al completar la cirugía.
 */
export async function ingresarLenteAInventario(
  lente: LenteAIngresar,
  usuarioId: string,
  opciones: { referenciaTipo?: string; referenciaId?: string | null; motivo: string },
): Promise<ResultadoIngreso> {
  const supabase = getSupabaseAdmin();
  const cilindro = lente.torico ? lente.cilindro ?? null : null;

  let q = supabase.from('inventario_items').select('id, manufacturer, model, sphere, cylinder').limit(200);
  q = lente.poder_d == null ? q.is('sphere', null) : q.eq('sphere', lente.poder_d);
  const { data: candidatos } = await q;
  let itemId: string | null =
    (candidatos ?? []).find((i: { id: string; manufacturer: string | null; model: string | null; cylinder: number | null }) =>
      coincideConModelo({ marca: i.manufacturer, modelo: i.model }, { fabricante: lente.fabricante, modelo: lente.modelo })
      && (i.cylinder == null ? cilindro == null : cilindro != null && Number(i.cylinder) === Number(cilindro)),
    )?.id ?? null;
  let creado = false;

  if (!itemId) {
    for (let intento = 0; intento < 4 && !itemId; intento += 1) {
      const folio = await siguienteFolioLente(intento);
      const { data, error } = await supabase
        .from('inventario_items')
        .insert({
          folio,
          manufacturer: lente.fabricante,
          model: lente.modelo,
          sphere: lente.poder_d,
          cylinder: cilindro,
          stock: 0,
          stock_minimo: 0,
          lote: lente.lote ?? null,
          serial_number: lente.serial_number ?? null,
          expiration_date: lente.expiration_date ?? null,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505' && intento < 3) continue;
        return { ok: false, error: 'No se pudo registrar el lente en inventario.', status: 500 };
      }
      itemId = data.id;
      creado = true;
    }
  } else if (lente.expiration_date || lente.lote) {
    await supabase.from('inventario_items').update({
      ...(lente.lote ? { lote: lente.lote } : {}),
      ...(lente.expiration_date ? { expiration_date: lente.expiration_date } : {}),
    }).eq('id', itemId);
  }
  if (!itemId) return { ok: false, error: 'No se pudo registrar el lente en inventario.', status: 500 };

  const mov = await registrarMovimiento({
    itemId,
    delta: 1,
    tipo: 'ENTRADA',
    usuarioId,
    referenciaTipo: opciones.referenciaTipo ?? 'COMPRA',
    referenciaId: opciones.referenciaId ?? null,
    motivo: opciones.motivo,
  });
  if (!mov.ok) return { ok: false, error: mov.error, status: mov.status };
  return { ok: true, itemId, creado };
}
