import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddProductividadColumns1800000000230 implements MigrationInterface {
  name = 'AddProductividadColumns1800000000230';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // consultas.consulta_origen_id: raíz para anti-duplicado D10 / estudio derivado
    await queryRunner.query(`
      ALTER TABLE consultas
        ADD COLUMN IF NOT EXISTS consulta_origen_id UUID
        REFERENCES consultas(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consultas_consulta_origen_id
        ON consultas(consulta_origen_id)
        WHERE consulta_origen_id IS NOT NULL
    `);

    // consulta_conceptos: cantidad ya existe (mig 1800000000002); solo ojo hace falta
    await queryRunner.query(`
      ALTER TABLE consulta_conceptos
        ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE consulta_conceptos
        ADD COLUMN IF NOT EXISTS ojo TEXT
    `);
    await queryRunner.query(`
      ALTER TABLE consulta_conceptos
        DROP CONSTRAINT IF EXISTS chk_consulta_conceptos_ojo
    `);
    await queryRunner.query(`
      ALTER TABLE consulta_conceptos
        ADD CONSTRAINT chk_consulta_conceptos_ojo
        CHECK (ojo IS NULL OR ojo IN ('OD', 'OI', 'OU'))
    `);

    // eventos_honorario.dedupe_key: anti-duplicado D10b (índice único parcial)
    await queryRunner.query(`
      ALTER TABLE eventos_honorario
        ADD COLUMN IF NOT EXISTS dedupe_key TEXT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_honorario_dedupe_key
        ON eventos_honorario(dedupe_key)
        WHERE dedupe_key IS NOT NULL AND estado <> 'REVERSADO'
    `);

    // D12: valor PAGADO en estado_evento_honorario
    // ALTER TYPE ... ADD VALUE no es transaccional; reemplazo atómico (patrón mig 1800000000170)
    await queryRunner.query(`
      CREATE TYPE estado_evento_honorario_new AS ENUM (
        'PENDIENTE', 'DEVENGADO', 'REVERSADO', 'LIQUIDADO', 'PAGADO'
      );
    `);
    await queryRunner.query(`
      ALTER TABLE eventos_honorario
        ALTER COLUMN estado DROP DEFAULT,
        ALTER COLUMN estado TYPE estado_evento_honorario_new
          USING estado::text::estado_evento_honorario_new,
        ALTER COLUMN estado SET DEFAULT 'PENDIENTE';
    `);
    await queryRunner.query(`DROP TYPE estado_evento_honorario;`);
    await queryRunner.query(
      `ALTER TYPE estado_evento_honorario_new RENAME TO estado_evento_honorario;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE eventos_honorario SET estado = 'DEVENGADO' WHERE estado = 'PAGADO'
    `);
    await queryRunner.query(`
      CREATE TYPE estado_evento_honorario_old AS ENUM (
        'PENDIENTE', 'DEVENGADO', 'REVERSADO', 'LIQUIDADO'
      );
    `);
    await queryRunner.query(`
      ALTER TABLE eventos_honorario
        ALTER COLUMN estado DROP DEFAULT,
        ALTER COLUMN estado TYPE estado_evento_honorario_old
          USING estado::text::estado_evento_honorario_old,
        ALTER COLUMN estado SET DEFAULT 'PENDIENTE';
    `);
    await queryRunner.query(`DROP TYPE estado_evento_honorario;`);
    await queryRunner.query(
      `ALTER TYPE estado_evento_honorario_old RENAME TO estado_evento_honorario;`
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_eventos_honorario_dedupe_key`
    );
    await queryRunner.query(
      `ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS dedupe_key`
    );

    await queryRunner.query(
      `ALTER TABLE consulta_conceptos DROP CONSTRAINT IF EXISTS chk_consulta_conceptos_ojo`
    );
    await queryRunner.query(
      `ALTER TABLE consulta_conceptos DROP COLUMN IF EXISTS ojo`
    );
    await queryRunner.query(
      `ALTER TABLE consulta_conceptos DROP COLUMN IF EXISTS cantidad`
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_consultas_consulta_origen_id`
    );
    await queryRunner.query(
      `ALTER TABLE consultas DROP COLUMN IF EXISTS consulta_origen_id`
    );
  }
}
