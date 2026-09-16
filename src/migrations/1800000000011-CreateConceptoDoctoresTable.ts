import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateConceptoDoctoresTable1800000000011 implements MigrationInterface {
  name = 'CreateConceptoDoctoresTable1800000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum de roles del doctor en un concepto
    await queryRunner.query(`
      CREATE TYPE rol_doctor_concepto AS ENUM (
        'PRINCIPAL',
        'AYUDANTE',
        'ANESTESIOLOGO',
        'INTERPRETACION',
        'REFERIDOR'
      );
    `);

    // Tabla de participación de doctores en conceptos ejecutados
    await queryRunner.query(`
      CREATE TABLE concepto_doctores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        consulta_concepto_id UUID NOT NULL REFERENCES consulta_conceptos(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
        rol rol_doctor_concepto NOT NULL DEFAULT 'PRINCIPAL',
        porcentaje_participacion DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // UNIQUE: un doctor no puede tener el mismo rol dos veces en el mismo concepto
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_concepto_doctores_unique
        ON concepto_doctores(consulta_concepto_id, doctor_id, rol);
    `);

    // Índices para queries comunes
    await queryRunner.query(`
      CREATE INDEX idx_concepto_doctores_consulta_concepto_id
        ON concepto_doctores(consulta_concepto_id);
      CREATE INDEX idx_concepto_doctores_doctor_id
        ON concepto_doctores(doctor_id);
    `);

    // Trigger: validar que la suma de porcentajes por concepto no exceda 100
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_validar_porcentaje_concepto()
      RETURNS TRIGGER AS $$
      DECLARE
        suma_total DECIMAL(5,2);
      BEGIN
        SELECT COALESCE(SUM(porcentaje_participacion), 0)
        INTO suma_total
        FROM concepto_doctores
        WHERE consulta_concepto_id = NEW.consulta_concepto_id
          AND id != COALESCE(NEW.id, gen_random_uuid());

        suma_total := suma_total + NEW.porcentaje_participacion;

        IF suma_total > 100 THEN
          RAISE EXCEPTION 'La suma de porcentajes por concepto (%) excede 100%%', suma_total;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_validar_porcentaje_concepto
        BEFORE INSERT OR UPDATE ON concepto_doctores
        FOR EACH ROW
        EXECUTE FUNCTION fn_validar_porcentaje_concepto();
    `);

    // RLS
    await queryRunner.query(`
      ALTER TABLE concepto_doctores ENABLE ROW LEVEL SECURITY;

      CREATE POLICY concepto_doctores_admin_all ON concepto_doctores
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY concepto_doctores_doctor_own ON concepto_doctores
        USING (
          doctor_id IN (
            SELECT doctores.id FROM doctores
            WHERE doctores.usuario_id = auth.uid()
          )
        );

      CREATE POLICY concepto_doctores_recepcionista_all ON concepto_doctores
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
      DROP TRIGGER IF EXISTS trg_validar_porcentaje_concepto ON concepto_doctores;
      DROP FUNCTION IF EXISTS fn_validar_porcentaje_concepto();
      DROP POLICY IF EXISTS concepto_doctores_recepcionista_all ON concepto_doctores;
      DROP POLICY IF EXISTS concepto_doctores_doctor_own ON concepto_doctores;
      DROP POLICY IF EXISTS concepto_doctores_admin_all ON concepto_doctores;
      DROP TABLE IF EXISTS concepto_doctores;
      DROP TYPE IF EXISTS rol_doctor_concepto;
    `);
  }
}
