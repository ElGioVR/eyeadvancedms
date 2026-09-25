-- ============================================================================
-- Patch: índices de performance + limpieza de RPC muerto
-- ----------------------------------------------------------------------------
-- 1. Índices para las queries más frecuentes (auditoría PERF.IDX.1):
--    - inventario_items(stock): dashboard ordena bajo stock.
--    - (fecha, deployed_to_performance): sync de productividad.
-- 2. Elimina RPC crear_consulta: código muerto (el endpoint inserta directo).
-- Idempotente.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventario_items_stock
  ON inventario_items(stock);

CREATE INDEX IF NOT EXISTS idx_consultas_fecha_deployed
  ON consultas(fecha, deployed_to_performance);

CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_fecha_deployed
  ON agenda_cirugias(fecha, deployed_to_performance);

DROP FUNCTION IF EXISTS crear_consulta(
  p_paciente_id UUID, p_doctor_id UUID, p_fecha DATE, p_hora_inicio TIME,
  p_hora_fin TIME, p_tipo_consulta TEXT, p_tipo_visita TEXT,
  p_diagnostico TEXT, p_notas TEXT, p_metodo_pago TEXT, p_moneda TEXT,
  p_estudios JSONB
);
