import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddConsultaIdToAgendaCirugias1800000000004 implements MigrationInterface {
  name = 'AddConsultaIdToAgendaCirugias1800000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ADD COLUMN IF NOT EXISTS consulta_id UUID REFERENCES consultas(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_consulta_id
        ON agenda_cirugias(consulta_id)
        WHERE consulta_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agenda_cirugias_consulta_id;
      ALTER TABLE agenda_cirugias DROP COLUMN IF EXISTS consulta_id;
    `);
  }
}
