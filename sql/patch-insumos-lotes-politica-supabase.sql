-- =====================================================================
-- Insumos · lote interno automático y política de salida (FEFO / FIFO / LIFO)
-- Requiere patch-insumos-inventario-supabase.sql. Aditivo e idempotente.
--   - Entrada sin lote → se genera un lote interno «INT-AAMMDD-XXXX».
--   - insumos.politica_salida: FEFO (caduca primero, por defecto), FIFO (entró primero), LIFO (entró al último).
--   - insumo_lotes.fecha_ingreso: antigüedad real del lote (se conserva al trasladar).
--   - insumo_salida_auto(): descuenta de varios lotes según la política, sin usar lotes vencidos.
-- =====================================================================

ALTER TABLE insumos ADD COLUMN IF NOT EXISTS politica_salida varchar(4) NOT NULL DEFAULT 'FEFO';
DO $$ BEGIN
  ALTER TABLE insumos ADD CONSTRAINT chk_insumos_politica_salida CHECK (politica_salida IN ('FEFO', 'FIFO', 'LIFO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE insumo_lotes ADD COLUMN IF NOT EXISTS lote_interno boolean NOT NULL DEFAULT false;
ALTER TABLE insumo_lotes ADD COLUMN IF NOT EXISTS fecha_ingreso timestamptz;
UPDATE insumo_lotes SET fecha_ingreso = created_at WHERE fecha_ingreso IS NULL;
ALTER TABLE insumo_lotes ALTER COLUMN fecha_ingreso SET DEFAULT now();
ALTER TABLE insumo_lotes ALTER COLUMN fecha_ingreso SET NOT NULL;

-- Lotes ya capturados sin número: reciben su código interno.
UPDATE insumo_lotes
   SET lote = 'INT-' || to_char(fecha_ingreso AT TIME ZONE 'America/Tijuana', 'YYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 4)),
       lote_interno = true
 WHERE lote IS NULL;
UPDATE insumo_movimientos m SET lote = l.lote
  FROM insumo_lotes l WHERE m.lote_id = l.id AND m.lote IS NULL AND l.lote_interno;

-- ---------------------------------------------------------------------
-- Entrada (reemplaza a la anterior): sin lote → lote interno nuevo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insumo_entrada(
  p_insumo_id uuid, p_ubicacion_id uuid, p_lote varchar, p_caducidad date,
  p_cantidad integer, p_usuario_id uuid, p_motivo text DEFAULT NULL
) RETURNS TABLE (lote_id uuid, cantidad_resultante integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_lote uuid; v_cant integer;
  v_nom varchar := nullif(btrim(p_lote), '');
  v_interno boolean := false;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  IF v_nom IS NULL THEN
    v_nom := 'INT-' || to_char(now() AT TIME ZONE 'America/Tijuana', 'YYMMDD') || '-' || upper(substr(replace(v_id::text, '-', ''), 1, 4));
    v_interno := true;
  END IF;

  INSERT INTO insumo_lotes AS l (id, insumo_id, ubicacion_id, lote, fecha_caducidad, cantidad, lote_interno, fecha_ingreso)
  VALUES (v_id, p_insumo_id, p_ubicacion_id, v_nom, p_caducidad, p_cantidad, v_interno, now())
  ON CONFLICT (insumo_id, ubicacion_id, (coalesce(lote, '')), (coalesce(fecha_caducidad, 'infinity'::date)))
  DO UPDATE SET cantidad = l.cantidad + EXCLUDED.cantidad, updated_at = now()
  RETURNING l.id, l.cantidad INTO v_lote, v_cant;

  INSERT INTO insumo_movimientos (insumo_id, lote_id, tipo, cantidad, cantidad_resultante, ubicacion_id, lote, fecha_caducidad, motivo, usuario_id)
  VALUES (p_insumo_id, v_lote, 'ENTRADA', p_cantidad, v_cant, p_ubicacion_id, v_nom, p_caducidad, p_motivo, p_usuario_id);
  RETURN QUERY SELECT v_lote, v_cant;
END $$;

-- ---------------------------------------------------------------------
-- Traslado (reemplaza al anterior): el lote destino conserva la antigüedad del origen.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insumo_trasladar(
  p_lote_id uuid, p_destino_id uuid, p_cantidad integer, p_usuario_id uuid, p_motivo text DEFAULT NULL
) RETURNS TABLE (lote_id uuid, cantidad_resultante integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o insumo_lotes%ROWTYPE; v_dest uuid; v_cant_dest integer;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  UPDATE insumo_lotes SET cantidad = cantidad - p_cantidad, updated_at = now()
   WHERE id = p_lote_id AND cantidad >= p_cantidad
  RETURNING * INTO v_o;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay suficientes piezas en ese lote' USING ERRCODE = 'P0001'; END IF;
  IF v_o.ubicacion_id = p_destino_id THEN RAISE EXCEPTION 'El destino es la misma ubicación'; END IF;

  INSERT INTO insumo_lotes AS l (insumo_id, ubicacion_id, lote, fecha_caducidad, cantidad, lote_interno, fecha_ingreso)
  VALUES (v_o.insumo_id, p_destino_id, v_o.lote, v_o.fecha_caducidad, p_cantidad, v_o.lote_interno, v_o.fecha_ingreso)
  ON CONFLICT (insumo_id, ubicacion_id, (coalesce(lote, '')), (coalesce(fecha_caducidad, 'infinity'::date)))
  DO UPDATE SET cantidad = l.cantidad + EXCLUDED.cantidad, fecha_ingreso = least(l.fecha_ingreso, EXCLUDED.fecha_ingreso), updated_at = now()
  RETURNING l.id, l.cantidad INTO v_dest, v_cant_dest;

  INSERT INTO insumo_movimientos (insumo_id, lote_id, tipo, cantidad, cantidad_resultante, ubicacion_id, ubicacion_destino_id, lote, fecha_caducidad, motivo, usuario_id)
  VALUES (v_o.insumo_id, v_o.id, 'TRASLADO', -p_cantidad, v_o.cantidad, v_o.ubicacion_id, p_destino_id, v_o.lote, v_o.fecha_caducidad, p_motivo, p_usuario_id),
         (v_o.insumo_id, v_dest, 'TRASLADO', p_cantidad, v_cant_dest, p_destino_id, v_o.ubicacion_id, v_o.lote, v_o.fecha_caducidad, p_motivo, p_usuario_id);
  RETURN QUERY SELECT v_dest, v_cant_dest;
END $$;

-- ---------------------------------------------------------------------
-- Salida automática: reparte la cantidad entre lotes según la política del insumo.
-- Nunca usa lotes vencidos (esos van por merma). p_ubicacion_id NULL = cualquier ubicación.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insumo_salida_auto(
  p_insumo_id uuid, p_cantidad integer, p_ubicacion_id uuid, p_usuario_id uuid, p_motivo text DEFAULT NULL
) RETURNS TABLE (lote_id uuid, lote_codigo varchar, tomadas integer, cantidad_resultante integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pol varchar; v_resta integer := p_cantidad; v_toma integer; v_disp integer; v_venc integer;
  v_hoy date := (now() AT TIME ZONE 'America/Tijuana')::date;
  r insumo_lotes%ROWTYPE;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  SELECT politica_salida INTO v_pol FROM insumos WHERE id = p_insumo_id AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado' USING ERRCODE = 'P0002'; END IF;

  SELECT coalesce(sum(cantidad) FILTER (WHERE fecha_caducidad IS NULL OR fecha_caducidad >= v_hoy), 0),
         coalesce(sum(cantidad) FILTER (WHERE fecha_caducidad < v_hoy), 0)
    INTO v_disp, v_venc
    FROM insumo_lotes
   WHERE insumo_id = p_insumo_id AND cantidad > 0 AND (p_ubicacion_id IS NULL OR ubicacion_id = p_ubicacion_id);
  IF v_disp < p_cantidad THEN
    RAISE EXCEPTION '%', 'Solo hay ' || v_disp || ' pieza(s) vigentes'
      || CASE WHEN v_venc > 0 THEN ' (más ' || v_venc || ' vencida(s): regístralas como merma)' ELSE '' END
      USING ERRCODE = 'P0001';
  END IF;

  FOR r IN
    SELECT * FROM insumo_lotes l
     WHERE l.insumo_id = p_insumo_id AND l.cantidad > 0
       AND (l.fecha_caducidad IS NULL OR l.fecha_caducidad >= v_hoy)
       AND (p_ubicacion_id IS NULL OR l.ubicacion_id = p_ubicacion_id)
     ORDER BY
       CASE WHEN v_pol = 'FEFO' THEN coalesce(l.fecha_caducidad, 'infinity'::date) END ASC,
       CASE WHEN v_pol = 'LIFO' THEN l.fecha_ingreso END DESC,
       l.fecha_ingreso ASC, l.id
     FOR UPDATE
  LOOP
    EXIT WHEN v_resta = 0;
    v_toma := least(v_resta, r.cantidad);
    UPDATE insumo_lotes SET cantidad = cantidad - v_toma, updated_at = now() WHERE id = r.id;
    INSERT INTO insumo_movimientos (insumo_id, lote_id, tipo, cantidad, cantidad_resultante, ubicacion_id, lote, fecha_caducidad, motivo, usuario_id)
    VALUES (r.insumo_id, r.id, 'SALIDA', -v_toma, r.cantidad - v_toma, r.ubicacion_id, r.lote, r.fecha_caducidad,
            coalesce(p_motivo, 'Salida') || ' · ' || v_pol, p_usuario_id);
    v_resta := v_resta - v_toma;
    lote_id := r.id; lote_codigo := r.lote; tomadas := v_toma; cantidad_resultante := r.cantidad - v_toma;
    RETURN NEXT;
  END LOOP;
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION insumo_salida_auto(uuid, integer, uuid, uuid, text) FROM PUBLIC;
  BEGIN REVOKE ALL ON FUNCTION insumo_salida_auto(uuid, integer, uuid, uuid, text) FROM anon, authenticated;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  GRANT EXECUTE ON FUNCTION insumo_salida_auto(uuid, integer, uuid, uuid, text) TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';
