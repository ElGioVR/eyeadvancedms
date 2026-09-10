import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLentesFolio1725900000003 implements MigrationInterface {
  name = 'AddLentesFolio1725900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lentes"
      ADD COLUMN "folio" varchar(50) UNIQUE
    `);

    // Generate folios for existing records
    const rows = await queryRunner.query(`SELECT "id" FROM "lentes" ORDER BY "created_at" ASC`);
    for (let i = 0; i < rows.length; i++) {
      const seq = (i + 1).toString().padStart(5, '0');
      await queryRunner.query(
        `UPDATE "lentes" SET "folio" = $1 WHERE "id" = $2`,
        [`LEN-26-${seq}`, rows[i].id]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lentes" DROP COLUMN "folio"`);
  }
}
