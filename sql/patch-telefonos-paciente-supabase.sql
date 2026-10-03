-- Hasta 3 telefonos por paciente con etiqueta y uno principal (migracion 1800000000470).
-- Idempotente. Se puede aplicar antes o despues de desplegar el codigo:
-- sin estas columnas la app sigue funcionando con un solo telefono.
BEGIN;

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS telefonos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS telefonos_busqueda text;

-- Los pacientes que ya tienen telefono lo conservan como principal.
UPDATE pacientes
   SET telefonos = jsonb_build_array(jsonb_build_object('numero', telefono, 'etiqueta', 'Celular', 'principal', true)),
       telefonos_busqueda = regexp_replace(telefono, '\D', '', 'g')
 WHERE telefono IS NOT NULL AND btrim(telefono) <> '' AND telefonos = '[]'::jsonb;

COMMIT;

-- Verificacion: pacientes con telefono y su lista.
SELECT count(*) FILTER (WHERE telefono IS NOT NULL) AS con_telefono,
       count(*) FILTER (WHERE jsonb_array_length(telefonos) > 0) AS con_lista
  FROM pacientes;
