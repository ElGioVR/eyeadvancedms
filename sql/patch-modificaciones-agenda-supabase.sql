BEGIN;

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS permite_empalme BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION consultas_validar_empalme()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fin_nuevo time;
  v_choque    record;
BEGIN
  IF NEW.permite_empalme
     OR NEW.doctor_id IS NULL
     OR NEW.fecha IS NULL
     OR NEW.hora_inicio IS NULL
     OR COALESCE(NEW.estatus, '') = 'CANCELADA' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('agenda:' || NEW.doctor_id::text || ':' || NEW.fecha::text)
  );

  v_fin_nuevo := COALESCE(NEW.hora_fin, NEW.hora_inicio + interval '15 minutes');

  SELECT c.id, c.hora_inicio, c.hora_fin
    INTO v_choque
    FROM consultas c
   WHERE c.doctor_id = NEW.doctor_id
     AND c.fecha = NEW.fecha
     AND c.id IS DISTINCT FROM NEW.id
     AND COALESCE(c.estatus, '') <> 'CANCELADA'
     AND c.hora_inicio IS NOT NULL
     AND c.hora_inicio < v_fin_nuevo
     AND COALESCE(c.hora_fin, c.hora_inicio + interval '15 minutes') > NEW.hora_inicio
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'EMPALME_AGENDA'
      USING ERRCODE = '23P01',
            DETAIL = format('consulta_id=%s hora_inicio=%s hora_fin=%s',
                            v_choque.id, v_choque.hora_inicio, v_choque.hora_fin);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_ins ON consultas;
CREATE TRIGGER trg_consultas_validar_empalme_ins
  BEFORE INSERT ON consultas
  FOR EACH ROW EXECUTE FUNCTION consultas_validar_empalme();

DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_upd ON consultas;
CREATE TRIGGER trg_consultas_validar_empalme_upd
  BEFORE UPDATE ON consultas
  FOR EACH ROW
  WHEN (
       OLD.fecha IS DISTINCT FROM NEW.fecha
    OR OLD.hora_inicio IS DISTINCT FROM NEW.hora_inicio
    OR OLD.hora_fin IS DISTINCT FROM NEW.hora_fin
    OR OLD.doctor_id IS DISTINCT FROM NEW.doctor_id
    OR (OLD.estatus = 'CANCELADA' AND NEW.estatus IS DISTINCT FROM 'CANCELADA')
  )
  EXECUTE FUNCTION consultas_validar_empalme();

CREATE TABLE IF NOT EXISTS cat_especialidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cat_especialidades (clave, nombre, orden) VALUES
  ('oftalmologia', U&'Oftalmolog\00EDa', 1),
  ('oftalmologia_pediatrica', U&'Oftalmolog\00EDa Pedi\00E1trica', 2),
  ('glaucoma', 'Glaucoma', 3),
  ('retina', 'Retina', 4),
  ('catarata_refractiva', U&'Catarata y Cirug\00EDa Refractiva', 5),
  ('cornea', U&'C\00F3rnea y Superficie Ocular', 6),
  ('estrabismo', 'Estrabismo', 7),
  ('optometria', U&'Optometr\00EDa', 8),
  ('neuroftalmologia', U&'Neuroftalmolog\00EDa', 9),
  ('oculoplastica', U&'Oculopl\00E1stica', 10)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE cat_especialidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cat_especialidades_select_authenticated ON cat_especialidades;
CREATE POLICY cat_especialidades_select_authenticated ON cat_especialidades
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cat_especialidades_admin_write ON cat_especialidades;
CREATE POLICY cat_especialidades_admin_write ON cat_especialidades
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS especialidad_id UUID REFERENCES cat_especialidades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_consultas_especialidad_id ON consultas (especialidad_id);

UPDATE doctores SET especialidad = U&'C\00F3rnea y Superficie Ocular'
 WHERE especialidad = 'Cornea y Superficie Ocular';

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS anestesia TEXT;

ALTER TABLE agenda_cirugias
  DROP CONSTRAINT IF EXISTS agenda_cirugias_anestesia_check;
ALTER TABLE agenda_cirugias
  ADD CONSTRAINT agenda_cirugias_anestesia_check
  CHECK (anestesia IS NULL OR anestesia IN ('LOCAL_SEDACION', 'LOCAL', 'GENERAL'));

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS motivo_consulta TEXT,
  ADD COLUMN IF NOT EXISTS especialidad_id UUID REFERENCES cat_especialidades(id) ON DELETE SET NULL;

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS lio_diseno TEXT,
  ADD COLUMN IF NOT EXISTS lio_torico BOOLEAN;
ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_lio_diseno_check;
ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_lio_diseno_check
  CHECK (lio_diseno IS NULL OR lio_diseno IN ('MONOFOCAL', 'TRIFOCAL'));

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

