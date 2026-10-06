-- ============================================================================
-- Performance y robustez (oct 2026) · migración 1800000000480
-- Ref.: claude/auditoria-performance-robustez-oct2026.md (proyecto «eye»)
--
-- Pegar COMPLETO en el SQL Editor de Supabase ANTES de desplegar el código de
-- la rama perf/robustez-oct2026. Idempotente (se puede correr varias veces) y
-- aditivo: no borra columnas ni datos.
--
-- El código funciona también SIN este script (cada función tiene respaldo):
-- con él se activan los caminos rápidos, la idempotencia, el límite compartido
-- y el tiempo real.
--
-- Bloques independientes: 1 índices · 2 índices compuestos · 3 resumen de
-- pacientes · 4 RPC del dashboard · 5 idempotencia · 6 límite de solicitudes ·
-- 7 tiempo real · 8 observabilidad y tareas programadas.
-- Correr fuera del horario de consulta (los índices bloquean unos segundos).
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 · Índices de búsqueda (hallazgos D1, D3)       SIN cambio de código
-- La búsqueda de pacientes y de la agenda usa ILIKE '%texto%' en varias
-- columnas; hoy solo nombre_completo tiene índice trigram → escaneo completo.
-- Nota: en el SQL Editor se usa CREATE INDEX normal (CONCURRENTLY no corre
-- en un bloque con varias sentencias). Con el tamaño actual el bloqueo dura
-- segundos; correrlo fuera de horario de consulta.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Pacientes: cada columna del OR necesita su propio índice para que Postgres
-- combine los resultados (BitmapOr) en vez de leer toda la tabla.
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre_trgm     ON pacientes USING gin (nombre_completo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefono_trgm   ON pacientes USING gin (telefono gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_email_trgm      ON pacientes USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_expediente_trgm ON pacientes USING gin (numero_expediente gin_trgm_ops);

DO $$
BEGIN
  -- telefonos_busqueda solo existe si ya se aplicó patch-telefonos-paciente
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'pacientes' AND column_name = 'telefonos_busqueda') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pacientes_tels_trgm ON pacientes USING gin (telefonos_busqueda gin_trgm_ops)';
  END IF;
END $$;

-- Agenda de cirugías: búsqueda por nombre y expediente.
CREATE INDEX IF NOT EXISTS idx_agenda_nombre_trgm     ON agenda_cirugias USING gin (nombre_paciente gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_agenda_expediente_trgm ON agenda_cirugias USING gin (expediente gin_trgm_ops);


-- ============================================================================
-- BLOQUE 2 · Índices compuestos y parciales (hallazgo D7)  SIN cambio de código
-- ============================================================================
-- Dashboard/charts: conteos por estatus de los últimos 30 días.
CREATE INDEX IF NOT EXISTS idx_consultas_fecha_estatus ON consultas (fecha, estatus);

-- Contador de no leídas (lo piden todos los usuarios cada 30 s).
CREATE INDEX IF NOT EXISTS idx_notificaciones_no_leidas
  ON notificaciones (user_id) WHERE leido = false;

-- Agenda: rango de fechas filtrando canceladas.
CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_fecha_estado ON agenda_cirugias (fecha, estado);

ANALYZE pacientes;
ANALYZE consultas;
ANALYZE agenda_cirugias;
ANALYZE notificaciones;


-- ============================================================================
-- BLOQUE 3 · Contadores precalculados en pacientes (hallazgo D2)
-- GET /api/pacientes lee pacientes.consultas_count y pacientes.ultima_visita
-- (sin las dos subconsultas embebidas por fila). Sin estas columnas usa el
-- camino anterior automáticamente.
--
-- Reglas (iguales a las de la API hoy):
--   consultas_count = todas las consultas del paciente
--   ultima_visita   = fecha máxima <= hoy (Tijuana) y estatus <> 'CANCELADA'
-- Como «hoy» avanza, una consulta futura se vuelve «última visita» al llegar
-- su día: lo cubre el job nocturno del bloque 8.
-- ============================================================================
ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS consultas_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_visita   date;

CREATE OR REPLACE FUNCTION recalcular_resumen_paciente(p_paciente_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE pacientes p
     SET consultas_count = s.total,
         ultima_visita   = s.ultima
    FROM (
      SELECT count(*)::int AS total,
             max(c.fecha) FILTER (
               WHERE c.fecha <= (now() AT TIME ZONE 'America/Tijuana')::date
                 AND coalesce(c.estatus::text, '') <> 'CANCELADA'
             ) AS ultima
        FROM consultas c
       WHERE c.paciente_id = p_paciente_id
    ) s
   WHERE p.id = p_paciente_id
     AND (p.consultas_count IS DISTINCT FROM s.total OR p.ultima_visita IS DISTINCT FROM s.ultima);
$$;

CREATE OR REPLACE FUNCTION trg_consultas_resumen_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.paciente_id IS NOT NULL THEN
    PERFORM recalcular_resumen_paciente(NEW.paciente_id);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.paciente_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.paciente_id IS DISTINCT FROM NEW.paciente_id) THEN
    PERFORM recalcular_resumen_paciente(OLD.paciente_id);
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION recalcular_resumen_paciente(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION recalcular_resumen_paciente(uuid) FROM anon, authenticated;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_consultas_resumen_paciente ON consultas;
CREATE TRIGGER trg_consultas_resumen_paciente
  AFTER INSERT OR DELETE OR UPDATE OF paciente_id, fecha, estatus ON consultas
  FOR EACH ROW EXECUTE FUNCTION trg_consultas_resumen_paciente();

-- Carga inicial (una sola vez; con decenas de miles de pacientes tarda segundos).
UPDATE pacientes p
   SET consultas_count = coalesce(s.total, 0),
       ultima_visita   = s.ultima
  FROM pacientes p2
  LEFT JOIN (
    SELECT paciente_id,
           count(*)::int AS total,
           max(fecha) FILTER (
             WHERE fecha <= (now() AT TIME ZONE 'America/Tijuana')::date
               AND coalesce(estatus::text, '') <> 'CANCELADA'
           ) AS ultima
      FROM consultas
     GROUP BY paciente_id
  ) s ON s.paciente_id = p2.id
 WHERE p.id = p2.id
   AND (p.consultas_count IS DISTINCT FROM coalesce(s.total, 0) OR p.ultima_visita IS DISTINCT FROM s.ultima);


-- ============================================================================
-- BLOQUE 4 · Gráficas del dashboard en un solo viaje (hallazgo D5)
-- /api/dashboard/charts: antes 11 conteos + hasta 10 000 filas de
-- procedimientos + 5 000 de agenda por refresco; ahora 1 RPC (y además el
-- servidor lo cachea 30 s). Misma forma de respuesta que la API.
-- Solo la ejecuta el servidor (service_role).
-- ============================================================================
DROP FUNCTION IF EXISTS dashboard_kpis(date, date, date);
DROP FUNCTION IF EXISTS dashboard_graficas(date, integer);

CREATE OR REPLACE FUNCTION dashboard_graficas(p_desde date, p_desde_agenda date, p_hasta date, p_top integer DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'consultasPorEstatus', coalesce((
      SELECT jsonb_object_agg(e, n) FROM (
        SELECT coalesce(nullif(estatus::text, ''), 'BORRADOR') AS e, count(*) AS n
          FROM consultas WHERE fecha >= p_desde
         GROUP BY 1
      ) t), '{}'::jsonb),
    'topProcedimientos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'cantidad', n) ORDER BY n DESC, nombre)
        FROM (
          SELECT btrim(procedimiento) AS nombre, count(*) AS n
            FROM consultas
           WHERE fecha >= p_desde AND procedimiento IS NOT NULL AND btrim(procedimiento) <> ''
           GROUP BY 1
           ORDER BY n DESC, 1
           LIMIT p_top
        ) t), '[]'::jsonb),
    'agendaOcupacion', coalesce((
      SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'cantidad', n) ORDER BY n DESC, nombre)
        FROM (
          SELECT coalesce(max(d.alias), 'Sin asignar') AS nombre, count(*) AS n
            FROM agenda_cirugias a
            LEFT JOIN doctores d ON d.id = a.doctor_id
           WHERE a.fecha BETWEEN p_desde_agenda AND p_hasta
           GROUP BY a.doctor_id
        ) t), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION dashboard_graficas(date, date, date, integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION dashboard_graficas(date, date, date, integer) FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION dashboard_graficas(date, date, date, integer) TO service_role;
  END IF;
END $$;


-- ============================================================================
-- BLOQUE 5 · Idempotencia en altas (hallazgo B5)
-- Nueva consulta, nueva cirugía y «Agendar estudio» mandan Idempotency-Key;
-- POST /api/consultas, /api/cirugias y /api/pacientes reservan la clave antes
-- de insertar y, si ya existía, devuelven la misma respuesta (sin duplicar).
-- ============================================================================
CREATE TABLE IF NOT EXISTS solicitudes_idempotentes (
  clave        uuid        PRIMARY KEY,
  usuario_id   uuid        NOT NULL,
  ruta         text        NOT NULL,
  estado       text        NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO', 'COMPLETADA')),
  status_http  integer,
  respuesta    jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_idem_created ON solicitudes_idempotentes (created_at);
ALTER TABLE solicitudes_idempotentes ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role

-- Reserva atómica: devuelve NULL si la clave es nueva (continuar), o la fila
-- existente (responder con lo guardado / 409 si sigue EN_CURSO).
CREATE OR REPLACE FUNCTION reservar_idempotencia(p_clave uuid, p_usuario uuid, p_ruta text)
RETURNS solicitudes_idempotentes
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v solicitudes_idempotentes;
BEGIN
  INSERT INTO solicitudes_idempotentes (clave, usuario_id, ruta)
  VALUES (p_clave, p_usuario, p_ruta)
  ON CONFLICT (clave) DO NOTHING;
  IF FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v FROM solicitudes_idempotentes WHERE clave = p_clave;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION reservar_idempotencia(uuid, uuid, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION reservar_idempotencia(uuid, uuid, text) FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION reservar_idempotencia(uuid, uuid, text) TO service_role;
  END IF;
END $$;


-- ============================================================================
-- BLOQUE 6 · Límite de solicitudes compartido entre instancias (B3, B8)
-- Lo usa lib/rate-limit.ts (login y endpoints costosos). Sin esta función la
-- app usa el límite en memoria por instancia (comportamiento anterior).
-- UNLOGGED: más rápida; si Postgres se reinicia los contadores se vacían
-- (aceptable para un límite de tasa).
--   p_accion = 'consultar' → solo dice si la clave está bloqueada
--              'fallo'     → suma 1; bloquea al llegar a p_max (login)
--              'consumir'  → suma 1; bloquea al pasar de p_max (uso normal)
-- ============================================================================
DROP FUNCTION IF EXISTS consumir_limite(text, integer, integer);

CREATE UNLOGGED TABLE IF NOT EXISTS limites_tasa (
  clave           text        PRIMARY KEY,
  ventana_inicio  timestamptz NOT NULL,
  conteo          integer     NOT NULL,
  bloqueado_hasta timestamptz
);
ALTER TABLE limites_tasa ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role

CREATE OR REPLACE FUNCTION limite_tasa(p_clave text, p_max integer, p_ventana_seg integer, p_accion text DEFAULT 'consumir')
RETURNS TABLE (permitido boolean, reintentar_en integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ahora timestamptz := clock_timestamp();
  v limites_tasa;
BEGIN
  IF p_accion = 'consultar' THEN
    SELECT * INTO v FROM limites_tasa WHERE clave = p_clave;
    IF FOUND AND v.bloqueado_hasta IS NOT NULL AND v.bloqueado_hasta > v_ahora THEN
      RETURN QUERY SELECT false, ceil(extract(epoch FROM v.bloqueado_hasta - v_ahora))::int;
    ELSE
      RETURN QUERY SELECT true, 0;
    END IF;
    RETURN;
  END IF;

  INSERT INTO limites_tasa AS l (clave, ventana_inicio, conteo)
  VALUES (p_clave, v_ahora, 1)
  ON CONFLICT (clave) DO UPDATE
     SET conteo = CASE
                    WHEN l.bloqueado_hasta IS NOT NULL AND l.bloqueado_hasta > v_ahora THEN l.conteo
                    WHEN l.ventana_inicio + make_interval(secs => p_ventana_seg) < v_ahora
                      OR (l.bloqueado_hasta IS NOT NULL AND l.bloqueado_hasta <= v_ahora) THEN 1
                    ELSE l.conteo + 1
                  END,
         ventana_inicio = CASE
                    WHEN l.bloqueado_hasta IS NOT NULL AND l.bloqueado_hasta > v_ahora THEN l.ventana_inicio
                    WHEN l.ventana_inicio + make_interval(secs => p_ventana_seg) < v_ahora
                      OR (l.bloqueado_hasta IS NOT NULL AND l.bloqueado_hasta <= v_ahora) THEN v_ahora
                    ELSE l.ventana_inicio
                  END,
         bloqueado_hasta = CASE
                    WHEN l.bloqueado_hasta IS NOT NULL AND l.bloqueado_hasta > v_ahora THEN l.bloqueado_hasta
                    ELSE NULL
                  END
  RETURNING * INTO v;

  IF v.bloqueado_hasta IS NULL
     AND ((p_accion = 'fallo' AND v.conteo >= p_max) OR (p_accion <> 'fallo' AND v.conteo > p_max)) THEN
    UPDATE limites_tasa SET bloqueado_hasta = v_ahora + make_interval(secs => p_ventana_seg)
     WHERE clave = p_clave RETURNING * INTO v;
  END IF;

  IF v.bloqueado_hasta IS NOT NULL AND v.bloqueado_hasta > v_ahora THEN
    RETURN QUERY SELECT false, ceil(extract(epoch FROM v.bloqueado_hasta - v_ahora))::int;
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END $$;

-- Login exitoso: limpiar el contador de esa clave.
CREATE OR REPLACE FUNCTION reiniciar_limite(p_clave text)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  DELETE FROM limites_tasa WHERE clave = p_clave;
$$;

REVOKE ALL ON FUNCTION limite_tasa(text, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION reiniciar_limite(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION limite_tasa(text, integer, integer, text) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION reiniciar_limite(text) FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION limite_tasa(text, integer, integer, text) TO service_role;
    GRANT EXECUTE ON FUNCTION reiniciar_limite(text) TO service_role;
  END IF;
END $$;


-- ============================================================================
-- BLOQUE 7 · Avisos en tiempo real sin exponer datos clínicos (hallazgo F7)
-- El front (components/providers/TiempoReal.tsx) escucha el canal privado
-- 'cambios-clinica' y revalida agenda/consultas/dashboard; mientras está
-- conectado, el polling de 30 s pasa a 2 min como respaldo.
-- Se usa Realtime Broadcast desde la BD (realtime.send) con un payload
-- mínimo {tabla, op, id, fecha}: los datos se siguen pidiendo a la API, así
-- no viaja información del paciente por el canal.
-- Solo se crea si el proyecto tiene el esquema realtime de Supabase.
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE NOTICE 'realtime.send no existe en esta BD: se omite el bloque 7';
    RETURN;
  END IF;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.avisar_cambio_clinica()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $b$
    DECLARE
      r record := coalesce(NEW, OLD);
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('tabla', TG_TABLE_NAME, 'op', TG_OP, 'id', r.id,
                           'fecha', CASE WHEN TG_TABLE_NAME IN ('consultas', 'agenda_cirugias') THEN to_jsonb(r) -> 'fecha' END),
        'cambio', 'cambios-clinica', true);
      RETURN NULL;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;   -- un fallo de Realtime nunca debe bloquear el guardado
    END $b$;
  $f$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_avisar_cambio_consultas ON consultas';
  EXECUTE 'CREATE TRIGGER trg_avisar_cambio_consultas AFTER INSERT OR UPDATE OR DELETE ON consultas
             FOR EACH ROW EXECUTE FUNCTION public.avisar_cambio_clinica()';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_avisar_cambio_agenda ON agenda_cirugias';
  EXECUTE 'CREATE TRIGGER trg_avisar_cambio_agenda AFTER INSERT OR UPDATE OR DELETE ON agenda_cirugias
             FOR EACH ROW EXECUTE FUNCTION public.avisar_cambio_clinica()';

  -- Solo usuarios autenticados y activos pueden escuchar el canal privado.
  EXECUTE 'DROP POLICY IF EXISTS "usuarios activos escuchan cambios-clinica" ON realtime.messages';
  EXECUTE $p$
    CREATE POLICY "usuarios activos escuchan cambios-clinica" ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.topic() = 'cambios-clinica'
        AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.activo IS TRUE)
      )
  $p$;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para Realtime: se omite el bloque 7 (la app sigue con el refresco automático)';
END $$;
-- Las notificaciones por usuario pueden seguir el mismo patrón con un canal
-- 'notif-<user_id>' (se diseña junto con el cambio de código).


-- ============================================================================
-- BLOQUE 8 · Observabilidad, límites de tiempo y limpieza (B4, O3, 2.4)
-- ============================================================================
-- 8.1 Estadísticas de consultas (Supabase ya la trae; esto solo asegura).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 8.2 Health check liviano para /api/health y el monitor externo.
CREATE OR REPLACE FUNCTION salud()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object('ok', true, 'hora', now());
$$;
REVOKE ALL ON FUNCTION salud() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION salud() FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION salud() TO service_role;
  END IF;
END $$;

-- 8.3 Tope de tiempo por sentencia para el rol del servidor: una consulta
-- atorada se corta a los 30 s en vez de colgar la función (complementa el
-- límite de 25 s del lado de la app). Imports y sync van por lotes cortos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER ROLE service_role SET statement_timeout = '30s';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para ALTER ROLE service_role: se omite el statement_timeout';
END $$;

-- 8.4 Jobs con pg_cron (solo si la extensión está activa en el proyecto).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no está activo: activarlo en Database → Extensions y volver a correr este bloque';
    RETURN;
  END IF;

  -- 00:10 Tijuana (07:10 UTC; en horario de invierno queda 23:10 del día anterior,
  -- igual cubre el cambio de día): consultas de hoy pasan a «última visita».
  PERFORM cron.schedule('resumen-pacientes-diario', '10 7 * * *', $j$
    SELECT recalcular_resumen_paciente(paciente_id)
      FROM (SELECT DISTINCT paciente_id FROM consultas
             WHERE paciente_id IS NOT NULL
               AND fecha BETWEEN (now() AT TIME ZONE 'America/Tijuana')::date - 1
                             AND (now() AT TIME ZONE 'America/Tijuana')::date) t
  $j$);

  -- Claves de idempotencia de más de 24 h.
  PERFORM cron.schedule('limpiar-idempotencia', '20 * * * *',
    $j$DELETE FROM solicitudes_idempotentes WHERE created_at < now() - interval '24 hours'$j$);

  -- Contadores de límite vencidos.
  PERFORM cron.schedule('limpiar-limites-tasa', '*/15 * * * *',
    $j$DELETE FROM limites_tasa
        WHERE (bloqueado_hasta IS NULL OR bloqueado_hasta < now())
          AND ventana_inicio < now() - interval '1 hour'$j$);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para pg_cron: crea los 3 jobs desde Integrations > Cron o avisa a soporte';
END $$;


-- ============================================================================
-- VERIFICACIÓN (solo lectura)
-- ============================================================================
SELECT 'indices_trgm' AS que, count(*) AS n FROM pg_indexes
 WHERE indexname IN ('idx_pacientes_telefono_trgm','idx_pacientes_email_trgm','idx_pacientes_expediente_trgm',
                     'idx_pacientes_tels_trgm','idx_agenda_nombre_trgm','idx_agenda_expediente_trgm')
UNION ALL
SELECT 'pacientes_con_resumen', count(*) FROM pacientes WHERE consultas_count > 0
UNION ALL
SELECT 'funciones_nuevas', count(*) FROM pg_proc
 WHERE proname IN ('recalcular_resumen_paciente','dashboard_graficas',
                   'reservar_idempotencia','limite_tasa','reiniciar_limite','salud');

-- Top 10 consultas más costosas (revisar antes y 1 semana después):
-- SELECT round(total_exec_time) AS ms_total, calls, round(mean_exec_time::numeric, 1) AS ms_prom,
--        left(query, 120) AS consulta
--   FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
