import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateConsultaConceptosTable1800000000002 implements MigrationInterface {
  name = 'CreateConsultaConceptosTable1800000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE tipo_concepto_clinico AS ENUM ('ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA');

      CREATE TABLE consulta_conceptos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
        tipo_concepto tipo_concepto_clinico NOT NULL,
        concepto_id UUID,
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0,
        texto_original TEXT,
        doctor_id UUID REFERENCES doctores(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_consulta_conceptos_consulta_id ON consulta_conceptos(consulta_id);
      CREATE INDEX idx_consulta_conceptos_tipo_concepto ON consulta_conceptos(tipo_concepto);
      CREATE INDEX idx_consulta_conceptos_doctor_id ON consulta_conceptos(doctor_id);
      CREATE INDEX idx_consulta_conceptos_concepto_id ON consulta_conceptos(concepto_id);

      ALTER TABLE consulta_conceptos ENABLE ROW LEVEL SECURITY;

      CREATE POLICY consulta_conceptos_admin_all ON consulta_conceptos
        USING (
          EXISTS (
            SELECT 1 FROM usuarios
            WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
          )
        );

      CREATE POLICY consulta_conceptos_doctor_own ON consulta_conceptos
        USING (
          doctor_id IN (
            SELECT doctores.id FROM doctores
            WHERE doctores.usuario_id = auth.uid()
          )
        );

      CREATE POLICY consulta_conceptos_recepcionista_all ON consulta_conceptos
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
      DROP POLICY IF EXISTS consulta_conceptos_recepcionista_all ON consulta_conceptos;
      DROP POLICY IF EXISTS consulta_conceptos_doctor_own ON consulta_conceptos;
      DROP POLICY IF EXISTS consulta_conceptos_admin_all ON consulta_conceptos;
      DROP TABLE IF EXISTS consulta_conceptos;
      DROP TYPE IF EXISTS tipo_concepto_clinico;
    `);
  }
}
