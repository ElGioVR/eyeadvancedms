import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Catálogo cat_especialidades (misma lista que Configuración → Doctores) y
 * columna consultas.especialidad_id (Modificaciones agenda, punto II).
 * Mismo contenido que sql/patch-cat-especialidades.sql (idempotente).
 */
export class CreateCatEspecialidades1800000000330 implements MigrationInterface {
  name = 'CreateCatEspecialidades1800000000330';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS cat_especialidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cat_especialidades (clave, nombre, orden) VALUES
  ('oftalmologia', 'Oftalmología', 1),
  ('oftalmologia_pediatrica', 'Oftalmología Pediátrica', 2),
  ('glaucoma', 'Glaucoma', 3),
  ('retina', 'Retina', 4),
  ('catarata_refractiva', 'Catarata y Cirugía Refractiva', 5),
  ('cornea', 'Córnea y Superficie Ocular', 6),
  ('estrabismo', 'Estrabismo', 7),
  ('optometria', 'Optometría', 8),
  ('neuroftalmologia', 'Neuroftalmología', 9),
  ('oculoplastica', 'Oculoplástica', 10)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE cat_especialidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cat_especialidades_select_authenticated ON cat_especialidades;
CREATE POLICY cat_especialidades_select_authenticated ON cat_especialidades
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cat_especialidades_admin_write ON cat_especialidades;
CREATE POLICY cat_especialidades_admin_write ON cat_especialidades
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

-- Consulta: especialidad elegida en la agenda (nullable: históricos sin dato).
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS especialidad_id UUID REFERENCES cat_especialidades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_consultas_especialidad_id ON consultas (especialidad_id);

-- Normaliza el único valor sin acento que guardaba Configuración → Doctores.
UPDATE doctores SET especialidad = 'Córnea y Superficie Ocular'
 WHERE especialidad = 'Cornea y Superficie Ocular';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DROP INDEX IF EXISTS idx_consultas_especialidad_id;
ALTER TABLE consultas DROP COLUMN IF EXISTS especialidad_id;
DROP TABLE IF EXISTS cat_especialidades;
    `);
  }
}
