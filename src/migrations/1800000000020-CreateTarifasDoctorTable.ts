import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateTarifasDoctorTable1800000000020 implements MigrationInterface {
  name = 'CreateTarifasDoctorTable1800000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE tipo_calculo_tarifa AS ENUM ('FIJO', 'PORCENTAJE', 'POR_HORA');

      CREATE TABLE tarifas_doctor (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id UUID NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
        tipo_concepto tipo_concepto_clinico NOT NULL,
        concepto_id UUID,
        rol rol_doctor_concepto NOT NULL DEFAULT 'PRINCIPAL',
        tipo_calculo tipo_calculo_tarifa NOT NULL DEFAULT 'FIJO',
        valor DECIMAL(10,2) NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'PESOS',
        vigente_desde DATE NOT NULL,
        vigente_hasta DATE,
        creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_tarifas_doctor_doctor_id ON tarifas_doctor(doctor_id);
      CREATE INDEX idx_tarifas_doctor_tipo_concepto ON tarifas_doctor(tipo_concepto);
      CREATE INDEX idx_tarifas_doctor_vigencia ON tarifas_doctor(vigente_desde, vigente_hasta);
      CREATE INDEX idx_tarifas_doctor_doctor_concepto ON tarifas_doctor(doctor_id, tipo_concepto, concepto_id);

      -- Solo una tarifa vigente por doctor+tipo+concepto+rol
      CREATE UNIQUE INDEX idx_tarifas_doctor_vigente
        ON tarifas_doctor(doctor_id, tipo_concepto, concepto_id, rol)
        WHERE vigente_hasta IS NULL;

      ALTER TABLE tarifas_doctor ENABLE ROW LEVEL SECURITY;

      CREATE POLICY tarifas_doctor_admin_all ON tarifas_doctor
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY tarifas_doctor_doctor_own ON tarifas_doctor
        USING (
          doctor_id IN (
            SELECT doctores.id FROM doctores
            WHERE doctores.usuario_id = auth.uid()
          )
        );

      CREATE POLICY tarifas_doctor_recepcionista_read ON tarifas_doctor
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'recepcionista'
          )
        );
    `);

    // Trigger: cerrar tarifa anterior al crear una nueva vigente
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_cerrar_tarifa_anterior()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.vigente_hasta IS NULL THEN
          UPDATE tarifas_doctor
          SET vigente_hasta = NEW.vigente_desde - INTERVAL '1 day'
          WHERE doctor_id = NEW.doctor_id
            AND tipo_concepto = NEW.tipo_concepto
            AND concepto_id IS NOT DISTINCT FROM NEW.concepto_id
            AND rol = NEW.rol
            AND vigente_hasta IS NULL
            AND id != NEW.id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_cerrar_tarifa_anterior
        BEFORE INSERT ON tarifas_doctor
        FOR EACH ROW
        EXECUTE FUNCTION fn_cerrar_tarifa_anterior();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_cerrar_tarifa_anterior ON tarifas_doctor;
      DROP FUNCTION IF EXISTS fn_cerrar_tarifa_anterior();
      DROP POLICY IF EXISTS tarifas_doctor_recepcionista_read ON tarifas_doctor;
      DROP POLICY IF EXISTS tarifas_doctor_doctor_own ON tarifas_doctor;
      DROP POLICY IF EXISTS tarifas_doctor_admin_all ON tarifas_doctor;
      DROP TABLE IF EXISTS tarifas_doctor;
      DROP TYPE IF EXISTS tipo_calculo_tarifa;
    `);
  }
}
