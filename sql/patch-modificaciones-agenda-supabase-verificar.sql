SELECT 'cat_especialidades (esperado 10)' AS objeto, count(*)::text AS valor FROM cat_especialidades
UNION ALL SELECT 'consultas columnas nuevas (esperado 2)', count(*)::text FROM information_schema.columns WHERE table_name = 'consultas' AND column_name IN ('permite_empalme', 'especialidad_id')
UNION ALL SELECT 'agenda_cirugias columnas nuevas (esperado 5)', count(*)::text FROM information_schema.columns WHERE table_name = 'agenda_cirugias' AND column_name IN ('anestesia', 'motivo_consulta', 'especialidad_id', 'lio_diseno', 'lio_torico')
UNION ALL SELECT 'tablas nuevas (esperado 2)', count(*)::text FROM information_schema.tables WHERE table_name IN ('cirugia_procedimientos', 'cirugia_personal')
UNION ALL SELECT 'triggers anti-empalme (esperado 2)', count(*)::text FROM pg_trigger WHERE tgname IN ('trg_consultas_validar_empalme_ins', 'trg_consultas_validar_empalme_upd')
UNION ALL SELECT 'citas historicas ya empalmadas (solo informativo)', count(*)::text FROM consultas a JOIN consultas b ON a.doctor_id = b.doctor_id AND a.fecha = b.fecha AND a.id < b.id AND COALESCE(a.estatus, '') <> 'CANCELADA' AND COALESCE(b.estatus, '') <> 'CANCELADA' AND a.hora_inicio < COALESCE(b.hora_fin, b.hora_inicio + interval '15 minutes') AND COALESCE(a.hora_fin, a.hora_inicio + interval '15 minutes') > b.hora_inicio
UNION ALL SELECT 'cat_modelos_lio (sembrados del inventario, por verificar)', count(*)::text FROM cat_modelos_lio
UNION ALL SELECT 'agenda_cirugias.modelo_lio_id (esperado 1)', count(*)::text FROM information_schema.columns WHERE table_name = 'agenda_cirugias' AND column_name = 'modelo_lio_id'
UNION ALL SELECT 'personal_clinico (migrados de nombres previos)', count(*)::text FROM personal_clinico
UNION ALL SELECT 'columnas de horario del equipo (esperado 4)', count(*)::text FROM information_schema.columns WHERE table_name IN ('cirugia_personal', 'cirugia_participantes') AND column_name IN ('hora_inicio', 'hora_fin')
UNION ALL SELECT 'personal: medicos / enfermeria', (SELECT count(*) FILTER (WHERE tipo_personal = 'MEDICO') || ' / ' || count(*) FILTER (WHERE tipo_personal = 'ENFERMERO') FROM doctores)
UNION ALL SELECT 'rol de participante enfermero (esperado 1)', count(*)::text FROM cat_roles_participante WHERE clave = 'enfermero'
UNION ALL SELECT 'guardias de honorarios (esperado 2)', count(*)::text FROM pg_trigger WHERE tgname IN ('trg_eventos_honorario_sin_cobro', 'trg_cirugia_productividad_sin_cobro')
UNION ALL SELECT 'columnas pendiente_completar (esperado 2)', count(*)::text FROM information_schema.columns WHERE table_name IN ('pacientes', 'doctores') AND column_name = 'pendiente_completar'
UNION ALL SELECT 'indice unico de alias (esperado 1; 0 = hay alias repetidos)', count(*)::text FROM pg_indexes WHERE indexname = 'uq_doctores_alias_ci'
UNION ALL SELECT 'pacientes / doctores por completar', (SELECT count(*) FROM pacientes WHERE pendiente_completar) || ' / ' || (SELECT count(*) FROM doctores WHERE pendiente_completar);
