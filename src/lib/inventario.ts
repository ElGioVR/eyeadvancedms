import { getSupabaseAdmin } from '@/lib/supabase/admin';

/*
 * Movimientos de inventario (Kardex) seguros ante concurrencia.
 *
 * Regla Kardex: nunca se hace UPDATE directo del stock sin su movimiento.
 * Antes el stock se leía, se calculaba y se escribía (read-modify-write): dos
 * operaciones simultáneas sobre el mismo ítem perdían un descuento.
 *
 * Ahora:
 *  1. Camino principal: RPC `registrar_movimiento_inventario` (sql/patch-inventario-atomico.sql)
 *     → UPDATE stock = stock + delta WHERE stock + delta >= 0 y el INSERT del
 *     movimiento en UNA transacción.
 *  2. Si el RPC aún no está instalado: actualización optimista (compare-and-set
 *     sobre el stock leído, con reintentos) + movimiento; si el movimiento falla
 *     se revierte el stock.
 */

export interface ConsumirLIOResult {
  success: boolean;
  error?: string;
  movimiento_id?: string;
  stock_resultante?: number;
}

export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'DEVOLUCION' | 'SALIDA_CIRUGIA';

export interface MovimientoStock {
  itemId: string;
  /** Cambio de stock con signo (+ entra, − sale). */
  delta: number;
  tipo: TipoMovimiento;
  usuarioId: string | null;
  /** Cantidad a registrar en el Kardex (por defecto |delta|). */
  cantidad?: number;
  referenciaTipo?: string | null;
  referenciaId?: string | null;
  motivo?: string | null;
  costoUnitario?: number | null;
  proveedorId?: string | null;
}

export type ResultadoMovimiento =
  | { ok: true; movimientoId: string | null; stock: number }
  | { ok: false; error: string; status: number; codigo?: 'STOCK_INSUFICIENTE' | 'NO_ENCONTRADO' | 'DUPLICADO' | 'CONFLICTO' };

/** null = aún no se sabe. Si falta, se vuelve a probar cada 5 min (por si se instala el patch). */
let rpcDisponible: boolean | null = null;
let rpcReintentarDesde = 0;
const RPC_REINTENTO_MS = 5 * 60_000;

function faltaFuncion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(error.message || '');
}

async function movimientoPorRPC(m: MovimientoStock): Promise<ResultadoMovimiento | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('registrar_movimiento_inventario', {
    p_item_id: m.itemId,
    p_delta: m.delta,
    p_tipo: m.tipo,
    p_usuario_id: m.usuarioId,
    p_cantidad: m.cantidad ?? Math.abs(m.delta),
    p_referencia_tipo: m.referenciaTipo ?? null,
    p_referencia_id: m.referenciaId ?? null,
    p_motivo: m.motivo ?? null,
    p_costo_unitario: m.costoUnitario ?? null,
    p_proveedor_id: m.proveedorId ?? null,
  });

  if (faltaFuncion(error)) {
    rpcDisponible = false;
    rpcReintentarDesde = Date.now() + RPC_REINTENTO_MS;
    return null;
  }
  rpcDisponible = true;

  if (error) {
    const msg = error.message || '';
    if (msg.includes('STOCK_INSUFICIENTE')) {
      return { ok: false, error: 'Stock insuficiente', status: 400, codigo: 'STOCK_INSUFICIENTE' };
    }
    if (msg.includes('ITEM_NO_ENCONTRADO')) {
      return { ok: false, error: 'Ítem de inventario no encontrado', status: 404, codigo: 'NO_ENCONTRADO' };
    }
    if (error.code === '23505') {
      return { ok: false, error: 'El movimiento ya estaba registrado', status: 409, codigo: 'DUPLICADO' };
    }
    console.error('[inventario.rpc]', { message: error.message, code: error.code });
    return { ok: false, error: 'Error al registrar movimiento de inventario', status: 500 };
  }

  const fila = (Array.isArray(data) ? data[0] : data) as { movimiento_id?: string; stock_resultante?: number } | null;
  return { ok: true, movimientoId: fila?.movimiento_id ?? null, stock: Number(fila?.stock_resultante ?? 0) };
}

