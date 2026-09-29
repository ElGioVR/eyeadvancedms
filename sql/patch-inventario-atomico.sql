-- ============================================================================
-- Patch: movimientos de inventario atómicos + blindajes de concurrencia
-- ----------------------------------------------------------------------------
-- 1. RPC registrar_movimiento_inventario: UPDATE del stock (sin bajar de 0) y
--    INSERT del movimiento Kardex en UNA transacción. Evita que dos usuarios
--    que mueven el mismo ítem a la vez pierdan un descuento.
-- 2. CHECK stock >= 0 (NOT VALID: aplica a filas nuevas/actualizadas sin
--    bloquear si hay datos históricos negativos).
-- 3. (Consumo/devolución de LIO: idempotencia por saldo neto en la app.)
-- 4. Índice único del folio de inventario (si no hay duplicados).
-- 5. Índices para búsquedas y listados frecuentes.
-- Idempotente: se puede ejecutar varias veces. Ejecutar en el SQL Editor.
-- La app funciona sin este patch (usa un camino optimista), pero con él es
-- 100 % transaccional.
-- ============================================================================

CREATE OR REPLACE FUNCTION registrar_movimiento_inventario(
  p_item_id         uuid,
  p_delta           integer,
  p_tipo            varchar,
  p_usuario_id      uuid,
  p_cantidad        integer DEFAULT NULL,
  p_referencia_tipo varchar DEFAULT NULL,
  p_referencia_id   uuid    DEFAULT NULL,
  p_motivo          text    DEFAULT NULL,
  p_costo_unitario  numeric DEFAULT NULL,
  p_proveedor_id    uuid    DEFAULT NULL
)
RETURNS TABLE (movimiento_id uuid, stock_resultante integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
  v_mov   uuid;
BEGIN
  IF p_tipo NOT IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION', 'SALIDA_CIRUGIA') THEN
    RAISE EXCEPTION 'TIPO_NO_VALIDO';
  END IF;

  UPDATE inventario_items
     SET stock = stock + p_delta
   WHERE id = p_item_id
     AND stock + p_delta >= 0
  RETURNING stock INTO v_stock;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM inventario_items WHERE id = p_item_id) THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE';
    ELSE
      RAISE EXCEPTION 'ITEM_NO_ENCONTRADO';
    END IF;
  END IF;

  INSERT INTO inventario_movimientos (
    inventario_item_id, tipo, cantidad, stock_resultante, usuario_id,
    referencia_tipo, referencia_id, motivo, costo_unitario, proveedor_id
  ) VALUES (
    p_item_id, p_tipo, COALESCE(p_cantidad, abs(p_delta)), v_stock, p_usuario_id,
    p_referencia_tipo, p_referencia_id, p_motivo, p_costo_unitario, p_proveedor_id
  )
  RETURNING id INTO v_mov;

  RETURN QUERY SELECT v_mov, v_stock;
END;
$$;

-- Solo el backend (service_role) puede llamarla; nunca desde el navegador.
REVOKE ALL ON FUNCTION registrar_movimiento_inventario(uuid, integer, varchar, uuid, integer, varchar, uuid, text, numeric, uuid) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION registrar_movimiento_inventario(uuid, integer, varchar, uuid, integer, varchar, uuid, text, numeric, uuid) FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION registrar_movimiento_inventario(uuid, integer, varchar, uuid, integer, varchar, uuid, text, numeric, uuid) TO service_role;

-- 2. Stock nunca negativo
DO $$ BEGIN
  ALTER TABLE inventario_items ADD CONSTRAINT chk_inventario_items_stock_no_negativo CHECK (stock >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. (Sin índices únicos por cirugía: un LIO puede reasignarse A → B → A.
--    La idempotencia se decide en la app por saldo neto SALIDA − DEVOLUCION.)
DROP INDEX IF EXISTS uq_inv_mov_cirugia_salida;
DROP INDEX IF EXISTS uq_inv_mov_cirugia_devolucion;

-- 4. Folio de inventario único
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_items_folio ON inventario_items (folio) WHERE folio IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Hay folios de inventario duplicados; revisar antes de crear uq_inventario_items_folio';
END $$;

-- 5. Índices de listados y búsquedas
CREATE INDEX IF NOT EXISTS idx_inv_mov_referencia ON inventario_movimientos (referencia_tipo, referencia_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item_created ON inventario_movimientos (inventario_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pacientes_created_at ON pacientes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_paciente_fecha ON consultas (paciente_id, fecha DESC);

-- Búsqueda por nombre/teléfono con ILIKE '%texto%' (trigramas)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre_trgm ON pacientes USING gin (nombre_completo gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
