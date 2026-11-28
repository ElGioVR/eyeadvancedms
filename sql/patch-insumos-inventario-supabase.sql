-- =====================================================================
-- Inventario de insumos (cassettes, medicamentos, material de curación…)
-- Aditivo e idempotente: no toca inventario_items (lentes).
--   insumo_ubicaciones  dónde está físicamente (Consultorio, CINTAR, …)
--   insumos             catálogo: nombre, categoría, presentación, stock mínimo
--   insumo_lotes        existencias por lote + caducidad + ubicación
--   insumo_movimientos  kardex (entrada, salida, ajuste, traslado, merma)
-- Los cambios de cantidad pasan SOLO por las funciones de abajo (atómicas).
-- =====================================================================

CREATE TABLE IF NOT EXISTS insumo_ubicaciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     varchar(80) NOT NULL,
  activa     boolean NOT NULL DEFAULT true,
  orden      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insumo_ubicaciones_nombre ON insumo_ubicaciones (lower(nombre));

INSERT INTO insumo_ubicaciones (nombre, orden)
SELECT v.nombre, v.orden FROM (VALUES ('Consultorio', 1), ('CINTAR', 2)) AS v(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM insumo_ubicaciones u WHERE lower(u.nombre) = lower(v.nombre));

CREATE TABLE IF NOT EXISTS insumos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        varchar(200) NOT NULL,
  categoria     varchar(30) NOT NULL DEFAULT 'OTRO'
                CHECK (categoria IN ('CASSETTE', 'MEDICAMENTO', 'MATERIAL_CURACION', 'DESECHABLE', 'OTRO')),
  presentacion  varchar(60),            -- pieza, caja c/10, frasco 5 ml…
  codigo        varchar(100),           -- código de barras / SKU
  fabricante    varchar(120),
  stock_minimo  integer NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  notas         text,
  activo        boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insumos_nombre_activo ON insumos (lower(nombre)) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_insumos_categoria ON insumos (categoria) WHERE activo;

CREATE TABLE IF NOT EXISTS insumo_lotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id        uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  ubicacion_id     uuid NOT NULL REFERENCES insumo_ubicaciones(id),
  lote             varchar(80),
  fecha_caducidad  date,
  cantidad         integer NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Un mismo lote/caducidad en la misma ubicación es un solo renglón.
CREATE UNIQUE INDEX IF NOT EXISTS uq_insumo_lotes_identidad
  ON insumo_lotes (insumo_id, ubicacion_id, coalesce(lote, ''), coalesce(fecha_caducidad, 'infinity'::date));
CREATE INDEX IF NOT EXISTS idx_insumo_lotes_caducidad ON insumo_lotes (fecha_caducidad) WHERE cantidad > 0;

CREATE TABLE IF NOT EXISTS insumo_movimientos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id             uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  lote_id               uuid REFERENCES insumo_lotes(id) ON DELETE SET NULL,
  tipo                  varchar(20) NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'TRASLADO', 'MERMA')),
  cantidad              integer NOT NULL,           -- con signo: + entra, − sale
  cantidad_resultante   integer,                    -- existencia del lote después
  ubicacion_id          uuid REFERENCES insumo_ubicaciones(id),
  ubicacion_destino_id  uuid REFERENCES insumo_ubicaciones(id),
  lote                  varchar(80),
  fecha_caducidad       date,
  motivo                text,
  usuario_id            uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insumo_movimientos_insumo ON insumo_movimientos (insumo_id, created_at DESC);

ALTER TABLE insumo_ubicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_lotes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_movimientos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON insumo_ubicaciones, insumos, insumo_lotes, insumo_movimientos TO service_role;

