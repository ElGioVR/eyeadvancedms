-- ============================================================================
-- Patch: doctores — nombre_completo pasa a ser `alias`
-- ----------------------------------------------------------------------------
-- El valor de doctores.nombre_completo se usa en toda la aplicación como
-- ALIAS de presentación (ej. "DR BAYARDO"), no como nombre real.
--
-- 1. Renombra `nombre_completo` → `alias` (conserva el dato).
-- 2. Agrega `nombre` y `apellido` para la identidad real del doctor
--    (quedan NULL hasta capturarse en la ficha del doctor).
-- Idempotente parcial: si el rename ya se aplicó, fallará con
-- 'column "nombre_completo" does not exist' — en ese caso omítelo.
-- ============================================================================

ALTER TABLE doctores RENAME COLUMN nombre_completo TO alias;

ALTER TABLE doctores
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(255),
  ADD COLUMN IF NOT EXISTS apellido VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_doctores_alias ON doctores(alias);

-- Autolink por email también para administradores (opcional, coherente con
-- la regla de que doctores pueden ligarse a usuario doctor o admin):
UPDATE doctores d
SET usuario_id = u.id
FROM usuarios u
WHERE d.usuario_id IS NULL
  AND d.email IS NOT NULL
  AND LOWER(d.email) = LOWER(u.email)
  AND u.rol IN ('doctor', 'admin');
