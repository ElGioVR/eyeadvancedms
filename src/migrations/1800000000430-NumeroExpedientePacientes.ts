import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Número de expediente del paciente (se captura al dar de alta al paciente
 * desde Nueva consulta / Nueva cirugía). Opcional y único sin distinguir
 * mayúsculas ni espacios extremos.
 */
export class NumeroExpedientePacientes1800000000430 implements MigrationInterface {
  name = 'NumeroExpedientePacientes1800000000430';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero_expediente TEXT`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS pacientes_numero_expediente_uq
        ON pacientes (upper(btrim(numero_expediente)))
        WHERE numero_expediente IS NOT NULL AND btrim(numero_expediente) <> ''`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS pacientes_numero_expediente_uq`);
    await queryRunner.query(`ALTER TABLE pacientes DROP COLUMN IF EXISTS numero_expediente`);
  }
}
