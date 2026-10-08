-- =====================================================================
-- Comentarios clínica (oct 2026) — Fase 1: funciones de reserva de lentes.
-- Requiere: sql/patch-cirugia-lentes-reservas-supabase.sql (tabla cirugia_lentes).
-- Idempotente (CREATE OR REPLACE). Ejecutar manualmente en Supabase.
-- Reglas:
--  * Reservar NO cambia stock físico ni Kardex; solo bloquea 1 pieza.
--  * Disponible = stock − reservas RESERVADO activas (de otras cirugías).
--  * El consumo real (SALIDA_CIRUGIA) se hace al completar, en la app.
-- =====================================================================

CREATE OR REPLACE FUNCTION reservar_lente_cirugia(
  p_cirugia_id uuid,
  p_orden      text,
  p_origen     text,
  p_item_id    uuid,
  p_fabricante text,
  p_modelo     text,
  p_poder      numeric,
  p_torico     boolean
)
RETURNS SETOF cirugia_lentes
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stock     integer;
  v_reservado integer;
  v_estado    text;
BEGIN
  IF p_orden NOT IN ('PRIMERO', 'SEGUNDO', 'RESPALDO') THEN
    RAISE EXCEPTION 'ORDEN_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  IF p_origen NOT IN ('INVENTARIO', 'HOSPITAL') THEN
    RAISE EXCEPTION 'ORIGEN_INVALIDO' USING ERRCODE = 'P0001';
  END IF;

  -- Estado actual del lente de esta cirugía/orden (no se puede reservar uno ya usado).
  SELECT estado INTO v_estado FROM cirugia_lentes
   WHERE cirugia_id = p_cirugia_id AND orden = p_orden;
  IF v_estado = 'USADO' THEN
    RAISE EXCEPTION 'LENTE_YA_USADO' USING ERRCODE = 'P0001';
  END IF;

  IF p_origen = 'INVENTARIO' THEN
    IF p_item_id IS NULL THEN
      RAISE EXCEPTION 'ITEM_REQUERIDO' USING ERRCODE = 'P0001';
    END IF;
    -- Bloqueo de la fila del ítem: serializa reservas concurrentes del mismo modelo.
    SELECT stock INTO v_stock FROM inventario_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NO_ENCONTRADO' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO v_reservado FROM cirugia_lentes
     WHERE inventario_item_id = p_item_id
       AND estado = 'RESERVADO'
       AND NOT (cirugia_id = p_cirugia_id AND orden = p_orden);
    IF COALESCE(v_stock, 0) - v_reservado <= 0 THEN
      RAISE EXCEPTION 'LENTE_SIN_DISPONIBLE' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN QUERY
  INSERT INTO cirugia_lentes AS cl (
    cirugia_id, orden, origen, inventario_item_id, fabricante, modelo,
    poder_d, torico, estado, requerido, updated_at
  ) VALUES (
    p_cirugia_id, p_orden, p_origen,
    CASE WHEN p_origen = 'INVENTARIO' THEN p_item_id ELSE NULL END,
    p_fabricante, p_modelo, p_poder, COALESCE(p_torico, false),
    'RESERVADO', false, now()
  )
  ON CONFLICT (cirugia_id, orden) DO UPDATE SET
    origen = EXCLUDED.origen,
    inventario_item_id = EXCLUDED.inventario_item_id,
    fabricante = EXCLUDED.fabricante,
    modelo = EXCLUDED.modelo,
    poder_d = EXCLUDED.poder_d,
    torico = EXCLUDED.torico,
    estado = 'RESERVADO',
    requerido = false,
    updated_at = now()
  RETURNING cl.*;
END;
$$;

-- Libera las reservas de una cirugía (cancelar, reagendar o cambiar lente).
-- p_orden NULL = todas las reservas de la cirugía.
CREATE OR REPLACE FUNCTION liberar_lentes_cirugia(
  p_cirugia_id uuid,
  p_orden      text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE cirugia_lentes
     SET estado = 'LIBERADO', requerido = false, updated_at = now()
   WHERE cirugia_id = p_cirugia_id
     AND estado = 'RESERVADO'
     AND (p_orden IS NULL OR orden = p_orden);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Verificación: ambas funciones deben aparecer
SELECT proname FROM pg_proc
 WHERE proname IN ('reservar_lente_cirugia', 'liberar_lentes_cirugia') ORDER BY proname;
