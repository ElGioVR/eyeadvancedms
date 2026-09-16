import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class EnhanceDoctoresWithHonorariosFields1800000000010 implements MigrationInterface {
  name = 'EnhanceDoctoresWithHonorariosFields1800000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tipo de relación del doctor con la clínica
    await queryRunner.query(`
      CREATE TYPE tipo_relacion_doctor AS ENUM ('PLANTA', 'HONORARIOS', 'EXTERNO');
    `);

    await queryRunner.query(`
      ALTER TABLE doctores
        ADD COLUMN IF NOT EXISTS tipo_relacion tipo_relacion_doctor NOT NULL DEFAULT 'HONORARIOS',
        ADD COLUMN IF NOT EXISTS rfc VARCHAR(13),
        ADD COLUMN IF NOT EXISTS cuenta_bancaria VARCHAR(30),
        ADD COLUMN IF NOT EXISTS clabe VARCHAR(18),
        ADD COLUMN IF NOT EXISTS porcentaje_default DECIMAL(5,2) NOT NULL DEFAULT 100.00;
    `);

    // Índices para reportes y búsquedas
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_doctores_tipo_relacion
        ON doctores(tipo_relacion);
      CREATE INDEX IF NOT EXISTS idx_doctores_rfc
        ON doctores(rfc) WHERE rfc IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_doctores_rfc;
      DROP INDEX IF EXISTS idx_doctores_tipo_relacion;
      ALTER TABLE doctores
        DROP COLUMN IF EXISTS porcentaje_default,
        DROP COLUMN IF EXISTS clabe,
        DROP COLUMN IF EXISTS cuenta_bancaria,
        DROP COLUMN IF EXISTS rfc,
        DROP COLUMN IF EXISTS tipo_relacion;
      DROP TYPE IF EXISTS tipo_relacion_doctor;
    `);
  }
}
