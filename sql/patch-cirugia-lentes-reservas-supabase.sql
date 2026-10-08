-- =====================================================================
-- Comentarios clínica (oct 2026) — Fase 0. Cambios ADITIVOS e idempotentes.
-- Equivale a src/migrations/1800000000500-CirugiaLentesReservasTipoCaso.ts
-- Ejecutar manualmente en Supabase (SQL Editor). No borra datos.
-- =====================================================================
BEGIN;

-- 1) agenda_cirugias: tipo de caso, reagenda, procedencia y tiempos
ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS tipo_caso TEXT NOT NULL DEFAULT 'PRIMERA',
  ADD COLUMN IF NOT EXISTS reagenda_de_id UUID REFERENCES agenda_cirugias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS procedencia TEXT,
  ADD COLUMN IF NOT EXISTS tiempo_cx_min INTEGER,
  ADD COLUMN IF NOT EXISTS tiempo_estancia_min INTEGER;

DO $$ BEGIN
  ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_tipo_caso_check
    CHECK (tipo_caso IN ('PRIMERA', 'REAGENDA', 'REINTERVENCION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agenda_cirugias ADD CONSTRAINT agenda_cirugias_tiempos_check
    CHECK ((tiempo_cx_min IS NULL OR tiempo_cx_min >= 0)
       AND (tiempo_estancia_min IS NULL OR tiempo_estancia_min >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_paciente_fecha_ojo
  ON agenda_cirugias (paciente_id, fecha, ojo);
CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_reagenda_de
  ON agenda_cirugias (reagenda_de_id) WHERE reagenda_de_id IS NOT NULL;

-- 2) cirugia_lentes: hasta 3 lentes por cirugía (PRIMERO / SEGUNDO / RESPALDO)
CREATE TABLE IF NOT EXISTS cirugia_lentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cirugia_id UUID NOT NULL REFERENCES agenda_cirugias(id) ON DELETE CASCADE,
  orden TEXT NOT NULL CHECK (orden IN ('PRIMERO', 'SEGUNDO', 'RESPALDO')),
  origen TEXT NOT NULL CHECK (origen IN ('INVENTARIO', 'HOSPITAL')),
  inventario_item_id UUID REFERENCES inventario_items(id) ON DELETE SET NULL,
  fabricante TEXT,
  modelo TEXT,
  poder_d NUMERIC(5,2),
  torico BOOLEAN NOT NULL DEFAULT false,
  estado TEXT NOT NULL DEFAULT 'RESERVADO' CHECK (estado IN ('RESERVADO', 'USADO', 'LIBERADO')),
  requerido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cirugia_lentes_inventario_check CHECK (origen = 'HOSPITAL' OR inventario_item_id IS NOT NULL),
  CONSTRAINT cirugia_lentes_requerido_check CHECK (NOT requerido OR estado = 'USADO')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cirugia_lentes_cirugia_orden
  ON cirugia_lentes (cirugia_id, orden);
CREATE INDEX IF NOT EXISTS idx_cirugia_lentes_item_reservado
  ON cirugia_lentes (inventario_item_id) WHERE estado = 'RESERVADO';

ALTER TABLE cirugia_lentes ENABLE ROW LEVEL SECURITY;

-- 3) Catálogo de servicios: bandera de LIO (activa el bloque LIO en el formulario)
ALTER TABLE aseguranza_servicios
  ADD COLUMN IF NOT EXISTS requiere_lio BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- Verificación (debe devolver 3 filas de columnas nuevas y 1 de tabla)
SELECT table_name, column_name FROM information_schema.columns
 WHERE (table_name = 'agenda_cirugias' AND column_name IN ('tipo_caso','reagenda_de_id','procedencia','tiempo_cx_min','tiempo_estancia_min'))
    OR (table_name = 'aseguranza_servicios' AND column_name = 'requiere_lio')
 ORDER BY table_name, column_name;
SELECT to_regclass('public.cirugia_lentes') AS cirugia_lentes;
