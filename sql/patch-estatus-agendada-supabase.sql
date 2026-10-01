-- Agrega AGENDADA (y FINALIZADA) al CHECK chk_estatus de consultas.
-- POST /api/consultas inserta estatus = 'AGENDADA'; sin este patch el insert falla
-- con "violates check constraint chk_estatus" y la API responde "Error interno del servidor".
-- Idempotente. Pegar completo en el SQL Editor de Supabase.
BEGIN;

ALTER TABLE consultas DROP CONSTRAINT IF EXISTS chk_estatus;
ALTER TABLE consultas ADD CONSTRAINT chk_estatus CHECK (estatus IN (
  'BORRADOR', 'AGENDADA', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA',
  'APLAZADA', 'REAGENDADA', 'COMPLETADA', 'CANCELADA', 'FINALIZADA'
));

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (filename) VALUES
      ('1800000000410-AddEstatusAgendadaConsultas.ts')
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verificacion: debe listar AGENDADA dentro del CHECK
SELECT pg_get_constraintdef(oid) AS chk_estatus
  FROM pg_constraint
 WHERE conname = 'chk_estatus' AND conrelid = 'consultas'::regclass;
