-- Historial de cirugía: permite registrar edición de notas y confirmación de la cita
-- (y LENTES_RESUELTOS, que el código ya escribía). Idempotente.
-- Consultas no necesita cambios: usan tipo_evento 'EDICION' con payload.accion.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cirugia_historial'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%accion%'
  LOOP
    EXECUTE format('ALTER TABLE public.cirugia_historial DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.cirugia_historial
  ADD CONSTRAINT cirugia_historial_accion_check CHECK (accion IN (
    'CIRUGIA_CREADA', 'LIO_ASIGNADO', 'PARTICIPANTE_ASIGNADO',
    'ARCHIVO_AGREGADO', 'ARCHIVO_ELIMINADO', 'ESTADO_CAMBIADO',
    'LENTES_RESUELTOS', 'NOTAS_EDITADAS', 'CONFIRMACION_CITA'
  ));
