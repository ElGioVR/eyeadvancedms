import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * El valor de doctores.nombre_completo se usa en toda la aplicación como
 * ALIAS de presentación (ej. "DR BAYARDO"), no como nombre real.
 *
 * Esta migración:
 *  1. Renombra `nombre_completo` → `alias` (conserva el dato existente).
 *  2. Agrega `nombre` y `apellido` para la identidad real del doctor
 *     (se usan en la ficha del doctor e imports; quedan NULL hasta capturarse).
 */
export class RenameDoctorNombreToAlias1800000000290 implements MigrationInterface {
  name = 'RenameDoctorNombreToAlias1800000000290';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE doctores
        RENAME COLUMN nombre_completo TO alias;
    `);

    await queryRunner.query(`
      ALTER TABLE doctores
        ADD COLUMN IF NOT EXISTS nombre VARCHAR(255),
        ADD COLUMN IF NOT EXISTS apellido VARCHAR(255);
    `);

    // El índice/orden por nombre se conserva sobre alias
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_doctores_alias ON doctores(alias);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_doctores_alias;
    `);
    await queryRunner.query(`
      ALTER TABLE doctores
        DROP COLUMN IF EXISTS apellido,
        DROP COLUMN IF EXISTS nombre;
    `);
    await queryRunner.query(`
      ALTER TABLE doctores
        RENAME COLUMN alias TO nombre_completo;
    `);
  }
}
