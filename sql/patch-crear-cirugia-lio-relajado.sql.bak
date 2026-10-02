-- ============================================================================
-- Patch: crear_cirugia — VAL-006 relajada (LIO)
-- ----------------------------------------------------------------------------
-- Problema: la versión estricta exige tipo = 'LENTE_INTRAOCULAR' en
-- inventario_items, pero los items existentes pueden no estar tipados
-- (tipo default 'LENTE_VISION' sin tipo_lio/potencia_dioptrias), lo que
-- bloquea la creación de cirugías con LIO.
--
-- Criterio relajado: el ítem es aceptado como LIO si cumple ALGUNO:
--   - tipo = 'LENTE_INTRAOCULAR'
--   - tipo_lio IS NOT NULL
--   - potencia_dioptrias IS NOT NULL
-- Se mantienen las validaciones de estado, stock y caducidad.
--
-- Nota: CREATE OR REPLACE conserva permisos otorgados previamente.
-- Idempotente: puede ejecutarse varias veces sin efecto secundario.
-- Solo si Supabase devuelve error de firma ("cannot change name of input
-- parameter"), descomenta la siguiente línea, ejecútala y vuelve a correr todo:
-- DROP FUNCTION IF EXISTS crear_cirugia(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID, TEXT, UUID, UUID, JSONB, TEXT, UUID);
-- ============================================================================

CREATE OR REPLACE FUNCTION crear_cirugia(
  p_paciente_id UUID,
  p_origen_id UUID,
  p_servicio_id UUID,
  p_fecha DATE,
  p_hora TIME,
  p_duracion_min INTEGER,
  p_recurso_id UUID DEFAULT NULL,
  p_ojo TEXT DEFAULT NULL,
  p_inventario_item_id UUID DEFAULT NULL,
  p_lio TEXT DEFAULT NULL,
  p_marca_lio TEXT DEFAULT NULL,
  p_consulta_id UUID DEFAULT NULL,
  p_participantes JSONB DEFAULT '[]',
  p_notas TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cirugia_id UUID;
  v_codigo TEXT;
  v_seq INT;
  v_paciente_nombre TEXT;
  v_servicio_nombre TEXT;
  v_servicio_origen_id UUID;
  v_servicio_tipo TEXT;
  v_cirujano_id UUID;
  v_participante JSONB;
  v_medico_id UUID;
  v_rol_id UUID;
  v_participante_id UUID;
  v_tiene_cirujano BOOLEAN := false;
  v_usuario_id UUID;
BEGIN
  v_usuario_id := COALESCE(p_created_by, auth.uid());

  -- ---------------------------------------------------------------
  -- Validaciones básicas de entrada
  -- ---------------------------------------------------------------
  IF p_paciente_id IS NULL THEN
    RAISE EXCEPTION 'El paciente es obligatorio';
  END IF;
  IF p_origen_id IS NULL THEN
    RAISE EXCEPTION 'El origen es obligatorio';
  END IF;
  IF p_servicio_id IS NULL THEN
    RAISE EXCEPTION 'El servicio es obligatorio';
  END IF;
  IF p_fecha IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'La fecha y hora son obligatorias';
  END IF;
  IF p_duracion_min IS NULL OR p_duracion_min <= 0 THEN
    RAISE EXCEPTION 'La duración estimada debe ser mayor a 0 minutos';
  END IF;
  IF p_ojo IS NULL OR p_ojo NOT IN ('OD', 'OI', 'OU') THEN
    RAISE EXCEPTION 'El ojo debe ser OD, OI o OU';
  END IF;

  -- ---------------------------------------------------------------
  -- VAL-001: Paciente existe
  -- ---------------------------------------------------------------
  SELECT nombre_completo INTO v_paciente_nombre
  FROM pacientes
  WHERE id = p_paciente_id;

  IF v_paciente_nombre IS NULL THEN
    RAISE EXCEPTION 'El paciente seleccionado no existe';
  END IF;

  -- ---------------------------------------------------------------
  -- VAL-002: Origen existe y está activo
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM aseguranzas
    WHERE id = p_origen_id AND activo = true
  ) THEN
    RAISE EXCEPTION 'El origen seleccionado no existe o no está activo';
  END IF;

  -- ---------------------------------------------------------------
  -- VAL-003: Servicio existe, activo y es procedimiento
  -- ---------------------------------------------------------------
  SELECT nombre, aseguranza_id, tipo
  INTO v_servicio_nombre, v_servicio_origen_id, v_servicio_tipo
  FROM aseguranza_servicios
  WHERE id = p_servicio_id AND activo = true;

  IF v_servicio_nombre IS NULL THEN
    RAISE EXCEPTION 'El servicio seleccionado no existe o no está activo';
  END IF;

  IF v_servicio_tipo != 'PROCEDIMIENTO' THEN
    RAISE EXCEPTION 'El servicio seleccionado no es un procedimiento quirúrgico';
  END IF;

  -- Servicio debe corresponder al origen
  IF v_servicio_origen_id IS DISTINCT FROM p_origen_id THEN
    RAISE EXCEPTION 'El servicio no corresponde al origen seleccionado';
  END IF;

  -- ---------------------------------------------------------------
  -- Validar participantes
  -- ---------------------------------------------------------------
  IF jsonb_array_length(p_participantes) IS NULL OR jsonb_array_length(p_participantes) = 0 THEN
    RAISE EXCEPTION 'Debe asignar al menos un participante';
  END IF;

  FOR v_participante IN SELECT * FROM jsonb_array_elements(p_participantes)
  LOOP
    v_medico_id := (v_participante->>'medico_id')::UUID;
    v_rol_id := (v_participante->>'rol_id')::UUID;

    IF v_medico_id IS NULL OR v_rol_id IS NULL THEN
      RAISE EXCEPTION 'Cada participante debe tener médico y rol';
    END IF;

    -- VAL-004: médico existe y está activo
    IF NOT EXISTS (
      SELECT 1 FROM doctores
      WHERE id = v_medico_id AND activo = true
    ) THEN
      RAISE EXCEPTION 'El médico seleccionado no existe o no está activo';
    END IF;

    -- Rol existe y está activo
    IF NOT EXISTS (
      SELECT 1 FROM cat_roles_participante
      WHERE id = v_rol_id AND activo = true
    ) THEN
      RAISE EXCEPTION 'El rol seleccionado no existe o no está activo';
    END IF;

    -- MED-004: al menos un cirujano
    IF EXISTS (
      SELECT 1 FROM cat_roles_participante
      WHERE id = v_rol_id AND clave = 'cirujano'
    ) THEN
      v_tiene_cirujano := true;
      IF v_cirujano_id IS NULL THEN
        v_cirujano_id := v_medico_id;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_tiene_cirujano THEN
    RAISE EXCEPTION 'Debe asignar al menos un cirujano';
  END IF;

  -- ---------------------------------------------------------------
  -- VAL-006 (relajada): LIO (si aplica). Exclusivo: LIO de inventario O
  -- captura manual (lio/marca_lio), nunca ambos.
  -- ---------------------------------------------------------------
  IF p_inventario_item_id IS NOT NULL AND (p_lio IS NOT NULL OR p_marca_lio IS NOT NULL) THEN
    RAISE EXCEPTION 'Asigne solo un LIO: de inventario o manual, no ambos';
  END IF;

  IF p_inventario_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM inventario_items
      WHERE id = p_inventario_item_id
        AND (
          tipo = 'LENTE_INTRAOCULAR'
          OR tipo_lio IS NOT NULL
          OR potencia_dioptrias IS NOT NULL
        )
        AND estado = 'DISPONIBLE'
        AND stock >= 1
        AND (fecha_caducidad IS NULL OR fecha_caducidad > CURRENT_DATE)
    ) THEN
      RAISE EXCEPTION 'El LIO seleccionado no existe, no está disponible, está caducado o no tiene stock';
    END IF;
  END IF;

  -- ---------------------------------------------------------------
  -- Generar código CIR-NNNNN
  -- ---------------------------------------------------------------
  SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 5 FOR 5) AS INT)), 0) + 1
  INTO v_seq
  FROM agenda_cirugias
  WHERE codigo LIKE 'CIR-%';

  v_codigo := 'CIR-' || LPAD(v_seq::TEXT, 5, '0');

  -- ---------------------------------------------------------------
  -- Insertar cirugía (extensión de agenda_cirugias)
  -- ---------------------------------------------------------------
  INSERT INTO agenda_cirugias (
    paciente_id,
    nombre_paciente,
    expediente,
    fecha,
    hora,
    procedimiento,
    ojo,
    inventario_item_id,
    lio,
    marca_lio,
    consulta_id,
    origen_id,
    servicio_id,
    codigo,
    duracion_min,
    recurso_id,
    doctor_id,
    estado,
    notas,
    created_by
  ) VALUES (
    p_paciente_id,
    v_paciente_nombre,
    NULL,
    p_fecha,
    p_hora,
    v_servicio_nombre,
    p_ojo,
    p_inventario_item_id,
    p_lio,
    p_marca_lio,
    p_consulta_id,
    p_origen_id,
    p_servicio_id,
    v_codigo,
    p_duracion_min,
    p_recurso_id,
    v_cirujano_id,
    'agendada',
    p_notas,
    v_usuario_id
  ) RETURNING id INTO v_cirugia_id;

  -- ---------------------------------------------------------------
  -- Insertar participantes, productividad base e historial
  -- ---------------------------------------------------------------
  FOR v_participante IN SELECT * FROM jsonb_array_elements(p_participantes)
  LOOP
    v_medico_id := (v_participante->>'medico_id')::UUID;
    v_rol_id := (v_participante->>'rol_id')::UUID;

    INSERT INTO cirugia_participantes (cirugia_id, medico_id, rol_id)
    VALUES (v_cirugia_id, v_medico_id, v_rol_id)
    RETURNING id INTO v_participante_id;

    -- PRD-001/003: base de productividad "Pendiente" por participante
    INSERT INTO cirugia_productividad (
      cirugia_id, participante_id, origen_id, servicio_id, rol_id,
      estado, monto, regla_id
    ) VALUES (
      v_cirugia_id, v_participante_id, p_origen_id, p_servicio_id, v_rol_id,
      'PENDIENTE', NULL, NULL
    );

    -- AUD-004: historial de participante asignado
    INSERT INTO cirugia_historial (cirugia_id, usuario_id, accion, detalle)
    VALUES (
      v_cirugia_id, v_usuario_id, 'PARTICIPANTE_ASIGNADO',
      jsonb_build_object('medico_id', v_medico_id, 'rol_id', v_rol_id)
    );
  END LOOP;

  -- AUD-004: cirugía creada
  INSERT INTO cirugia_historial (cirugia_id, usuario_id, accion, detalle)
  VALUES (
    v_cirugia_id, v_usuario_id, 'CIRUGIA_CREADA',
    jsonb_build_object(
      'codigo', v_codigo,
      'paciente_id', p_paciente_id,
      'origen_id', p_origen_id,
      'servicio_id', p_servicio_id,
      'fecha', p_fecha,
      'hora', p_hora,
      'lio', p_lio,
      'marca_lio', p_marca_lio
    )
  );

  -- AUD-004: LIO asignado + descuento de inventario (si aplica)
  IF p_inventario_item_id IS NOT NULL THEN
    INSERT INTO cirugia_historial (cirugia_id, usuario_id, accion, detalle)
    VALUES (
      v_cirugia_id, v_usuario_id, 'LIO_ASIGNADO',
      jsonb_build_object('inventario_item_id', p_inventario_item_id)
    );

    -- Descontar 1 unidad del stock
    UPDATE inventario_items SET stock = stock - 1 WHERE id = p_inventario_item_id;

    -- Registrar movimiento de salida en kardex
    INSERT INTO inventario_movimientos (
      inventario_item_id, tipo, cantidad, stock_resultante,
      usuario_id, referencia_tipo, referencia_id, motivo
    ) VALUES (
      p_inventario_item_id, 'SALIDA_CIRUGIA', 1,
      (SELECT stock FROM inventario_items WHERE id = p_inventario_item_id),
      v_usuario_id, 'CIRUGIA', v_cirugia_id,
      'LIO asignado al crear cirugía ' || v_codigo
    );
  END IF;

  RETURN jsonb_build_object(
    'cirugia_id', v_cirugia_id,
    'codigo', v_codigo,
    'estado', 'agendada'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos de ejecución (idempotente)
GRANT EXECUTE ON FUNCTION crear_cirugia(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID, TEXT, UUID, UUID, JSONB, TEXT, UUID)
  TO anon, authenticated, service_role;
