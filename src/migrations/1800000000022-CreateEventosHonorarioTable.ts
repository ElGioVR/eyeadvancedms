import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateEventosHonorarioTable1800000000022 implements MigrationInterface {
  name = 'CreateEventosHonorarioTable1800000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE origen_evento_honorario AS ENUM (
        'CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO', 'CITA', 'OPERACION'
      );

      CREATE TYPE estado_evento_honorario AS ENUM (
        'PENDIENTE', 'DEVENGADO', 'REVERSADO', 'LIQUIDADO'
      );

      CREATE TABLE eventos_honorario (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        origen_tipo origen_evento_honorario NOT NULL,
        origen_id UUID NOT NULL,
        doctor_id UUID NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
        rol rol_doctor_concepto NOT NULL DEFAULT 'PRINCIPAL',
        paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
        fecha_servicio DATE NOT NULL,
        monto_base DECIMAL(10,2) NOT NULL DEFAULT 0,
        tarifa_snapshot JSONB,
        monto_devengado DECIMAL(10,2) NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'PESOS',
        estado estado_evento_honorario NOT NULL DEFAULT 'PENDIENTE',
        periodo_id UUID,
        cobro_id UUID REFERENCES cobros(id) ON DELETE SET NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Idempotencia: un evento por origen+doctor+rol
      CREATE UNIQUE INDEX idx_eventos_honorario_unique
        ON eventos_honorario(origen_tipo, origen_id, doctor_id, rol);

      CREATE INDEX idx_eventos_honorario_doctor_id ON eventos_honorario(doctor_id);
      CREATE INDEX idx_eventos_honorario_estado ON eventos_honorario(estado);
      CREATE INDEX idx_eventos_honorario_fecha_servicio ON eventos_honorario(fecha_servicio);
      CREATE INDEX idx_eventos_honorario_periodo_id ON eventos_honorario(periodo_id) WHERE periodo_id IS NOT NULL;
      CREATE INDEX idx_eventos_honorario_origen ON eventos_honorario(origen_tipo, origen_id);

      ALTER TABLE eventos_honorario ENABLE ROW LEVEL SECURITY;

      CREATE POLICY eventos_honorario_admin_all ON eventos_honorario
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY eventos_honorario_doctor_own ON eventos_honorario
        USING (
          doctor_id IN (
            SELECT doctores.id FROM doctores
            WHERE doctores.usuario_id = auth.uid()
          )
        );

      CREATE POLICY eventos_honorario_recepcionista_read ON eventos_honorario
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
      DROP POLICY IF EXISTS eventos_honorario_recepcionista_read ON eventos_honorario;
      DROP POLICY IF EXISTS eventos_honorario_doctor_own ON eventos_honorario;
      DROP POLICY IF EXISTS eventos_honorario_admin_all ON eventos_honorario;
      DROP TABLE IF EXISTS eventos_honorario;
      DROP TYPE IF EXISTS estado_evento_honorario;
      DROP TYPE IF EXISTS origen_evento_honorario;
    `);
  }
}
