-- Fecha de nacimiento opcional en pacientes (migracion 1800000000440).
-- Idempotente. Pegar completo en el SQL Editor de Supabase ANTES de desplegar el codigo.
BEGIN;

ALTER TABLE pacientes ALTER COLUMN fecha_nacimiento DROP NOT NULL;

COMMIT;

-- Verificacion: is_nullable debe ser YES.
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'pacientes' AND column_name = 'fecha_nacimiento';

-- Revision (NO modifica nada): pacientes con la fecha ficticia 2000-01-01 que
-- ponia la API antes. Revisar la lista antes de decidir si se limpian.
SELECT id, nombre_completo, numero_expediente, created_at
  FROM pacientes
 WHERE fecha_nacimiento = DATE '2000-01-01'
 ORDER BY created_at DESC;
