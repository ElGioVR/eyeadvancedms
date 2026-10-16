-- =====================================================================
-- REINICIO DE DATOS DE PRUEBA — deja la BD lista para empezar a agendar
-- (y volver a cargar el Excel de cirugías desde cero).
--
-- BORRA: pacientes, consultas y estudios, cirugías y TODO lo que depende de
--        ellos por llave foránea (se detecta solo: conceptos, cobros, costos por
--        doctor, lentes apartados, equipo, archivos, historial, productividad…),
--        honorarios/liquidaciones generados, notificaciones y bitácoras.
-- CONSERVA: usuarios, médicos y personal, aseguradoras y sus servicios,
--        catálogos (cirugías, estudios, consultas, modelos de LIO, CIE-10…),
--        reglas y tarifas de honorarios, periodos de pago, configuración e
--        inventario (el stock que se descontó por cirugías de prueba se devuelve).
--
-- SEGURIDAD
--  * No hace nada hasta cambiar v_confirmar a 'BORRAR DATOS DE PRUEBA'.
--  * Antes de borrar copia todo a un esquema de respaldo (respaldo_reinicio_AAAAMMDD).
--  * Todo corre en un solo bloque: si algo falla, no se borra nada.
--  * Los ARCHIVOS adjuntos de cirugías viven en Storage (bucket «cirugias»):
--    bórralos en Supabase → Storage → cirugias (SQL no puede borrarlos).
--
-- USO (SQL Editor de Supabase)
--  1. Corre solo la PARTE 1 (vista previa) y revisa los conteos.
--  2. En la PARTE 2 cambia v_confirmar y corre la PARTE 2 completa.
--  3. Corre la PARTE 3 (verificación): todo debe quedar en 0.
-- =====================================================================


-- ─────────────────────────── PARTE 1: VISTA PREVIA ───────────────────────────
-- Solo lectura: lista TODAS las tablas que se vaciarán (también las que dependen
-- por llave foránea, p. ej. consulta_doctor_costo) y cuántas filas tienen.
DO $$
DECLARE
  v_raices text[] := ARRAY[
    'pacientes','consultas','agenda_cirugias','eventos_honorario','bitacora_honorarios',
    'liquidaciones_doctor','ajustes_liquidacion','notificaciones','agenda_import_log','sync_log','solicitudes_idempotentes'];
  v_conservar text[] := ARRAY[
    'usuarios','doctores','personal_clinico','aseguranzas','aseguranza_servicios','servicios_predeterminados',
    'inventario_items','inventario_movimientos','periodos_pago','configuracion_sistema','reglas_productividad_cirugia',
    'tarifas_doctor','matriz_costos','coberturas_aseguranza','permisos_archivo','notificacion_preferencias',
    'catalogo_quirurgico','catalogo_estudios','catalogo_consultas','catalogo_procedimientos','cat_modelos_lio',
    'cat_especialidades','cat_ojos','cat_recursos','cat_roles_participante'];
  v_set text[]; v_nuevas text[]; t text; n bigint; r record;
BEGIN
  SELECT array_agg(x) INTO v_set FROM unnest(v_raices) x WHERE to_regclass('public.' || x) IS NOT NULL;
  LOOP
    SELECT array_agg(DISTINCT c.conrelid::regclass::text) INTO v_nuevas
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid::regclass::text = ANY (v_set)
       AND NOT (c.conrelid::regclass::text = ANY (v_set))
       AND c.connamespace = 'public'::regnamespace;
    EXIT WHEN v_nuevas IS NULL;
    FOR r IN
      SELECT DISTINCT c.conrelid::regclass::text AS hija, c.confrelid::regclass::text AS padre
        FROM pg_constraint c
       WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY (v_set)
         AND c.conrelid::regclass::text = ANY (v_conservar) AND c.confdeltype NOT IN ('n', 'd')
    LOOP
      RAISE NOTICE 'ALTO: % (se conserva) depende de %; la PARTE 2 se detendrá. Avísale a soporte.', r.hija, r.padre;
    END LOOP;
    v_set := v_set || ARRAY(SELECT x FROM unnest(v_nuevas) x WHERE NOT (x = ANY (v_conservar)));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM unnest(v_nuevas) x WHERE NOT (x = ANY (v_conservar)));
  END LOOP;
  FOREACH t IN ARRAY v_set LOOP
    EXECUTE format('SELECT count(*) FROM %s', t::regclass) INTO n;
    RAISE NOTICE 'Se vaciará % → % filas', rpad(t, 40), n;
  END LOOP;
END $$;

