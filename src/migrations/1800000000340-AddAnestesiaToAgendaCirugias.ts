import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * agenda_cirugias.anestesia: LOCAL_SEDACION | LOCAL | GENERAL (Modificaciones
 * agenda, punto I). Nullable para históricos. Mismo contenido que
 * sql/patch-cirugia-anestesia.sql (idempotente).
 */
export class AddAnestesiaToAgendaCirugias1800000000340 implements MigrationInterface {
  name = 'AddAnestesiaToAgendaCirugias1800000000340';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS anestesia TEXT;

ALTER TABLE agenda_cirugias
  DROP CONSTRAINT IF EXISTS agenda_cirugias_anestesia_check;
ALTER TABLE agenda_cirugias
  ADD CONSTRAINT agenda_cirugias_anestesia_check
  CHECK (anestesia IS NULL OR anestesia IN ('LOCAL_SEDACION', 'LOCAL', 'GENERAL'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_anestesia_check;
ALTER TABLE agenda_cirugias DROP COLUMN IF EXISTS anestesia;
    `);
  }
}