/** Compare-and-set del stock: solo escribe si nadie lo cambió desde la lectura. */
async function casStock(itemId: string, delta: number): Promise<
  { ok: true; anterior: number; nuevo: number } | { ok: false; motivo: 'NO_ENCONTRADO' | 'STOCK_INSUFICIENTE' | 'CONFLICTO' | 'ERROR' }
> {
  const supabase = getSupabaseAdmin();
  for (let intento = 0; intento < 5; intento += 1) {
    const { data: item, error } = await supabase.from('inventario_items').select('stock').eq('id', itemId).maybeSingle();
    if (error) return { ok: false, motivo: 'ERROR' };
    if (!item) return { ok: false, motivo: 'NO_ENCONTRADO' };
    const anterior = Number(item.stock) || 0;
    const nuevo = anterior + delta;
    if (nuevo < 0) return { ok: false, motivo: 'STOCK_INSUFICIENTE' };

    const { data: upd, error: errUpd } = await supabase
      .from('inventario_items')
      .update({ stock: nuevo })
      .eq('id', itemId)
      .eq('stock', anterior)
      .select('id')
      .maybeSingle();
    if (errUpd) return { ok: false, motivo: 'ERROR' };
    if (upd) return { ok: true, anterior, nuevo };
    // Otro usuario cambió el stock entre la lectura y la escritura → reintentar
  }
  return { ok: false, motivo: 'CONFLICTO' };
}

