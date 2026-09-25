import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddDeployedToPerformance1800000000261 implements MigrationInterface {
  name = 'AddDeployedToPerformance1800000000261';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultas
        ADD COLUMN IF NOT EXISTS deployed_to_performance BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;
    `);
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ADD COLUMN IF NOT EXISTS deployed_to_performance BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consultas_deployed
        ON consultas (deployed_to_performance, fecha)
        WHERE deployed_to_performance = false;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_deployed
        ON agenda_cirugias (deployed_to_performance, fecha)
        WHERE deployed_to_performance = false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_deployed;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consultas_deployed;`);
    await queryRunner.query(
      `ALTER TABLE agenda_cirugias DROP COLUMN IF EXISTS deployed_at, DROP COLUMN IF EXISTS deployed_to_performance;`
    );
    await queryRunner.query(
      `ALTER TABLE consultas DROP COLUMN IF EXISTS deployed_at, DROP COLUMN IF EXISTS deployed_to_performance;`
    );
  }
}
