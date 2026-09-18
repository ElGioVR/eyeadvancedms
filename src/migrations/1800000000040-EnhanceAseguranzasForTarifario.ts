import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class EnhanceAseguranzasForTarifario1800000000040 implements MigrationInterface {
  name = 'EnhanceAseguranzasForTarifario1800000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. tipo y vigencia en aseguranzas
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE tipo_aseguranza AS ENUM ('PRIVADA', 'CONVENIO', 'PARTICULAR');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE aseguranzas
        ADD COLUMN IF NOT EXISTS tipo tipo_aseguranza NOT NULL DEFAULT 'PRIVADA',
        ADD COLUMN IF NOT EXISTS vigente_desde DATE,
        ADD COLUMN IF NOT EXISTS vigente_hasta DATE;
    `);

    // 2. copago_fijo y vigencia en coberturas_aseguranza
    await queryRunner.query(`
      ALTER TABLE coberturas_aseguranza
        ADD COLUMN IF NOT EXISTS copago_fijo DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vigente_desde DATE,
        ADD COLUMN IF NOT EXISTS vigente_hasta DATE;
    `);

    // 3. numero_poliza y numero_afiliacion en pacientes
    await queryRunner.query(`
      ALTER TABLE pacientes
        ADD COLUMN IF NOT EXISTS numero_poliza VARCHAR(100),
        ADD COLUMN IF NOT EXISTS numero_afiliacion VARCHAR(100);
    `);

    // 4. Asegurar que Particular existe como aseguradora con tipo PARTICULAR
    await queryRunner.query(`
      INSERT INTO aseguranzas (nombre, tipo, activo)
      SELECT 'Particular', 'PARTICULAR', true
      WHERE NOT EXISTS (
        SELECT 1 FROM aseguranzas WHERE nombre = 'Particular'
      );
    `);

    // 5. Cobertura PARTICULAR: 0% (paciente paga todo)
    await queryRunner.query(`
      INSERT INTO coberturas_aseguranza (aseguranza_id, porcentaje_cobertura, copago_fijo, aplica_estudios, aplica_procedimientos)
      SELECT a.id, 0, 0, true, true
      FROM aseguranzas a
      WHERE a.nombre = 'Particular'
      AND NOT EXISTS (
        SELECT 1 FROM coberturas_aseguranza c WHERE c.aseguranza_id = a.id
      );
    `);

    // 6. Índices para búsquedas frecuentes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_aseguranzas_tipo ON aseguranzas(tipo);
      CREATE INDEX IF NOT EXISTS idx_pacientes_aseguranza_id ON pacientes(aseguranza_id) WHERE aseguranza_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_pacientes_aseguranza_id;
      DROP INDEX IF EXISTS idx_aseguranzas_tipo;
    `);

    await queryRunner.query(`
      DELETE FROM coberturas_aseguranza
      WHERE aseguranza_id IN (
        SELECT id FROM aseguranzas WHERE nombre = 'Particular' AND tipo = 'PARTICULAR'
      );
    `);

    await queryRunner.query(`
      DELETE FROM aseguranzas WHERE nombre = 'Particular' AND tipo = 'PARTICULAR';
    `);

    await queryRunner.query(`
      ALTER TABLE pacientes
        DROP COLUMN IF EXISTS numero_afiliacion,
        DROP COLUMN IF EXISTS numero_poliza;
    `);

    await queryRunner.query(`
      ALTER TABLE coberturas_aseguranza
        DROP COLUMN IF EXISTS vigente_hasta,
        DROP COLUMN IF EXISTS vigente_desde,
        DROP COLUMN IF EXISTS copago_fijo;
    `);

    await queryRunner.query(`
      ALTER TABLE aseguranzas
        DROP COLUMN IF EXISTS vigente_hasta,
        DROP COLUMN IF EXISTS vigente_desde,
        DROP COLUMN IF EXISTS tipo;
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS tipo_aseguranza;`);
  }
}