-- Lentes que las cirugías de prueba descontaron del inventario (se devolverán):
SELECT i.id,
       COALESCE(to_jsonb(i)->>'marca', to_jsonb(i)->>'manufacturer') AS marca,
       COALESCE(to_jsonb(i)->>'modelo', to_jsonb(i)->>'model') AS modelo,
       COALESCE(to_jsonb(i)->>'potencia_dioptrias', to_jsonb(i)->>'sphere') AS dioptrias,
       i.stock AS stock_actual,
       sum(CASE m.tipo WHEN 'SALIDA_CIRUGIA' THEN m.cantidad WHEN 'DEVOLUCION' THEN -m.cantidad ELSE 0 END) AS piezas_a_devolver
  FROM inventario_movimientos m
  JOIN inventario_items i ON i.id = m.inventario_item_id
 WHERE m.referencia_tipo = 'CIRUGIA'
 GROUP BY i.id
HAVING sum(CASE m.tipo WHEN 'SALIDA_CIRUGIA' THEN m.cantidad WHEN 'DEVOLUCION' THEN -m.cantidad ELSE 0 END) <> 0
 ORDER BY 2, 3;


-- ─────────────────────────── PARTE 2: REINICIO ───────────────────────────
DO $$
DECLARE
  -- ⚠️ Cambia a 'BORRAR DATOS DE PRUEBA' para ejecutar.
  v_confirmar text := 'NO';
  -- Devolver al inventario las piezas que consumieron las cirugías de prueba.
  v_restaurar_inventario boolean := true;
  -- Médicos/personal creados AUTOMÁTICAMENTE por la importación (pendientes de completar).
  v_borrar_medicos_importados boolean := false;

  v_raices text[] := ARRAY[
    'pacientes','consultas','agenda_cirugias','eventos_honorario','bitacora_honorarios',
    'liquidaciones_doctor','ajustes_liquidacion','notificaciones','agenda_import_log','sync_log','solicitudes_idempotentes'];
  v_conservar text[] := ARRAY[
    'usuarios','doctores','personal_clinico','aseguranzas','aseguranza_servicios','servicios_predeterminados',
    'inventario_items','inventario_movimientos','periodos_pago','configuracion_sistema','reglas_productividad_cirugia',
    'tarifas_doctor','matriz_costos','coberturas_aseguranza','permisos_archivo','notificacion_preferencias',
    'catalogo_quirurgico','catalogo_estudios','catalogo_consultas','catalogo_procedimientos','cat_modelos_lio',
    'cat_especialidades','cat_ojos','cat_recursos','cat_roles_participante'];
  v_respaldo text := 'respaldo_reinicio_' || to_char(now() AT TIME ZONE 'America/Tijuana', 'YYYYMMDD_HH24MISS');
  v_set text[]; v_nuevas text[]; v_pendientes text[]; v_siguen text[]; v_vuelta int := 0;
  t text; n bigint; r record;
