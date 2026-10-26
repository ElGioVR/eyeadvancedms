-- Plan de resurtimiento: guarda quién pidió cada lente (modo SOLICITAR) para
-- avisarle cuando el lente se reciba y quede asignado al paciente.
-- Opcional: sin esta columna, el aviso va a quien creó la cirugía.
ALTER TABLE cirugia_lentes
  ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Lentes ya en el plan: se toma a quien creó la cirugía.
UPDATE cirugia_lentes cl
SET creado_por = ac.created_by
FROM agenda_cirugias ac
WHERE ac.id = cl.cirugia_id
  AND cl.modo = 'SOLICITAR'
  AND cl.creado_por IS NULL
  AND ac.created_by IS NOT NULL;
