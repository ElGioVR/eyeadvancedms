import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreatePeriodosPagoTable1800000000021 implements MigrationInterface {
  name = 'CreatePeriodosPagoTable1800000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE estado_periodo_pago AS ENUM ('ABIERTO', 'EN_REVISION', 'CERRADO', 'PAGADO');

      CREATE TABLE periodos_pago (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo VARCHAR(20) NOT NULL UNIQUE,
        fecha_desde DATE NOT NULL,
        fecha_hasta DATE NOT NULL,
        estado estado_periodo_pago NOT NULL DEFAULT 'ABIERTO',
        cerrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        cerrado_at TIMESTAMPTZ,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_periodos_pago_estado ON periodos_pago(estado);
      CREATE INDEX idx_periodos_pago_fechas ON periodos_pago(fecha_desde, fecha_hasta);

      ALTER TABLE periodos_pago ENABLE ROW LEVEL SECURITY;

      CREATE POLICY periodos_pago_admin_all ON periodos_pago
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY periodos_pago_doctor_read ON periodos_pago
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'doctor'
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS periodos_pago_doctor_read ON periodos_pago;
      DROP POLICY IF EXISTS periodos_pago_admin_all ON periodos_pago;
      DROP TABLE IF EXISTS periodos_pago;
      DROP TYPE IF EXISTS estado_periodo_pago;
    `);
  }
}
