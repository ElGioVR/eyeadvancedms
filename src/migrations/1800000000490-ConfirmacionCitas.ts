import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Bandeja de la agenda: confirmación de la cita por WhatsApp.
 * confirmacion: NULL (pendiente) | 'enviada' (mensaje enviado) | 'confirmada'.
 */
export class ConfirmacionCitas1800000000490 implements MigrationInterface {
  name = 'ConfirmacionCitas1800000000490';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['agenda_cirugias', 'consultas']) {
      await queryRunner.query(`
        ALTER TABLE ${tabla}
          ADD COLUMN IF NOT EXISTS confirmacion text,
          ADD COLUMN IF NOT EXISTS confirmacion_at timestamptz,
          ADD COLUMN IF NOT EXISTS confirmacion_por uuid`);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE ${tabla} ADD CONSTRAINT ${tabla}_confirmacion_check
            CHECK (confirmacion IS NULL OR confirmacion IN ('enviada', 'confirmada'));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['agenda_cirugias', 'consultas']) {
      await queryRunner.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS ${tabla}_confirmacion_check`);
      await queryRunner.query(`ALTER TABLE ${tabla} DROP COLUMN IF EXISTS confirmacion_por, DROP COLUMN IF EXISTS confirmacion_at, DROP COLUMN IF EXISTS confirmacion`);
    }
  }
}
