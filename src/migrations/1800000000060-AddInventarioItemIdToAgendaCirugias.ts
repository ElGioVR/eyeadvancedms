import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddInventarioItemIdToAgendaCirugias1800000000060 implements MigrationInterface {
  name = 'AddInventarioItemIdToAgendaCirugias1800000000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add inventario_item_id FK to agenda_cirugias (nullable for backward-compat)
    await queryRunner.query(`
      ALTER TABLE agenda_cirugias
        ADD COLUMN IF NOT EXISTS inventario_item_id UUID
          REFERENCES inventario_items(id) ON DELETE SET NULL;
    `);

    // 2. Index for joins
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_inventario_item_id
        ON agenda_cirugias(inventario_item_id);
    `);

    // 3. RLS: allow admin and recepcionista full access (inherits from agenda_cirugias policies)
    //    No new policies needed — agenda_cirugias already has admin_all and recepcionista_all
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agenda_cirugias_inventario_item_id;`);
    await queryRunner.query(`ALTER TABLE agenda_cirugias DROP COLUMN IF EXISTS inventario_item_id;`);
  }
}
