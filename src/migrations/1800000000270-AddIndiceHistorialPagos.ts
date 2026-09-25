import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddIndiceHistorialPagos1800000000270 implements MigrationInterface {
  name = 'AddIndiceHistorialPagos1800000000270';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eventos_honorario_fecha_pago
        ON eventos_honorario (fecha_pago DESC)
        WHERE estado = 'PAGADO';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_eventos_honorario_fecha_pago;`
    );
  }
}
