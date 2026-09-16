import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAgendaCirugiaDoctoresTable1800000000012 implements MigrationInterface {
  name = 'CreateAgendaCirugiaDoctoresTable1800000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum de roles en cirugía
    await queryRunner.query(`
      CREATE TYPE rol_cirugia AS ENUM (
        'CIRUJANO_PRINCIPAL',
        'AYUDANTE',
        'ANESTESIOLOGO',
        'INSTRUMENTISTA',
        'CIRCULANTE'
      );
    `);

    // Tabla puente: participación multi-doctor en cirugías
    await queryRunner.query(`
      CREATE TABLE agenda_cirugia_doctores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
        doctor_id UUID NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
        rol rol_cirugia NOT NULL DEFAULT 'CIRUJANO_PRINCIPAL',
        porcentaje_participacion DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // UNIQUE: un doctor no puede tener el mismo rol dos veces en la misma cirugía
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_agenda_cirugia_doctores_unique
        ON agenda_cirugia_doctores(cirugia_id, doctor_id, rol);
    `);

    // Índices
    await queryRunner.query(`
      CREATE INDEX idx_agenda_cirugia_doctores_cirugia_id
        ON agenda_cirugia_doctores(cirugia_id);
      CREATE INDEX idx_agenda_cirugia_doctores_doctor_id
        ON agenda_cirugia_doctores(doctor_id);
    `);

    // Trigger: validar suma de porcentajes por cirugía
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_validar_porcentaje_cirugia()
      RETURNS TRIGGER AS $$
      DECLARE
        suma_total DECIMAL(5,2);
      BEGIN
        SELECT COALESCE(SUM(porcentaje_participacion), 0)
        INTO suma_total
        FROM agenda_cirugia_doctores
        WHERE cirugia_id = NEW.cirugia_id
          AND id != COALESCE(NEW.id, gen_random_uuid());

        suma_total := suma_total + NEW.porcentaje_participacion;

        IF suma_total > 100 THEN
          RAISE EXCEPTION 'La suma de porcentajes por cirugía (%) excede 100%%', suma_total;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_validar_porcentaje_cirugia
        BEFORE INSERT OR UPDATE ON agenda_cirugia_doctores
        FOR EACH ROW
        EXECUTE FUNCTION fn_validar_porcentaje_cirugia();
    `);

    // RLS
    await queryRunner.query(`
      ALTER TABLE agenda_cirugia_doctores ENABLE ROW LEVEL SECURITY;

      CREATE POLICY agenda_cirugia_doctores_admin_all ON agenda_cirugia_doctores
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY agenda_cirugia_doctores_doctor_own ON agenda_cirugia_doctores
        USING (
          doctor_id IN (
            SELECT doctores.id FROM doctores
            WHERE doctores.usuario_id = auth.uid()
          )
        );

      CREATE POLICY agenda_cirugia_doctores_recepcionista_all ON agenda_cirugia_doctores
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
      DROP TRIGGER IF EXISTS trg_validar_porcentaje_cirugia ON agenda_cirugia_doctores;
      DROP FUNCTION IF EXISTS fn_validar_porcentaje_cirugia();
      DROP POLICY IF EXISTS agenda_cirugia_doctores_recepcionista_all ON agenda_cirugia_doctores;
      DROP POLICY IF EXISTS agenda_cirugia_doctores_doctor_own ON agenda_cirugia_doctores;
      DROP POLICY IF EXISTS agenda_cirugia_doctores_admin_all ON agenda_cirugia_doctores;
      DROP TABLE IF EXISTS agenda_cirugia_doctores;
      DROP TYPE IF EXISTS rol_cirugia;
    `);
  }
}
