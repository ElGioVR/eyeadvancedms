-- =====================================================================
-- RESTAURAR DESDE EL RESPALDO DEL REINICIO (deshace REINICIO-EJECUTAR.sql)
--
-- Copia TODO este archivo en el SQL Editor de Supabase y dale Run una vez.
--
-- Qué hace:
--  * Usa el respaldo más reciente (esquema respaldo_reinicio_AAAAMMDD_HHMMSS)
--    o el que pongas en v_respaldo.
--  * Regresa pacientes, consultas, estudios, cirugías y todo lo que se borró.
--  * Inventario: deja el stock como estaba antes del reinicio y quita la
--    devolución «REINICIO_DATOS» del Kardex.
--  * Médicos: vuelve a agregar los que se hubieran borrado (no toca los demás).
--  * Folio de consultas: continúa después del mayor folio restaurado.
--  * Todo en un solo bloque: si algo falla, no se cambia nada.
--
-- Seguridad: si ya cargaste datos nuevos (hay pacientes o cirugías), se detiene
-- para no mezclar. Para restaurar de todos modos pon v_forzar := true.
-- Los ARCHIVOS de Storage no se restauran (SQL no puede); si los borraste,
-- súbelos de nuevo desde el detalle de cada cirugía.
-- =====================================================================
DO $$
DECLARE
  v_respaldo text := NULL;   -- NULL = el más reciente; o p. ej. 'respaldo_reinicio_20261016_161821'
  v_forzar boolean := false;

  v_tablas text[]; v_pendientes text[]; v_siguen text[];
  t text; n bigint; v_cols text; v_replica boolean := false;
  v_especiales text[] := ARRAY['inventario_items','inventario_movimientos','doctores'];
BEGIN
  IF v_respaldo IS NULL THEN
    SELECT nspname INTO v_respaldo FROM pg_namespace
     WHERE nspname LIKE 'respaldo_reinicio_%' ORDER BY nspname DESC LIMIT 1;
  END IF;
  IF v_respaldo IS NULL OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_respaldo) THEN
    RAISE EXCEPTION 'No hay respaldo para restaurar (no existe ningún esquema respaldo_reinicio_…).';
  END IF;
  RAISE NOTICE 'Restaurando desde %', v_respaldo;

  IF NOT v_forzar AND (
       (to_regclass('public.pacientes') IS NOT NULL AND EXISTS (SELECT 1 FROM public.pacientes))
    OR (to_regclass('public.agenda_cirugias') IS NOT NULL AND EXISTS (SELECT 1 FROM public.agenda_cirugias))) THEN
    RAISE EXCEPTION 'No se restauró nada: ya hay pacientes o cirugías nuevos. Si de todos modos quieres restaurar (se mezclan), pon v_forzar := true.';
  END IF;

  -- Sin disparadores ni validaciones de empalme mientras se reinsertan datos que ya eran válidos.
  BEGIN
    EXECUTE 'SET LOCAL session_replication_role = replica';
    v_replica := true;
  EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
    v_replica := false;
  END;

  -- Tablas del respaldo que existen en public (excepto inventario y médicos, que se tratan aparte).
  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO v_tablas
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = v_respaldo AND c.relkind = 'r'
     AND to_regclass('public.' || quote_ident(c.relname)) IS NOT NULL
     AND NOT (c.relname::text = ANY (v_especiales));

  -- Médicos primero (las citas apuntan a ellos): solo los que falten.
  IF to_regclass(format('%I.doctores', v_respaldo)) IS NOT NULL THEN
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
      FROM pg_attribute a
     WHERE a.attrelid = format('%I.doctores', v_respaldo)::regclass AND a.attnum > 0 AND NOT a.attisdropped
       AND EXISTS (SELECT 1 FROM pg_attribute b WHERE b.attrelid = 'public.doctores'::regclass AND b.attname = a.attname AND NOT b.attisdropped AND b.attgenerated = '');
    EXECUTE format('INSERT INTO public.doctores (%s) SELECT %s FROM %I.doctores ON CONFLICT DO NOTHING', v_cols, v_cols, v_respaldo);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'Médicos regresados → %', n; END IF;
  END IF;

  -- Datos borrados: en varias vueltas (padres antes que hijos).
  v_pendientes := v_tablas;
  WHILE coalesce(array_length(v_pendientes, 1), 0) > 0 LOOP
    v_siguen := ARRAY[]::text[];
    FOREACH t IN ARRAY v_pendientes LOOP
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
        FROM pg_attribute a
       WHERE a.attrelid = format('%I.%I', v_respaldo, t)::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND EXISTS (SELECT 1 FROM pg_attribute b WHERE b.attrelid = format('public.%I', t)::regclass AND b.attname = a.attname AND NOT b.attisdropped AND b.attgenerated = '');
      BEGIN
        EXECUTE format('INSERT INTO public.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM %I.%I ON CONFLICT DO NOTHING', t, v_cols, v_cols, v_respaldo, t);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN RAISE NOTICE 'Restaurado % → % filas', rpad(t, 40), n; END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        v_siguen := v_siguen || t;
      END;
    END LOOP;
    IF coalesce(array_length(v_siguen, 1), 0) = array_length(v_pendientes, 1) THEN
      RAISE EXCEPTION 'No se restauró nada: estas tablas no se pudieron reinsertar por dependencias: %', array_to_string(v_siguen, ', ');
    END IF;
    v_pendientes := v_siguen;
  END LOOP;

  -- Inventario: stock y Kardex como estaban antes del reinicio.
  IF to_regclass(format('%I.inventario_items', v_respaldo)) IS NOT NULL THEN
    EXECUTE format('UPDATE public.inventario_items i SET stock = r.stock FROM %I.inventario_items r WHERE r.id = i.id AND i.stock IS DISTINCT FROM r.stock', v_respaldo);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'Stock regresado en % lente(s)', n; END IF;
  END IF;
  IF to_regclass(format('%I.inventario_movimientos', v_respaldo)) IS NOT NULL THEN
    DELETE FROM public.inventario_movimientos WHERE referencia_tipo = 'REINICIO_DATOS';
    EXECUTE format('UPDATE public.inventario_movimientos m SET referencia_tipo = r.referencia_tipo, referencia_id = r.referencia_id
                      FROM %I.inventario_movimientos r
                     WHERE r.id = m.id AND m.referencia_tipo = ''CIRUGIA_PRUEBA''', v_respaldo);
  END IF;

  -- Folio de consultas: después del mayor restaurado.
  IF to_regclass('public.seq_consulta_folio') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT setval(''public.seq_consulta_folio'', GREATEST(1, COALESCE((SELECT max(folio::bigint) FROM public.consultas), 0)), (SELECT count(*) > 0 FROM public.consultas))';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Folio de consultas no ajustado (revisa el formato del folio).';
    END;
  END IF;

  RAISE NOTICE 'Restauración terminada desde % (modo %).', v_respaldo, CASE WHEN v_replica THEN 'sin disparadores' ELSE 'con disparadores' END;
END $$;

-- Verificación: conteos después de restaurar.
SELECT 'pacientes' AS tabla, count(*) FROM pacientes
UNION ALL SELECT 'consultas', count(*) FROM consultas
UNION ALL SELECT 'agenda_cirugias', count(*) FROM agenda_cirugias
UNION ALL SELECT 'cirugia_lentes', count(*) FROM cirugia_lentes
UNION ALL SELECT 'eventos_honorario', count(*) FROM eventos_honorario;