CREATE TABLE IF NOT EXISTS cat_modelos_lio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabricante TEXT NOT NULL CHECK (length(trim(fabricante)) > 0),
  modelo TEXT NOT NULL CHECK (length(trim(modelo)) > 0),
  diseno TEXT NOT NULL CHECK (diseno IN ('MONOFOCAL', 'TRIFOCAL', 'MULTIFOCAL', 'EDOF', 'OTRO')),
  torico BOOLEAN NOT NULL DEFAULT false,
  verificado BOOLEAN NOT NULL DEFAULT false,
  origen TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origen IN ('MANUAL', 'INVENTARIO', 'CSV')),
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_modelos_lio_modelo
  ON cat_modelos_lio (lower(fabricante), lower(modelo), torico);
CREATE INDEX IF NOT EXISTS idx_cat_modelos_lio_tipo
  ON cat_modelos_lio (diseno, torico) WHERE activo;

ALTER TABLE cat_modelos_lio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cat_modelos_lio_select_authenticated ON cat_modelos_lio;
CREATE POLICY cat_modelos_lio_select_authenticated ON cat_modelos_lio
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cat_modelos_lio_admin_write ON cat_modelos_lio;
CREATE POLICY cat_modelos_lio_admin_write ON cat_modelos_lio
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS modelo_lio_id UUID REFERENCES cat_modelos_lio(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION sembrar_cat_modelos_lio()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  cols      text[];
  e_fab     text;
  e_mod     text;
  e_filtro  text;
  e_tipo    text := 'NULL::text';
  e_cil     text := 'NULL::numeric';
  e_addi    text := 'NULL::numeric';
  e_addn    text := 'NULL::numeric';
  partes    text[] := '{}';
  n         integer := 0;
BEGIN
  IF to_regclass('public.inventario_items') IS NULL OR to_regclass('public.cat_modelos_lio') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(column_name::text) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'inventario_items';

  IF 'manufacturer' = ANY (cols) AND 'marca' = ANY (cols) THEN
    e_fab := 'COALESCE(NULLIF(trim(manufacturer), ''''), NULLIF(trim(marca::text), ''''))';
  ELSIF 'manufacturer' = ANY (cols) THEN
    e_fab := 'NULLIF(trim(manufacturer), '''')';
  ELSIF 'marca' = ANY (cols) THEN
    e_fab := 'NULLIF(trim(marca::text), '''')';
  ELSE
    RETURN 0;
  END IF;

  IF 'product_name' = ANY (cols) AND 'model' = ANY (cols) THEN
    partes := array_append(partes, 'CASE WHEN NULLIF(trim(product_name), '''') IS NULL THEN NULLIF(trim(model), '''') WHEN NULLIF(trim(model), '''') IS NULL OR product_name ILIKE (''%'' || trim(model) || ''%'') THEN trim(product_name) ELSE trim(product_name) || '' '' || trim(model) END');
  ELSIF 'model' = ANY (cols) THEN
    partes := array_append(partes, 'NULLIF(trim(model), '''')');
  END IF;
  IF 'modelo' = ANY (cols) THEN partes := array_append(partes, 'NULLIF(trim(modelo::text), '''')'); END IF;
  IF 'modelo_fabricante' = ANY (cols) THEN partes := array_append(partes, 'NULLIF(trim(modelo_fabricante::text), '''')'); END IF;
  IF array_length(partes, 1) IS NULL THEN
    RETURN 0;
  END IF;
  e_mod := 'COALESCE(' || array_to_string(partes, ', ') || ')';

  IF 'tipo_lio' = ANY (cols) THEN e_tipo := 'tipo_lio::text'; END IF;
  IF 'cylinder' = ANY (cols) THEN e_cil := 'cylinder::numeric'; END IF;
  IF 'add_intermediate' = ANY (cols) THEN e_addi := 'add_intermediate::numeric'; END IF;
  IF 'add_near' = ANY (cols) THEN e_addn := 'add_near::numeric'; END IF;

  IF 'tipo' = ANY (cols) AND 'manufacturer' = ANY (cols) THEN
    e_filtro := '(tipo::text = ''LENTE_INTRAOCULAR'' OR NULLIF(trim(manufacturer), '''') IS NOT NULL)';
  ELSIF 'tipo' = ANY (cols) THEN
    e_filtro := 'tipo::text = ''LENTE_INTRAOCULAR''';
  ELSE
    e_filtro := 'true';
  END IF;

  EXECUTE format($q$
    INSERT INTO cat_modelos_lio (fabricante, modelo, diseno, torico, origen, verificado)
    SELECT DISTINCT ON (lower(f), lower(m), t) f, m, d, t, 'INVENTARIO', false
      FROM (
        SELECT f, m,
               CASE
                 WHEN tl = 'EDOF' THEN 'EDOF'
                 WHEN COALESCE(ai, 0) > 0 AND COALESCE(an, 0) > 0 THEN 'TRIFOCAL'
                 WHEN m ~* '(panoptix|trifocal|finevision|lisa tri|trinova)' THEN 'TRIFOCAL'
                 WHEN COALESCE(an, 0) > 0 OR tl = 'MULTIFOCAL' THEN 'MULTIFOCAL'
                 WHEN tl = 'OTRO' THEN 'OTRO'
                 ELSE 'MONOFOCAL'
               END AS d,
               (COALESCE(cil, 0) <> 0 OR COALESCE(tl, '') = 'TORICA' OR m ~* 'toric') AS t
          FROM (
            SELECT %1$s AS f, %2$s AS m, %3$s AS tl, %4$s AS cil, %5$s AS ai, %6$s AS an
              FROM inventario_items
             WHERE %7$s
          ) base
         WHERE f IS NOT NULL AND m IS NOT NULL
      ) s
    ON CONFLICT DO NOTHING
  $q$, e_fab, e_mod, e_tipo, e_cil, e_addi, e_addn, e_filtro);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

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

CREATE OR REPLACE FUNCTION limpiar_nombre_modelo_lio(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  w      text[];
  n      integer;
  ult    text;
  i      integer;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  w := regexp_split_to_array(trim(p), '\s+');
  n := array_length(w, 1);
  IF n IS NULL OR n < 2 THEN
    RETURN trim(p);
  END IF;
  ult := w[n];
  FOR i IN 1 .. n - 1 LOOP
    IF upper(w[i]) = upper(ult) THEN
      RETURN array_to_string(w[1:n - 1], ' ');
    END IF;
    IF length(w[i]) >= 3 AND w[i] ~ '[0-9]' AND upper(ult) LIKE upper(w[i]) || '%'
       AND length(ult) - length(w[i]) <= 3 THEN
      w[i] := ult;
      RETURN array_to_string(w[1:n - 1], ' ');
    END IF;
  END LOOP;
  RETURN array_to_string(w, ' ');
END
$fn$;

CREATE OR REPLACE FUNCTION sembrar_cat_modelos_lio()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  cols      text[];
  e_fab     text;
  e_mod     text;
  e_filtro  text;
  e_tipo    text := 'NULL::text';
  e_cil     text := 'NULL::numeric';
  e_addi    text := 'NULL::numeric';
  e_addn    text := 'NULL::numeric';
  partes    text[] := '{}';
  n         integer := 0;
BEGIN
  IF to_regclass('public.inventario_items') IS NULL OR to_regclass('public.cat_modelos_lio') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(column_name::text) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'inventario_items';

  IF 'manufacturer' = ANY (cols) AND 'marca' = ANY (cols) THEN
    e_fab := 'COALESCE(NULLIF(trim(manufacturer), ''''), NULLIF(trim(marca::text), ''''))';
  ELSIF 'manufacturer' = ANY (cols) THEN
    e_fab := 'NULLIF(trim(manufacturer), '''')';
  ELSIF 'marca' = ANY (cols) THEN
    e_fab := 'NULLIF(trim(marca::text), '''')';
  ELSE
    RETURN 0;
  END IF;

  IF 'product_name' = ANY (cols) AND 'model' = ANY (cols) THEN
    partes := array_append(partes, 'CASE WHEN NULLIF(trim(product_name), '''') IS NULL THEN NULLIF(trim(model), '''') WHEN NULLIF(trim(model), '''') IS NULL OR product_name ILIKE (''%'' || trim(model) || ''%'') THEN trim(product_name) ELSE trim(product_name) || '' '' || trim(model) END');
  ELSIF 'model' = ANY (cols) THEN
    partes := array_append(partes, 'NULLIF(trim(model), '''')');
  END IF;
  IF 'modelo' = ANY (cols) THEN partes := array_append(partes, 'NULLIF(trim(modelo::text), '''')'); END IF;
  IF 'modelo_fabricante' = ANY (cols) THEN partes := array_append(partes, 'NULLIF(trim(modelo_fabricante::text), '''')'); END IF;
  IF array_length(partes, 1) IS NULL THEN
    RETURN 0;
  END IF;
  e_mod := 'COALESCE(' || array_to_string(partes, ', ') || ')';

  IF 'tipo_lio' = ANY (cols) THEN e_tipo := 'tipo_lio::text'; END IF;
  IF 'cylinder' = ANY (cols) THEN e_cil := 'cylinder::numeric'; END IF;
  IF 'add_intermediate' = ANY (cols) THEN e_addi := 'add_intermediate::numeric'; END IF;
  IF 'add_near' = ANY (cols) THEN e_addn := 'add_near::numeric'; END IF;

  IF 'tipo' = ANY (cols) AND 'manufacturer' = ANY (cols) THEN
    e_filtro := '(tipo::text = ''LENTE_INTRAOCULAR'' OR NULLIF(trim(manufacturer), '''') IS NOT NULL)';
  ELSIF 'tipo' = ANY (cols) THEN
    e_filtro := 'tipo::text = ''LENTE_INTRAOCULAR''';
  ELSE
    e_filtro := 'true';
  END IF;

  EXECUTE format($q$
    INSERT INTO cat_modelos_lio (fabricante, modelo, diseno, torico, origen, verificado)
    SELECT DISTINCT ON (lower(f), lower(m), t) f, m, d, t, 'INVENTARIO', false
      FROM (
        SELECT f, m,
               CASE
                 WHEN tl = 'EDOF' THEN 'EDOF'
                 WHEN COALESCE(ai, 0) > 0 AND COALESCE(an, 0) > 0 THEN 'TRIFOCAL'
                 WHEN m ~* '(panoptix|trifocal|finevision|lisa tri|trinova)' THEN 'TRIFOCAL'
                 WHEN COALESCE(an, 0) > 0 OR tl = 'MULTIFOCAL' THEN 'MULTIFOCAL'
                 WHEN tl = 'OTRO' THEN 'OTRO'
                 ELSE 'MONOFOCAL'
               END AS d,
               (COALESCE(cil, 0) <> 0 OR COALESCE(tl, '') = 'TORICA' OR m ~* 'toric') AS t
          FROM (
            SELECT %1$s AS f, limpiar_nombre_modelo_lio(%2$s) AS m, %3$s AS tl, %4$s AS cil, %5$s AS ai, %6$s AS an
              FROM inventario_items
             WHERE %7$s
          ) base
         WHERE f IS NOT NULL AND m IS NOT NULL
      ) s
    ON CONFLICT DO NOTHING
  $q$, e_fab, e_mod, e_tipo, e_cil, e_addi, e_addn, e_filtro);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

SELECT sembrar_cat_modelos_lio() AS modelos_agregados;

UPDATE cat_modelos_lio c
   SET modelo = limpiar_nombre_modelo_lio(c.modelo), updated_at = now()
 WHERE c.origen = 'INVENTARIO'
   AND NOT c.verificado
   AND limpiar_nombre_modelo_lio(c.modelo) <> c.modelo
   AND NOT EXISTS (
     SELECT 1 FROM cat_modelos_lio o
      WHERE o.id <> c.id
        AND lower(o.fabricante) = lower(c.fabricante)
        AND lower(o.modelo) = lower(limpiar_nombre_modelo_lio(c.modelo))
        AND o.torico = c.torico
   );

UPDATE cat_modelos_lio c
   SET activo = false, updated_at = now()
 WHERE c.origen = 'INVENTARIO'
   AND NOT c.verificado
   AND c.activo
   AND limpiar_nombre_modelo_lio(c.modelo) <> c.modelo
   AND EXISTS (
     SELECT 1 FROM cat_modelos_lio o
      WHERE o.id <> c.id
        AND lower(o.fabricante) = lower(c.fabricante)
        AND lower(o.modelo) = lower(limpiar_nombre_modelo_lio(c.modelo))
        AND o.torico = c.torico
   );

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

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS pendiente_completar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE doctores ADD COLUMN IF NOT EXISTS pendiente_completar BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pacientes_pendiente_completar ON pacientes (id) WHERE pendiente_completar;
CREATE INDEX IF NOT EXISTS idx_doctores_pendiente_completar ON doctores (id) WHERE pendiente_completar;

DO $alias$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_doctores_alias_ci') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM doctores
     WHERE activo
     GROUP BY upper(btrim(regexp_replace(alias, '\s+', ' ', 'g')))
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Hay doctores activos con el mismo alias (sin distinguir mayusculas). Unificalos y vuelve a correr el script para crear el indice unico.';
    RETURN;
  END IF;
  CREATE UNIQUE INDEX uq_doctores_alias_ci
    ON doctores (upper(btrim(regexp_replace(alias, '\s+', ' ', 'g'))))
    WHERE activo;
END
$alias$;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (filename) VALUES
      ('1800000000320-AgendaSinEmpalmesConsultas.ts'),
      ('1800000000330-CreateCatEspecialidades.ts'),
      ('1800000000340-AddAnestesiaToAgendaCirugias.ts'),
      ('1800000000350-AddCamposClinicosCirugia.ts'),
      ('1800000000360-CreateCatModelosLio.ts'),
      ('1800000000370-EquipoQuirurgicoHorarios.ts'),
      ('1800000000380-LimpiarNombresModelosLio.ts'),
      ('1800000000390-PersonalUnificado.ts'),
      ('1800000000400-ImportSinDuplicados.ts')
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END $$;

COMMIT;