-- ---------------------------------------------------------------------
-- Entrada: suma al lote (lo crea si no existe) y registra el movimiento.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insumo_entrada(
  p_insumo_id uuid, p_ubicacion_id uuid, p_lote varchar, p_caducidad date,
  p_cantidad integer, p_usuario_id uuid, p_motivo text DEFAULT NULL
) RETURNS TABLE (lote_id uuid, cantidad_resultante integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lote uuid; v_cant integer; v_nom varchar := nullif(btrim(p_lote), '');
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  INSERT INTO insumo_lotes AS l (insumo_id, ubicacion_id, lote, fecha_caducidad, cantidad)
  VALUES (p_insumo_id, p_ubicacion_id, v_nom, p_caducidad, p_cantidad)
  ON CONFLICT (insumo_id, ubicacion_id, (coalesce(lote, '')), (coalesce(fecha_caducidad, 'infinity'::date)))
  DO UPDATE SET cantidad = l.cantidad + EXCLUDED.cantidad, updated_at = now()
  RETURNING l.id, l.cantidad INTO v_lote, v_cant;

  INSERT INTO insumo_movimientos (insumo_id, lote_id, tipo, cantidad, cantidad_resultante, ubicacion_id, lote, fecha_caducidad, motivo, usuario_id)
  VALUES (p_insumo_id, v_lote, 'ENTRADA', p_cantidad, v_cant, p_ubicacion_id, v_nom, p_caducidad, p_motivo, p_usuario_id);
  RETURN QUERY SELECT v_lote, v_cant;
END $$;

-- ---------------------------------------------------------------------
-- Salida / merma / ajuste sobre un lote (delta con signo). Nunca deja negativo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insumo_mover(
  p_lote_id uuid, p_delta integer, p_tipo varchar, p_usuario_id uuid, p_motivo text DEFAULT NULL
) RETURNS TABLE (lote_id uuid, cantidad_resultante integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l insumo_lotes%ROWTYPE;
BEGIN
  IF p_tipo NOT IN ('SALIDA', 'MERMA', 'AJUSTE') THEN RAISE EXCEPTION 'Tipo de movimiento no válido'; END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'La cantidad no puede ser cero'; END IF;
  IF p_tipo IN ('SALIDA', 'MERMA') AND p_delta > 0 THEN RAISE EXCEPTION 'Una salida debe restar piezas'; END IF;

  UPDATE insumo_lotes SET cantidad = cantidad + p_delta, updated_at = now()
   WHERE id = p_lote_id AND cantidad + p_delta >= 0
  RETURNING * INTO v_l;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM insumo_lotes WHERE id = p_lote_id) THEN
      RAISE EXCEPTION 'No hay suficientes piezas en ese lote' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'Lote no encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO insumo_movimientos (insumo_id, lote_id, tipo, cantidad, cantidad_resultante, ubicacion_id, lote, fecha_caducidad, motivo, usuario_id)
  VALUES (v_l.insumo_id, v_l.id, p_tipo, p_delta, v_l.cantidad, v_l.ubicacion_id, v_l.lote, v_l.fecha_caducidad, p_motivo, p_usuario_id);
  RETURN QUERY SELECT v_l.id, v_l.cantidad;
END $$;

-- ---------------------------------------------------------------------
-- Traslado entre ubicaciones (mismo lote y caducidad).
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

  INSERT INTO insumo_lotes AS l (insumo_id, ubicacion_id, lote, fecha_caducidad, cantidad)
  VALUES (v_o.insumo_id, p_destino_id, v_o.lote, v_o.fecha_caducidad, p_cantidad)
  ON CONFLICT (insumo_id, ubicacion_id, (coalesce(lote, '')), (coalesce(fecha_caducidad, 'infinity'::date)))
  DO UPDATE SET cantidad = l.cantidad + EXCLUDED.cantidad, updated_at = now()
  RETURNING l.id, l.cantidad INTO v_dest, v_cant_dest;

  INSERT INTO insumo_movimientos (insumo_id, lote_id, tipo, cantidad, cantidad_resultante, ubicacion_id, ubicacion_destino_id, lote, fecha_caducidad, motivo, usuario_id)
  VALUES (v_o.insumo_id, v_o.id, 'TRASLADO', -p_cantidad, v_o.cantidad, v_o.ubicacion_id, p_destino_id, v_o.lote, v_o.fecha_caducidad, p_motivo, p_usuario_id),
         (v_o.insumo_id, v_dest, 'TRASLADO', p_cantidad, v_cant_dest, p_destino_id, v_o.ubicacion_id, v_o.lote, v_o.fecha_caducidad, p_motivo, p_usuario_id);
  RETURN QUERY SELECT v_dest, v_cant_dest;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'insumo_entrada(uuid, uuid, varchar, date, integer, uuid, text)',
    'insumo_mover(uuid, integer, varchar, uuid, text)',
    'insumo_trasladar(uuid, uuid, integer, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
