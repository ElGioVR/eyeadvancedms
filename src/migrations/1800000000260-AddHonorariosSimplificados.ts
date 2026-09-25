import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddHonorariosSimplificados1800000000260 implements MigrationInterface {
  name = 'AddHonorariosSimplificados1800000000260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE estado_evento_honorario_g1 AS ENUM (
        'PENDIENTE', 'DEVENGADO', 'REVERSADO', 'LIQUIDADO', 'PAGADO', 'CANCELADO'
      );
    `);
    await queryRunner.query(`
      ALTER TABLE eventos_honorario
        ALTER COLUMN estado DROP DEFAULT,
        ALTER COLUMN estado TYPE estado_evento_honorario_g1
          USING estado::text::estado_evento_honorario_g1,
        ALTER COLUMN estado SET DEFAULT 'PENDIENTE';
    `);
    await queryRunner.query(`DROP TYPE estado_evento_honorario;`);
    await queryRunner.query(
      `ALTER TYPE estado_evento_honorario_g1 RENAME TO estado_evento_honorario;`
    );

    await queryRunner.query(`
      ALTER TABLE eventos_honorario
        ADD COLUMN IF NOT EXISTS fecha_pago DATE,
        ADD COLUMN IF NOT EXISTS pagado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS metricas_ligados JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_honorario_liga
        ON eventos_honorario (origen_tipo, origen_id, doctor_id)
        WHERE estado NOT IN ('REVERSADO', 'CANCELADO');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eventos_honorario_liga;`);
    await queryRunner.query(
      `ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS metricas_ligados;`
    );
    await queryRunner.query(
      `ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS pagado_por;`
    );
    await queryRunner.query(
      `ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS fecha_pago;`
    );
    await queryRunner.query(`
      CREATE TYPE estado_evento_honorario_prev AS ENUM (
        'PENDIENTE', 'DEVENGADO', 'REVERSADO', 'LIQUIDADO', 'PAGADO'
      );
    `);
    await queryRunner.query(`
      ALTER TABLE eventos_honorario
        ALTER COLUMN estado DROP DEFAULT,
        ALTER COLUMN estado TYPE estado_evento_honorario_prev
          USING (
            CASE WHEN estado::text = 'CANCELADO' THEN 'REVERSADO'
                 ELSE estado::text
            END
          )::estado_evento_honorario_prev,
        ALTER COLUMN estado SET DEFAULT 'PENDIENTE';
    `);
    await queryRunner.query(`DROP TYPE estado_evento_honorario;`);
    await queryRunner.query(
      `ALTER TYPE estado_evento_honorario_prev RENAME TO estado_evento_honorario;`
    );
  }
}
