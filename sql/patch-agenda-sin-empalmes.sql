-- =====================================================================
-- Agenda sin empalmes (Modificaciones agenda, punto III)
-- Mismo contenido que src/migrations/1800000000320-AgendaSinEmpalmesConsultas.ts
-- Idempotente. Aplicar SOLO tras revisión; primero en BD local desechable.
--
-- Cierra la carrera "check-then-insert" de lib/agenda-conflictos.ts:
-- un trigger BEFORE INSERT/UPDATE toma un advisory lock por (médico, fecha)
-- y rechaza la fila si se traslapa con otra consulta no cancelada del mismo
-- médico. Dos inserts simultáneos quedan serializados: el segundo ve al
-- primero y falla con SQLSTATE 23P01 (mensaje EMPALME_AGENDA) → la API
-- responde 409.
--
-- consultas.permite_empalme = true desactiva la regla para esa fila
-- (importación histórica de entradas/salidas y, a futuro, sobrecupo
-- autorizado por admin). Filas existentes no se revalidan.
-- =====================================================================

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS permite_empalme BOOLEAN NOT NULL DEFAULT false;

-- El índice idx_consultas_doctor_fecha (mig. 1800000000140) cubre la búsqueda del trigger.

CREATE OR REPLACE FUNCTION consultas_validar_empalme()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fin_nuevo time;
  v_choque    record;
BEGIN
  IF NEW.permite_empalme
     OR NEW.doctor_id IS NULL
     OR NEW.fecha IS NULL
     OR NEW.hora_inicio IS NULL
     OR COALESCE(NEW.estatus, '') = 'CANCELADA' THEN
    RETURN NEW;
  END IF;

  -- Serializa altas/movimientos concurrentes del mismo médico en el mismo día.
  PERFORM pg_advisory_xact_lock(
    hashtext('agenda:' || NEW.doctor_id::text || ':' || NEW.fecha::text)
  );

  v_fin_nuevo := COALESCE(NEW.hora_fin, NEW.hora_inicio + interval '15 minutes');

  SELECT c.id, c.hora_inicio, c.hora_fin
    INTO v_choque
    FROM consultas c
   WHERE c.doctor_id = NEW.doctor_id
     AND c.fecha = NEW.fecha
     AND c.id IS DISTINCT FROM NEW.id
     AND COALESCE(c.estatus, '') <> 'CANCELADA'
     AND c.hora_inicio IS NOT NULL
     AND c.hora_inicio < v_fin_nuevo
     AND COALESCE(c.hora_fin, c.hora_inicio + interval '15 minutes') > NEW.hora_inicio
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'EMPALME_AGENDA'
      USING ERRCODE = '23P01',
            DETAIL = format('consulta_id=%s hora_inicio=%s hora_fin=%s',
                            v_choque.id, v_choque.hora_inicio, v_choque.hora_fin);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_ins ON consultas;
CREATE TRIGGER trg_consultas_validar_empalme_ins
  BEFORE INSERT ON consultas
  FOR EACH ROW EXECUTE FUNCTION consultas_validar_empalme();

-- En UPDATE solo se valida si cambia el horario, el médico o se reactiva una
-- cancelada; así completar/cobrar citas antiguas ya empalmadas no falla.
DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_upd ON consultas;
CREATE TRIGGER trg_consultas_validar_empalme_upd
  BEFORE UPDATE ON consultas
  FOR EACH ROW
  WHEN (
       OLD.fecha IS DISTINCT FROM NEW.fecha
    OR OLD.hora_inicio IS DISTINCT FROM NEW.hora_inicio
    OR OLD.hora_fin IS DISTINCT FROM NEW.hora_fin
    OR OLD.doctor_id IS DISTINCT FROM NEW.doctor_id
    OR (OLD.estatus = 'CANCELADA' AND NEW.estatus IS DISTINCT FROM 'CANCELADA')
  )
  EXECUTE FUNCTION consultas_validar_empalme();
