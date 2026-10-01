import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Agenda sin empalmes (Modificaciones agenda, punto III).
 * Trigger BEFORE INSERT/UPDATE en consultas con advisory lock por
 * (doctor_id, fecha): rechaza traslapes del mismo médico con SQLSTATE 23P01
 * ('EMPALME_AGENDA'); la API lo traduce a 409. Columna permite_empalme para
 * importaciones históricas / sobrecupo autorizado.
 * Mismo contenido que sql/patch-agenda-sin-empalmes.sql (idempotente).
 *
 * IMPORTANTE: aplicar ANTES de desplegar el código que envía permite_empalme
 * en la importación de consultas.
 */
export class AgendaSinEmpalmesConsultas1800000000320 implements MigrationInterface {
  name = 'AgendaSinEmpalmesConsultas1800000000320';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_upd ON consultas;
DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_ins ON consultas;
DROP FUNCTION IF EXISTS consultas_validar_empalme();
ALTER TABLE consultas DROP COLUMN IF EXISTS permite_empalme;
    `);
  }
}
