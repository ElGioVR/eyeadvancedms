BEGIN;

DROP INDEX IF EXISTS uq_doctores_alias_ci;
DROP INDEX IF EXISTS idx_doctores_pendiente_completar;
DROP INDEX IF EXISTS idx_pacientes_pendiente_completar;
ALTER TABLE doctores DROP COLUMN IF EXISTS pendiente_completar;
ALTER TABLE pacientes DROP COLUMN IF EXISTS pendiente_completar;
DROP TRIGGER IF EXISTS trg_eventos_honorario_sin_cobro ON eventos_honorario;
DROP TRIGGER IF EXISTS trg_cirugia_productividad_sin_cobro ON cirugia_productividad;
DROP FUNCTION IF EXISTS omitir_honorario_sin_cobro();
DROP FUNCTION IF EXISTS omitir_productividad_sin_cobro();
DROP FUNCTION IF EXISTS doctor_cobra_honorarios(uuid);
ALTER TABLE doctores DROP CONSTRAINT IF EXISTS doctores_tipo_personal_check;
DROP INDEX IF EXISTS idx_doctores_tipo_personal;
ALTER TABLE doctores DROP COLUMN IF EXISTS personal_clinico_id, DROP COLUMN IF EXISTS cobra_honorarios, DROP COLUMN IF EXISTS tipo_personal;
ALTER TABLE cirugia_participantes DROP CONSTRAINT IF EXISTS cirugia_participantes_horario_check;
ALTER TABLE cirugia_participantes DROP COLUMN IF EXISTS hora_fin, DROP COLUMN IF EXISTS hora_inicio;
ALTER TABLE IF EXISTS cirugia_personal DROP CONSTRAINT IF EXISTS cirugia_personal_horario_check;
ALTER TABLE IF EXISTS cirugia_personal DROP COLUMN IF EXISTS hora_fin, DROP COLUMN IF EXISTS hora_inicio, DROP COLUMN IF EXISTS personal_id;
DROP TABLE IF EXISTS personal_clinico;
ALTER TABLE agenda_cirugias DROP COLUMN IF EXISTS modelo_lio_id;
DROP FUNCTION IF EXISTS sembrar_cat_modelos_lio();
DROP FUNCTION IF EXISTS limpiar_nombre_modelo_lio(text);
DROP TABLE IF EXISTS cat_modelos_lio;
DROP TABLE IF EXISTS cirugia_personal;
DROP TABLE IF EXISTS cirugia_procedimientos;
ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_lio_diseno_check;
ALTER TABLE agenda_cirugias DROP CONSTRAINT IF EXISTS agenda_cirugias_anestesia_check;
ALTER TABLE agenda_cirugias
  DROP COLUMN IF EXISTS lio_torico,
  DROP COLUMN IF EXISTS lio_diseno,
  DROP COLUMN IF EXISTS especialidad_id,
  DROP COLUMN IF EXISTS motivo_consulta,
  DROP COLUMN IF EXISTS anestesia;

DROP INDEX IF EXISTS idx_consultas_especialidad_id;
ALTER TABLE consultas DROP COLUMN IF EXISTS especialidad_id;
DROP TABLE IF EXISTS cat_especialidades;

DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_upd ON consultas;
DROP TRIGGER IF EXISTS trg_consultas_validar_empalme_ins ON consultas;
DROP FUNCTION IF EXISTS consultas_validar_empalme();
ALTER TABLE consultas DROP COLUMN IF EXISTS permite_empalme;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE filename IN (
      '1800000000320-AgendaSinEmpalmesConsultas.ts',
      '1800000000330-CreateCatEspecialidades.ts',
      '1800000000340-AddAnestesiaToAgendaCirugias.ts',
      '1800000000350-AddCamposClinicosCirugia.ts',
      '1800000000360-CreateCatModelosLio.ts',
      '1800000000370-EquipoQuirurgicoHorarios.ts',
      '1800000000380-LimpiarNombresModelosLio.ts',
      '1800000000390-PersonalUnificado.ts'
    );
  END IF;
END $$;

COMMIT;
