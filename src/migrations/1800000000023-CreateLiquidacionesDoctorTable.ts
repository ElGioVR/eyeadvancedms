import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateLiquidacionesDoctorTable1800000000023 implements MigrationInterface {
  name = 'CreateLiquidacionesDoctorTable1800000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE estado_liquidacion AS ENUM ('BORRADOR', 'PENDIENTE_APROBACION', 'APROBADA', 'PAGADA', 'RECHAZADA');

      CREATE TABLE liquidaciones_doctor (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        periodo_id UUID NOT NULL REFERENCES periodos_pago(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
        total_devengado DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_ajustes DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_retenciones DECIMAL(10,2) NOT NULL DEFAULT 0,
        neto_pagar DECIMAL(10,2) NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'PESOS',
        estado estado_liquidacion NOT NULL DEFAULT 'BORRADOR',
        aprobado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        aprobado_at TIMESTAMPTZ,
        pagado_at TIMESTAMPTZ,
        referencia_pago VARCHAR(100),
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Una liquidación por doctor por período
      CREATE UNIQUE INDEX idx_liquidaciones_doctor_unique
        ON liquidaciones_doctor(periodo_id, doctor_id);

      CREATE INDEX idx_liquidaciones_doctor_doctor_id ON liquidaciones_doctor(doctor_id);
      CREATE INDEX idx_liquidaciones_doctor_estado ON liquidaciones_doctor(estado);
      CREATE INDEX idx_liquidaciones_doctor_periodo_id ON liquidaciones_doctor(periodo_id);

      ALTER TABLE liquidaciones_doctor ENABLE ROW LEVEL SECURITY;

      CREATE POLICY liquidaciones_doctor_admin_all ON liquidaciones_doctor
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY liquidaciones_doctor_doctor_own ON liquidaciones_doctor
        USING (
          doctor_id IN (
            SELECT doctores.id FROM doctores
            WHERE doctores.usuario_id = auth.uid()
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS liquidaciones_doctor_doctor_own ON liquidaciones_doctor;
      DROP POLICY IF EXISTS liquidaciones_doctor_admin_all ON liquidaciones_doctor;
      DROP TABLE IF EXISTS liquidaciones_doctor;
      DROP TYPE IF EXISTS estado_liquidacion;
    `);
  }
}
