-- =====================================================================
-- Logística de lentes (oct 2026): Asignar / Solicitar / Compra directa
-- + plan de resurtimiento. Requiere cirugia_lentes (patch-cirugia-lentes-reservas).
-- Idempotente. Ejecutar manualmente en Supabase.
--
--  modo ASIGNAR        → pieza de inventario comprometida a la cirugía (RESERVADO).
--  modo SOLICITAR      → entra al plan de resurtimiento (sin pieza aún).
--  modo COMPRA_DIRECTA → no genera plan; se recuerda al inicio de jornada y se
--                        confirma "listo" antes de iniciar la cirugía.
-- El plan de resurtimiento son las filas modo='SOLICITAR' (no hay tabla aparte):
-- así cirugía, paciente y fecha siempre están ligados y hay trazabilidad.
-- =====================================================================

ALTER TABLE cirugia_lentes
  ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'ASIGNAR',
  ADD COLUMN IF NOT EXISTS marca BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cilindro NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS estado_logistica TEXT NOT NULL DEFAULT 'LISTO',
  ADD COLUMN IF NOT EXISTS solicitado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS solicitado_por UUID,
  ADD COLUMN IF NOT EXISTS recibido_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recibido_por UUID,
  ADD COLUMN IF NOT EXISTS confirmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmado_por UUID,
  ADD COLUMN IF NOT EXISTS liberado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_liberacion TEXT,
  ADD COLUMN IF NOT EXISTS recordado_fecha DATE;

DO $$ BEGIN
  ALTER TABLE cirugia_lentes ADD CONSTRAINT cirugia_lentes_modo_check
    CHECK (modo IN ('ASIGNAR', 'SOLICITAR', 'COMPRA_DIRECTA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cirugia_lentes ADD CONSTRAINT cirugia_lentes_estado_logistica_check
    CHECK (estado_logistica IN ('POR_SOLICITAR', 'SOLICITADO', 'POR_COMPRAR', 'LISTO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un lente SOLICITADO aún no tiene pieza de inventario.
ALTER TABLE cirugia_lentes DROP CONSTRAINT IF EXISTS cirugia_lentes_inventario_check;
ALTER TABLE cirugia_lentes ADD CONSTRAINT cirugia_lentes_inventario_check CHECK (
  origen = 'HOSPITAL' OR inventario_item_id IS NOT NULL OR modo = 'SOLICITAR');

-- Plan de resurtimiento: pendientes por prioridad de fecha.
CREATE INDEX IF NOT EXISTS idx_cirugia_lentes_plan
  ON cirugia_lentes (estado_logistica)
  WHERE modo = 'SOLICITAR' AND estado = 'RESERVADO';
-- Recordatorio de compra directa.
CREATE INDEX IF NOT EXISTS idx_cirugia_lentes_compra_directa
  ON cirugia_lentes (cirugia_id)
  WHERE modo = 'COMPRA_DIRECTA' AND estado = 'RESERVADO';

-- Historial / completar cirugía (campos finales).
ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS diagnostico_definitivo TEXT,
  ADD COLUMN IF NOT EXISTS cirugia_realizada TEXT,
  ADD COLUMN IF NOT EXISTS complicaciones TEXT;

NOTIFY pgrst, 'reload schema';

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'cirugia_lentes' AND column_name IN ('modo','marca','cilindro','estado_logistica')
 ORDER BY column_name;
