-- Anestesiologos: tipo de personal nuevo + rol de cirugia asegurado.
-- Sus honorarios se manejan en Productividad (evento con rol ANESTESIOLOGO).
-- Idempotente. Pegar completo en el SQL Editor de Supabase.
BEGIN;

ALTER TABLE doctores DROP CONSTRAINT IF EXISTS doctores_tipo_personal_check;
ALTER TABLE doctores ADD CONSTRAINT doctores_tipo_personal_check
  CHECK (tipo_personal IN ('MEDICO', 'ENFERMERO', 'ANESTESIOLOGO'));

INSERT INTO cat_roles_participante (clave, nombre, descripcion, orden)
VALUES ('anestesiologo', U&'Anestesi\00F3logo', 'Responsable de anestesia', 3)
ON CONFLICT (clave) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (filename) VALUES ('1800000000420-Anestesiologos.ts')
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verificacion
SELECT pg_get_constraintdef(oid) AS tipo_personal_check FROM pg_constraint WHERE conname = 'doctores_tipo_personal_check';
