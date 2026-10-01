import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Importación masiva sin duplicados: bandera «pendiente_completar» en pacientes
 * y doctores creados por la importación, e índice único de alias de doctor sin
 * distinguir mayúsculas (si no hay alias repetidos).
 * Mismo contenido que sql/patch-import-sin-duplicados.sql.
 */
export class ImportSinDuplicados1800000000400 implements MigrationInterface {
  name = 'ImportSinDuplicados1800000000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS pendiente_completar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE doctores ADD COLUMN IF NOT EXISTS pendiente_completar BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pacientes_pendiente_completar ON pacientes (id) WHERE pendiente_completar;
CREATE INDEX IF NOT EXISTS idx_doctores_pendiente_completar ON doctores (id) WHERE pendiente_completar;

DO $alias$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_doctores_alias_ci') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM doctores
     WHERE activo
     GROUP BY upper(btrim(regexp_replace(alias, '\\s+', ' ', 'g')))
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Hay doctores activos con el mismo alias (sin distinguir mayusculas). Unificalos y vuelve a correr el script para crear el indice unico.';
    RETURN;
  END IF;
  CREATE UNIQUE INDEX uq_doctores_alias_ci
    ON doctores (upper(btrim(regexp_replace(alias, '\\s+', ' ', 'g'))))
    WHERE activo;
END
$alias$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DROP INDEX IF EXISTS uq_doctores_alias_ci;
DROP INDEX IF EXISTS idx_doctores_pendiente_completar;
DROP INDEX IF EXISTS idx_pacientes_pendiente_completar;
ALTER TABLE doctores DROP COLUMN IF EXISTS pendiente_completar;
ALTER TABLE pacientes DROP COLUMN IF EXISTS pendiente_completar;
    `);
  }
}
