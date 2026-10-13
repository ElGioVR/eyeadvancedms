-- Precio por procedimiento quirúrgico (catálogo quirúrgico).
-- La cirugía deja de pedir "servicio de facturación": el precio sale de aquí
-- (o del servicio de la aseguradora con el mismo nombre, si existe).
-- Idempotente. Ejecutar en Supabase (SQL editor).
ALTER TABLE catalogo_quirurgico
  ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT nombre, ojo, precio FROM catalogo_quirurgico ORDER BY nombre LIMIT 20;
