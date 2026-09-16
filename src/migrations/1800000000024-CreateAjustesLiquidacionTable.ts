import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAjustesLiquidacionTable1800000000024 implements MigrationInterface {
  name = 'CreateAjustesLiquidacionTable1800000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE tipo_ajuste_liquidacion AS ENUM (
        'BONO', 'DESCUENTO', 'ANTICIPO', 'CORRECCION'
      );

      CREATE TABLE ajustes_liquidacion (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        liquidacion_id UUID NOT NULL REFERENCES liquidaciones_doctor(id) ON DELETE CASCADE,
        tipo tipo_ajuste_liquidacion NOT NULL,
        concepto VARCHAR(255) NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        motivo TEXT,
        creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_ajustes_liquidacion_liquidacion_id
        ON ajustes_liquidacion(liquidacion_id);

      ALTER TABLE ajustes_liquidacion ENABLE ROW LEVEL SECURITY;

      CREATE POLICY ajustes_liquidacion_admin_all ON ajustes_liquidacion
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS ajustes_liquidacion_admin_all ON ajustes_liquidacion;
      DROP TABLE IF EXISTS ajustes_liquidacion;
      DROP TYPE IF EXISTS tipo_ajuste_liquidacion;
    `);
  }
}