BEGIN
  IF v_confirmar IS DISTINCT FROM 'BORRAR DATOS DE PRUEBA' THEN
    RAISE EXCEPTION 'No se borró nada. Cambia v_confirmar a ''BORRAR DATOS DE PRUEBA'' para ejecutar el reinicio.';
  END IF;

  -- 0) Tablas a vaciar: las raíz + todas las que dependen de ellas por llave foránea.
  SELECT array_agg(x) INTO v_set FROM unnest(v_raices) x WHERE to_regclass('public.' || x) IS NOT NULL;
  LOOP
    SELECT array_agg(DISTINCT c.conrelid::regclass::text) INTO v_nuevas
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid::regclass::text = ANY (v_set)
       AND NOT (c.conrelid::regclass::text = ANY (v_set))
       AND c.connamespace = 'public'::regnamespace;
    EXIT WHEN v_nuevas IS NULL;
    -- Una tabla que se conserva y que bloquearía o se borraría en cascada: detenerse.
    FOR r IN
      SELECT c.conrelid::regclass::text AS hija, c.confrelid::regclass::text AS padre
        FROM pg_constraint c
       WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY (v_set)
         AND c.conrelid::regclass::text = ANY (v_conservar) AND c.confdeltype NOT IN ('n', 'd')
    LOOP
      RAISE EXCEPTION 'No se borró nada: la tabla % (que se conserva) depende de %. Avísale a soporte.', r.hija, r.padre;
    END LOOP;
    v_set := v_set || ARRAY(SELECT x FROM unnest(v_nuevas) x WHERE NOT (x = ANY (v_conservar)));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM unnest(v_nuevas) x WHERE NOT (x = ANY (v_conservar)));
  END LOOP;

  -- 1) Respaldo completo de lo que se va a borrar (y del inventario y médicos).
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_respaldo);
  FOREACH t IN ARRAY v_set || ARRAY['inventario_items','inventario_movimientos','doctores'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('CREATE TABLE %I.%I AS TABLE public.%I', v_respaldo, t, t);
    END IF;
  END LOOP;
  RAISE NOTICE 'Respaldo creado en el esquema %', v_respaldo;

  -- 2) Inventario: devuelve las piezas descontadas por cirugías (queda en el Kardex como DEVOLUCION).
  IF v_restaurar_inventario AND to_regclass('public.inventario_movimientos') IS NOT NULL THEN
    FOR r IN
      SELECT m.inventario_item_id AS item,
             sum(CASE m.tipo WHEN 'SALIDA_CIRUGIA' THEN m.cantidad WHEN 'DEVOLUCION' THEN -m.cantidad ELSE 0 END)::int AS piezas
        FROM inventario_movimientos m
       WHERE m.referencia_tipo = 'CIRUGIA'
       GROUP BY m.inventario_item_id
      HAVING sum(CASE m.tipo WHEN 'SALIDA_CIRUGIA' THEN m.cantidad WHEN 'DEVOLUCION' THEN -m.cantidad ELSE 0 END) > 0
    LOOP
      UPDATE inventario_items SET stock = COALESCE(stock, 0) + r.piezas WHERE id = r.item;
      INSERT INTO inventario_movimientos (inventario_item_id, tipo, cantidad, stock_resultante, referencia_tipo, motivo)
      SELECT r.item, 'DEVOLUCION', r.piezas, i.stock, 'REINICIO_DATOS', 'Reinicio de datos de prueba: se devuelve lo consumido por cirugías de prueba'
        FROM inventario_items i WHERE i.id = r.item;
    END LOOP;
    -- Los movimientos de cirugías borradas quedan en el Kardex marcados como de prueba
    -- (así una segunda ejecución no vuelve a devolver las mismas piezas).
    UPDATE inventario_movimientos SET referencia_tipo = 'CIRUGIA_PRUEBA', referencia_id = NULL
     WHERE referencia_tipo = 'CIRUGIA';
  END IF;

  -- 3) Borrado: en varias vueltas, primero lo que ya no tiene dependientes.
  v_pendientes := v_set;
  WHILE coalesce(array_length(v_pendientes, 1), 0) > 0 LOOP
    v_vuelta := v_vuelta + 1;
    v_siguen := ARRAY[]::text[];
    FOREACH t IN ARRAY v_pendientes LOOP
      BEGIN
        EXECUTE format('DELETE FROM %s', t::regclass);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN RAISE NOTICE 'Borrado % → % filas', rpad(t, 40), n; END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        v_siguen := v_siguen || t;
      END;
    END LOOP;
    IF coalesce(array_length(v_siguen, 1), 0) = array_length(v_pendientes, 1) THEN
      RAISE EXCEPTION 'No se borró nada: estas tablas siguen bloqueadas por otras dependencias: %', array_to_string(v_siguen, ', ');
    END IF;
    v_pendientes := v_siguen;
  END LOOP;

  -- 4) Médicos creados por la importación (opcional; solo los que no tienen usuario).
  IF v_borrar_medicos_importados AND to_regclass('public.doctores') IS NOT NULL THEN
    BEGIN
      EXECUTE 'DELETE FROM public.doctores WHERE pendiente_completar = true';
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE 'Médicos importados borrados → %', n;
    EXCEPTION WHEN undefined_column OR foreign_key_violation THEN
      RAISE NOTICE 'No se borraron médicos importados (en uso o sin columna pendiente_completar)';
    END;
  END IF;

  -- 5) Folios desde 1.
  IF to_regclass('public.seq_consulta_folio') IS NOT NULL THEN
    EXECUTE 'ALTER SEQUENCE public.seq_consulta_folio RESTART WITH 1';
  END IF;
  -- (El código de cirugía CIR-00001 se calcula solo a partir de las existentes.)

  RAISE NOTICE 'Reinicio terminado. Respaldo en %. Borra los archivos del bucket «cirugias» en Storage.', v_respaldo;
END $$;


-- ─────────────────────────── PARTE 3: VERIFICACIÓN ───────────────────────────
SELECT 'pacientes' AS tabla, count(*) FROM pacientes
UNION ALL SELECT 'consultas', count(*) FROM consultas
UNION ALL SELECT 'agenda_cirugias', count(*) FROM agenda_cirugias
UNION ALL SELECT 'cirugia_lentes', count(*) FROM cirugia_lentes
UNION ALL SELECT 'eventos_honorario', count(*) FROM eventos_honorario;

-- Si después de revisar todo está bien y ya no quieres el respaldo:
--   DROP SCHEMA respaldo_reinicio_AAAAMMDD_HHMMSS CASCADE;
