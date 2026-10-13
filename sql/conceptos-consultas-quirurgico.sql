-- Catálogos de Configuración → Conceptos:
--   catalogo_consultas : conceptos genéricos de consulta (se arrastran a aseguradoras).
--   catalogo_quirurgico: lista quirúrgica separada (nombre + ojo, sin precio por aseguradora).
-- Idempotente. NO ejecutar hasta revisar. La conexión del selector de cirugías
-- queda pendiente (cirugias.servicio_id apunta a aseguranza_servicios).
BEGIN;

CREATE TABLE IF NOT EXISTS catalogo_consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  costo DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogo_consultas_nombre
  ON catalogo_consultas (lower(btrim(nombre)));

CREATE TABLE IF NOT EXISTS catalogo_quirurgico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  ojo VARCHAR(2) CHECK (ojo IN ('OD', 'OI', 'OU')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogo_quirurgico_nombre_ojo
  ON catalogo_quirurgico (lower(btrim(nombre)), coalesce(ojo, ''));

COMMIT;

-- Verificación
SELECT 'catalogo_consultas' AS tabla, count(*) AS filas FROM catalogo_consultas
UNION ALL
SELECT 'catalogo_quirurgico', count(*) FROM catalogo_quirurgico;
