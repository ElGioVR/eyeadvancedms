import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ConsumirLIOResult {
  success: boolean;
  error?: string;
  movimiento_id?: string;
  stock_resultante?: number;
}

/**
 * Consume 1 LIO from inventory when a surgery is completed.
 * Records a SALIDA_CIRUGIA movement in the Kardex.
 */
export async function consumirLIO(
  inventarioItemId: string,
  cirugiaId: string,
  usuarioId: string,
): Promise<ConsumirLIOResult> {
  const supabase = getSupabaseAdmin();

  const { data: item, error: itemError } = await supabase
    .from('inventario_items')
    .select('id, stock, tipo')
    .eq('id', inventarioItemId)
    .single();

  if (itemError || !item) {
    return { success: false, error: 'Ítem de inventario no encontrado' };
  }

  if (item.tipo !== 'LENTE_INTRAOCULAR') {
    return { success: false, error: 'El ítem seleccionado no es un LIO' };
  }

  if (item.stock < 1) {
    return { success: false, error: `Stock insuficiente. Disponible: ${item.stock}` };
  }

  const newStock = item.stock - 1;

  const { data: movimiento, error: movError } = await supabase
    .from('inventario_movimientos')
    .insert({
      inventario_item_id: inventarioItemId,
      tipo: 'SALIDA_CIRUGIA',
      cantidad: 1,
      stock_resultante: newStock,
      usuario_id: usuarioId,
      referencia_tipo: 'CIRUGIA',
      referencia_id: cirugiaId,
      motivo: `Consumo LIO por cirugía`,
    })
    .select('id')
    .single();

  if (movError) {
    return { success: false, error: 'Error al registrar movimiento de inventario' };
  }

  const { error: updateError } = await supabase
    .from('inventario_items')
    .update({ stock: newStock })
    .eq('id', inventarioItemId);

  if (updateError) {
    return { success: false, error: 'Error al actualizar stock' };
  }

  return { success: true, movimiento_id: movimiento.id, stock_resultante: newStock };
}

/**
 * Release a reserved LIO back to inventory (e.g. when surgery is cancelled).
 * Records a DEVOLUCION movement in the Kardex.
 */
export async function liberarLIO(
  inventarioItemId: string,
  cirugiaId: string,
  usuarioId: string,
): Promise<ConsumirLIOResult> {
  const supabase = getSupabaseAdmin();

  const { data: item, error: itemError } = await supabase
    .from('inventario_items')
    .select('id, stock')
    .eq('id', inventarioItemId)
    .single();

  if (itemError || !item) {
    return { success: false, error: 'Ítem de inventario no encontrado' };
  }

  // Check if this surgery already consumed the LIO (SALIDA_CIRUGIA exists)
  const { data: existente } = await supabase
    .from('inventario_movimientos')
    .select('id')
    .eq('referencia_tipo', 'CIRUGIA')
    .eq('referencia_id', cirugiaId)
    .eq('inventario_item_id', inventarioItemId)
    .eq('tipo', 'SALIDA_CIRUGIA')
    .maybeSingle();

  if (!existente) {
    return { success: true };
  }

  const { data: yaLiberado } = await supabase
    .from('inventario_movimientos')
    .select('id')
    .eq('referencia_tipo', 'CIRUGIA')
    .eq('referencia_id', cirugiaId)
    .eq('inventario_item_id', inventarioItemId)
    .eq('tipo', 'DEVOLUCION')
    .maybeSingle();

  if (yaLiberado) {
    return { success: true };
  }

  const newStock = item.stock + 1;

  const { error: movError } = await supabase
    .from('inventario_movimientos')
    .insert({
      inventario_item_id: inventarioItemId,
      tipo: 'DEVOLUCION',
      cantidad: 1,
      stock_resultante: newStock,
      usuario_id: usuarioId,
      referencia_tipo: 'CIRUGIA',
      referencia_id: cirugiaId,
      motivo: `Devolución LIO por cancelación de cirugía`,
    });

  if (movError) {
    return { success: false, error: 'Error al registrar devolución' };
  }

  const { error: updateError } = await supabase
    .from('inventario_items')
    .update({ stock: newStock })
    .eq('id', inventarioItemId);

  if (updateError) {
    return { success: false, error: 'Error al actualizar stock' };
  }

  return { success: true, stock_resultante: newStock };
}
