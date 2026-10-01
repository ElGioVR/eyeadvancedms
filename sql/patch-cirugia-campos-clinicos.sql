-- =====================================================================
-- Cirugía: campos clínicos restantes (Modificaciones agenda, punto I)
-- Mismo contenido que src/migrations/1800000000350-AddCamposClinicosCirugia.ts
-- Requiere 1800000000330 (cat_especialidades). Idempotente.
-- Aplicar SOLO tras revisión; primero en BD local desechable.
-- =====================================================================

-- I.1 Datos generales de la cirugía
ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS motivo_consulta TEXT,
  ADD COLUMN IF NOT EXISTS especialidad_id UUID REFERENCES cat_especialidades(id) ON DELETE SET NULL;

-- I.2 Tipo de LIO: diseño (monofocal / trifocal) × tórico (sí / no)
ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS lio_diseno TEXT,
  ADD COLUMN IF NOT EXISTS lio_torico BOOLEAN;
ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_lio_diseno_check;
ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_lio_diseno_check
  CHECK (lio_diseno IS NULL OR lio_diseno IN ('MONOFOCAL', 'TRIFOCAL'));

-- I.2 Procedimientos adicionales (el principal sigue en agenda_cirugias.servicio_id;
-- productividad/honorarios solo usan el principal).
CREATE TABLE IF NOT EXISTS cirugia_procedimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
  servicio_id UUID REFERENCES aseguranza_servicios(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cirugia_id, servicio_id)
);
CREATE INDEX IF NOT EXISTS idx_cirugia_procedimientos_cirugia_id ON cirugia_procedimientos (cirugia_id);

-- I.2 Personal de apoyo no médico (instrumentista, enfermero, circulante) por nombre.
-- Los médicos registrados siguen en cirugia_participantes (conflictos y honorarios).
CREATE TABLE IF NOT EXISTS cirugia_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('instrumentista', 'enfermero', 'circulante')),
  nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cirugia_id, rol)
);
CREATE INDEX IF NOT EXISTS idx_cirugia_personal_cirugia_id ON cirugia_personal (cirugia_id);

ALTER TABLE cirugia_procedimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cirugia_procedimientos_admin_all ON cirugia_procedimientos;
CREATE POLICY cirugia_procedimientos_admin_all ON cirugia_procedimientos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
DROP POLICY IF EXISTS cirugia_procedimientos_recepcionista_all ON cirugia_procedimientos;
CREATE POLICY cirugia_procedimientos_recepcionista_all ON cirugia_procedimientos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'recepcionista'));
DROP POLICY IF EXISTS cirugia_procedimientos_doctor_own ON cirugia_procedimientos;
CREATE POLICY cirugia_procedimientos_doctor_own ON cirugia_procedimientos FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agenda_cirugias ac
    JOIN doctores d ON d.id = ac.doctor_id
    WHERE ac.id = cirugia_procedimientos.cirugia_id AND d.usuario_id = auth.uid()
  ));

ALTER TABLE cirugia_personal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cirugia_personal_admin_all ON cirugia_personal;
CREATE POLICY cirugia_personal_admin_all ON cirugia_personal FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));
DROP POLICY IF EXISTS cirugia_personal_recepcionista_all ON cirugia_personal;
CREATE POLICY cirugia_personal_recepcionista_all ON cirugia_personal FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'recepcionista'));
DROP POLICY IF EXISTS cirugia_personal_doctor_own ON cirugia_personal;
CREATE POLICY cirugia_personal_doctor_own ON cirugia_personal FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agenda_cirugias ac
    JOIN doctores d ON d.id = ac.doctor_id
    WHERE ac.id = cirugia_personal.cirugia_id AND d.usuario_id = auth.uid()
  ));