async function movimientoOptimista(m: MovimientoStock): Promise<ResultadoMovimiento> {
  const supabase = getSupabaseAdmin();
  const cas = await casStock(m.itemId, m.delta);
  if (!cas.ok) {
    if (cas.motivo === 'NO_ENCONTRADO') return { ok: false, error: 'Ítem de inventario no encontrado', status: 404, codigo: 'NO_ENCONTRADO' };
    if (cas.motivo === 'STOCK_INSUFICIENTE') return { ok: false, error: 'Stock insuficiente', status: 400, codigo: 'STOCK_INSUFICIENTE' };
    if (cas.motivo === 'CONFLICTO') return { ok: false, error: 'El stock cambió mientras se guardaba. Intenta de nuevo.', status: 409, codigo: 'CONFLICTO' };
    return { ok: false, error: 'Error al actualizar stock', status: 500 };
  }

  const { data: mov, error } = await supabase
    .from('inventario_movimientos')
    .insert({
      inventario_item_id: m.itemId,
      tipo: m.tipo,
      cantidad: m.cantidad ?? Math.abs(m.delta),
      stock_resultante: cas.nuevo,
      usuario_id: m.usuarioId,
      referencia_tipo: m.referenciaTipo ?? null,
      referencia_id: m.referenciaId ?? null,
      motivo: m.motivo ?? null,
      costo_unitario: m.costoUnitario ?? null,
      proveedor_id: m.proveedorId ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Sin movimiento no puede quedar el cambio de stock: revertir
    const reversa = await casStock(m.itemId, -m.delta);
    if (!reversa.ok) {
      console.error('[inventario.compensacion] NO se pudo revertir el stock; revisar Kardex', {
        itemId: m.itemId,
        delta: m.delta,
        motivo: reversa.motivo,
      });
    }
    console.error('[inventario.movimiento]', { message: error.message, code: error.code });
    if (error.code === '23505') return { ok: false, error: 'El movimiento ya estaba registrado', status: 409, codigo: 'DUPLICADO' };
    return { ok: false, error: 'Error al registrar movimiento de inventario', status: 500 };
  }

  return { ok: true, movimientoId: mov.id, stock: cas.nuevo };
}

/** Aplica un movimiento de stock + su registro en el Kardex de forma segura ante concurrencia. */
export async function registrarMovimiento(m: MovimientoStock): Promise<ResultadoMovimiento> {
  if (!Number.isInteger(m.delta)) {
    return { ok: false, error: 'Cantidad no válida', status: 400 };
  }
  if (rpcDisponible !== false || Date.now() >= rpcReintentarDesde) {
    const r = await movimientoPorRPC(m);
    if (r) return r;
  }
  return movimientoOptimista(m);
}

/**
 * Saldo neto de un LIO en una cirugía: nº de SALIDA_CIRUGIA − nº de DEVOLUCION.
 * > 0 → la cirugía tiene el lente consumido. Permite reasignar A → B → A
 * sin perder el descuento (antes bastaba con que existiera una SALIDA).
 */
async function saldoLIOCirugia(itemId: string, cirugiaId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from('inventario_movimientos')
    .select('tipo')
    .eq('referencia_tipo', 'CIRUGIA')
    .eq('referencia_id', cirugiaId)
    .eq('inventario_item_id', itemId)
    .in('tipo', ['SALIDA_CIRUGIA', 'DEVOLUCION'])
    .limit(200);
  let saldo = 0;
  for (const m of data ?? []) saldo += m.tipo === 'SALIDA_CIRUGIA' ? 1 : -1;
  return saldo;
}

/**
 * Consume 1 LIO from inventory when a surgery is completed.
 * Records a SALIDA_CIRUGIA movement in the Kardex. Idempotente por saldo neto de la cirugía.
 */
export async function consumirLIO(
  inventarioItemId: string,
  cirugiaId: string,
  usuarioId: string,
): Promise<ConsumirLIOResult> {
  const supabase = getSupabaseAdmin();

  const [saldo, itemRes] = await Promise.all([
    saldoLIOCirugia(inventarioItemId, cirugiaId),
    supabase.from('inventario_items').select('*').eq('id', inventarioItemId).maybeSingle(),
  ]);

  const item = itemRes.data as { stock: number; tipo?: string | null; tipo_lio?: string | null; potencia_dioptrias?: number | null } | null;
  if (!item) {
    return { success: false, error: 'Ítem de inventario no encontrado' };
  }
  if (saldo > 0) {
    return { success: true, stock_resultante: item.stock };
  }

  const esLIO =
    item.tipo === 'LENTE_INTRAOCULAR' ||
    item.tipo_lio != null ||
    item.potencia_dioptrias != null;
  if (!esLIO) {
    return { success: false, error: 'El ítem seleccionado no es un LIO' };
  }

  const r = await registrarMovimiento({
    itemId: inventarioItemId,
    delta: -1,
    tipo: 'SALIDA_CIRUGIA',
    usuarioId,
    referenciaTipo: 'CIRUGIA',
    referenciaId: cirugiaId,
    motivo: 'Consumo LIO por cirugía',
  });

  if (!r.ok) {
    if (r.codigo === 'DUPLICADO') return { success: true };
    if (r.codigo === 'STOCK_INSUFICIENTE') return { success: false, error: `Stock insuficiente. Disponible: ${item.stock}` };
    return { success: false, error: r.error };
  }
  return { success: true, movimiento_id: r.movimientoId ?? undefined, stock_resultante: r.stock };
}

/**
 * Release a reserved LIO back to inventory (e.g. when surgery is cancelled).
 * Records a DEVOLUCION movement in the Kardex. Idempotente por saldo neto de la cirugía.
 */
export async function liberarLIO(
  inventarioItemId: string,
  cirugiaId: string,
  usuarioId: string,
): Promise<ConsumirLIOResult> {
  const saldo = await saldoLIOCirugia(inventarioItemId, cirugiaId);
  if (saldo <= 0) {
    return { success: true };
  }

  const r = await registrarMovimiento({
    itemId: inventarioItemId,
    delta: 1,
    tipo: 'DEVOLUCION',
    usuarioId,
    referenciaTipo: 'CIRUGIA',
    referenciaId: cirugiaId,
    motivo: 'Devolución LIO por cancelación de cirugía',
  });

  if (!r.ok) {
    if (r.codigo === 'DUPLICADO') return { success: true };
    return { success: false, error: r.codigo === 'NO_ENCONTRADO' ? r.error : 'Error al registrar devolución' };
  }
  return { success: true, stock_resultante: r.stock };
}

/**
 * Siguiente folio de lente `LEN-AA-00001` a partir del mayor del año (no del
 * conteo: con borrados el conteo repetía folios). El insert debe reintentar si
 * choca con el índice único (23505).
 */
export async function siguienteFolioLente(intento = 0): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefijo = `LEN-${year}-`;
  const { data } = await getSupabaseAdmin()
    .from('inventario_items')
    .select('folio')
    .like('folio', `${prefijo}%`)
    .order('folio', { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.folio as string | undefined;
  const n = ultimo ? parseInt(ultimo.slice(prefijo.length), 10) || 0 : 0;
  return `${prefijo}${(n + 1 + intento).toString().padStart(5, '0')}`;
}
