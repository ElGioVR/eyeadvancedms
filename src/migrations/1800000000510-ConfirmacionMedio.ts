import { type MigrationInterface, type QueryRunner } from 'typeorm';

/** Medio por el cual se confirmó la cita: whatsapp | telefono | correo | presencial. */
export class ConfirmacionMedio1800000000510 implements MigrationInterface {
  name = 'ConfirmacionMedio1800000000510';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['agenda_cirugias', 'consultas']) {
      await queryRunner.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS confirmacion_medio text`);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE ${tabla} ADD CONSTRAINT ${tabla}_confirmacion_medio_check
            CHECK (confirmacion_medio IS NULL OR confirmacion_medio IN ('whatsapp', 'telefono', 'correo', 'presencial'));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['agenda_cirugias', 'consultas']) {
      await queryRunner.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS ${tabla}_confirmacion_medio_check`);
      await queryRunner.query(`ALTER TABLE ${tabla} DROP COLUMN IF EXISTS confirmacion_medio`);
    }
  }
}
