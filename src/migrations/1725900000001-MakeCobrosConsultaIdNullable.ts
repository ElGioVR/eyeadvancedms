import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeCobrosConsultaIdNullable1725900000001 implements MigrationInterface {
  name = 'MakeCobrosConsultaIdNullable1725900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cobros
      ALTER COLUMN consulta_id DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cobros
      ALTER COLUMN consulta_id SET NOT NULL;
    `);
  }
}
