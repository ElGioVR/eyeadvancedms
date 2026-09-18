import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddPreferenciasToUsuarios1800000000080 implements MigrationInterface {
  name = 'AddPreferenciasToUsuarios1800000000080';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS preferencias JSONB DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE usuarios DROP COLUMN IF EXISTS preferencias;`);
  }
}
