import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCobroDetallesTable1800000000003 implements MigrationInterface {
  name = 'CreateCobroDetallesTable1800000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE cobro_detalles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cobro_id UUID NOT NULL REFERENCES cobros(id) ON DELETE CASCADE,
        consulta_concepto_id UUID NOT NULL REFERENCES consulta_conceptos(id) ON DELETE CASCADE,
        monto DECIMAL(10,2) NOT NULL DEFAULT 0,
        descuento DECIMAL(10,2) NOT NULL DEFAULT 0,
        monto_final DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_cobro_detalles_cobro_id ON cobro_detalles(cobro_id);
      CREATE INDEX idx_cobro_detalles_consulta_concepto_id ON cobro_detalles(consulta_concepto_id);

      ALTER TABLE cobro_detalles ENABLE ROW LEVEL SECURITY;

      CREATE POLICY cobro_detalles_admin_all ON cobro_detalles
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY cobro_detalles_recepcionista_all ON cobro_detalles
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'recepcionista'
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS cobro_detalles_recepcionista_all ON cobro_detalles;
      DROP POLICY IF EXISTS cobro_detalles_admin_all ON cobro_detalles;
      DROP TABLE IF EXISTS cobro_detalles;
    `);
  }
}
