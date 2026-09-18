import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMetodoPagoToConsultas1800000000070 implements MigrationInterface {
  name = 'AddMetodoPagoToConsultas1800000000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum for metodo_pago on consultas
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE metodo_pago_consulta AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'SEGURO', 'NO_APLICA');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Add metodo_pago column (nullable for backward-compat)
    await queryRunner.query(`
      ALTER TABLE consultas
        ADD COLUMN IF NOT EXISTS metodo_pago metodo_pago_consulta;
    `);

    // 3. Backfill from associated cobros (take the most recent cobro's method per consulta)
    await queryRunner.query(`
      UPDATE consultas c
        SET metodo_pago = (
          SELECT cobros.metodo_pago
          FROM cobros
          WHERE cobros.consulta_id = c.id
          ORDER BY cobros.created_at DESC
          LIMIT 1
        )
      WHERE c.metodo_pago IS NULL
        AND EXISTS (
          SELECT 1 FROM cobros WHERE cobros.consulta_id = c.id AND cobros.metodo_pago IS NOT NULL
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultas DROP COLUMN IF EXISTS metodo_pago;`);
    await queryRunner.query(`DROP TYPE IF EXISTS metodo_pago_consulta;`);
  }
}
