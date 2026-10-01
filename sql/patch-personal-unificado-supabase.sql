BEGIN;

ALTER TABLE doctores
  ADD COLUMN IF NOT EXISTS tipo_personal TEXT NOT NULL DEFAULT 'MEDICO',
  ADD COLUMN IF NOT EXISTS cobra_honorarios BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS personal_clinico_id UUID UNIQUE;
ALTER TABLE doctores DROP CONSTRAINT IF EXISTS doctores_tipo_personal_check;
ALTER TABLE doctores ADD CONSTRAINT doctores_tipo_personal_check
  CHECK (tipo_personal IN ('MEDICO', 'ENFERMERO'));
CREATE INDEX IF NOT EXISTS idx_doctores_tipo_personal ON doctores (tipo_personal) WHERE activo;

INSERT INTO cat_roles_participante (clave, nombre, descripcion, orden)
VALUES ('enfermero', 'Enfermero(a)', U&'Enfermer\00EDa de apoyo en quir\00F3fano', 6)
ON CONFLICT (clave) DO NOTHING;

DO $rol$
DECLARE
  v_tipo   text;
  v_udt    text;
  r        record;
  v_def    text;
BEGIN
  SELECT data_type, udt_name INTO v_tipo, v_udt
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'rol';
  IF v_tipo IS NULL THEN
    RETURN;
  END IF;
  IF v_tipo = 'USER-DEFINED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = v_udt AND e.enumlabel = 'enfermero'
    ) THEN
      EXECUTE format('ALTER TYPE %I ADD VALUE %L', v_udt, 'enfermero');
    END IF;
  ELSE
    FOR r IN
      SELECT c.conname, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
       WHERE c.conrelid = 'public.usuarios'::regclass
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%recepcionista%'
         AND pg_get_constraintdef(c.oid) NOT LIKE '%enfermero%'
    LOOP
      v_def := regexp_replace(r.def, '''recepcionista''(::[a-z ]+)?', '''recepcionista''\1, ''enfermero''\1');
      EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', r.conname);
      EXECUTE format('ALTER TABLE usuarios ADD CONSTRAINT %I %s', r.conname, v_def);
    END LOOP;
  END IF;
END
$rol$;

DO $mig$
BEGIN
  IF to_regclass('public.personal_clinico') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO doctores (alias, nombre, especialidad, telefono, activo, tipo_personal, cobra_honorarios, personal_clinico_id)
  SELECT pc.nombre, pc.nombre, U&'Enfermer\00EDa', pc.telefono, pc.activo, 'ENFERMERO', false, pc.id
    FROM personal_clinico pc
   WHERE NOT EXISTS (SELECT 1 FROM doctores d WHERE d.personal_clinico_id = pc.id);

  IF to_regclass('public.cirugia_personal') IS NOT NULL THEN
    INSERT INTO cirugia_participantes (cirugia_id, medico_id, rol_id, hora_inicio, hora_fin)
    SELECT cp.cirugia_id, d.id, r.id, cp.hora_inicio, cp.hora_fin
      FROM cirugia_personal cp
      JOIN doctores d ON d.personal_clinico_id = cp.personal_id
      JOIN cat_roles_participante r ON r.clave = cp.rol
    ON CONFLICT (cirugia_id, medico_id, rol_id) DO NOTHING;
  END IF;
END
$mig$;

CREATE OR REPLACE FUNCTION doctor_cobra_honorarios(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $f$
  SELECT COALESCE((SELECT cobra_honorarios FROM doctores WHERE id = p_doctor_id), true);
$f$;

CREATE OR REPLACE FUNCTION omitir_honorario_sin_cobro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $f$
BEGIN
  IF NEW.doctor_id IS NOT NULL AND NOT doctor_cobra_honorarios(NEW.doctor_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END
$f$;

CREATE OR REPLACE FUNCTION omitir_productividad_sin_cobro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $f$
DECLARE
  v_medico uuid;
BEGIN
  SELECT medico_id INTO v_medico FROM cirugia_participantes WHERE id = NEW.participante_id;
  IF v_medico IS NOT NULL AND NOT doctor_cobra_honorarios(v_medico) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END
$f$;

DO $trg$
BEGIN
  IF to_regclass('public.eventos_honorario') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_eventos_honorario_sin_cobro ON eventos_honorario;
    CREATE TRIGGER trg_eventos_honorario_sin_cobro
      BEFORE INSERT ON eventos_honorario
      FOR EACH ROW EXECUTE FUNCTION omitir_honorario_sin_cobro();
  END IF;
  IF to_regclass('public.cirugia_productividad') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_cirugia_productividad_sin_cobro ON cirugia_productividad;
    CREATE TRIGGER trg_cirugia_productividad_sin_cobro
      BEFORE INSERT ON cirugia_productividad
      FOR EACH ROW EXECUTE FUNCTION omitir_productividad_sin_cobro();
  END IF;
END
$trg$;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (filename) VALUES
      ('1800000000390-PersonalUnificado.ts')
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END $$;

COMMIT;
