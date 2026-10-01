BEGIN;

CREATE TABLE IF NOT EXISTS personal_clinico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  rol_principal TEXT NOT NULL DEFAULT 'enfermero' CHECK (rol_principal IN ('instrumentista', 'enfermero', 'circulante')),
  telefono TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_clinico_nombre ON personal_clinico (lower(trim(nombre)));

ALTER TABLE personal_clinico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_clinico_select_authenticated ON personal_clinico;
CREATE POLICY personal_clinico_select_authenticated ON personal_clinico
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS personal_clinico_write ON personal_clinico;
CREATE POLICY personal_clinico_write ON personal_clinico
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'recepcionista')));

ALTER TABLE cirugia_personal
  ADD COLUMN IF NOT EXISTS personal_id UUID REFERENCES personal_clinico(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hora_inicio TIME,
  ADD COLUMN IF NOT EXISTS hora_fin TIME;
ALTER TABLE cirugia_personal DROP CONSTRAINT IF EXISTS cirugia_personal_cirugia_id_rol_key;
ALTER TABLE cirugia_personal DROP CONSTRAINT IF EXISTS cirugia_personal_horario_check;
ALTER TABLE cirugia_personal ADD CONSTRAINT cirugia_personal_horario_check
  CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_fin > hora_inicio);
CREATE INDEX IF NOT EXISTS idx_cirugia_personal_personal_id ON cirugia_personal (personal_id);

ALTER TABLE cirugia_participantes
  ADD COLUMN IF NOT EXISTS hora_inicio TIME,
  ADD COLUMN IF NOT EXISTS hora_fin TIME;
ALTER TABLE cirugia_participantes DROP CONSTRAINT IF EXISTS cirugia_participantes_horario_check;
ALTER TABLE cirugia_participantes ADD CONSTRAINT cirugia_participantes_horario_check
  CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_fin > hora_inicio);

INSERT INTO personal_clinico (nombre, rol_principal)
SELECT DISTINCT ON (lower(trim(nombre))) trim(nombre), rol
  FROM cirugia_personal
 WHERE personal_id IS NULL AND length(trim(nombre)) > 0
ON CONFLICT DO NOTHING;
UPDATE cirugia_personal cp
   SET personal_id = pc.id
  FROM personal_clinico pc
 WHERE cp.personal_id IS NULL AND lower(trim(cp.nombre)) = lower(trim(pc.nombre));

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (filename) VALUES
      ('1800000000370-EquipoQuirurgicoHorarios.ts')
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END $$;

COMMIT;
