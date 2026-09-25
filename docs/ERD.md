# Modelo de Datos (ERD) — v2

> Generado por auditoría v2. Elimina: `cobros`, `lentes` (esquema viejo), `lentes_x_consulta`, `matriz_costos/coberturas`.

## Diagrama de entidades

```
USUARIOS ─────── 1:1 ─────── DOCTORES
DOCTORES ─────── 1:N ─────── CONSULTAS
PACIENTES ────── 1:N ─────── CONSULTAS
PACIENTES ────── N:1 ─────── ASEGURANZAS
CONSULTAS ────── 1:N ─────── CONSULTA_CONCEPTOS
CONSULTAS ────── 1:N ─────── CONSULTA_HISTORIAL
CONSULTAS ────── 1:1 ─────── (estatus_pago flag)
CONSULTA_CONCEPTOS 1:N ──── CONCEPTO_DOCTORES
AGENDA_CIRUGIAS ── 1:N ──── AGENDA_CIRUGIA_DOCTORES
AGENDA_CIRUGIAS ── N:1 ──── INVENTARIO_ITEMS (via inventario_item_id)
INVENTARIO_ITEMS ── 1:N ──── INVENTARIO_MOVIMIENTOS
ASEGURANZAS ──── 1:N ─────── COBERTURAS_ASEGURANZA
PROVEEDORES ──── 1:N ─────── INVENTARIO_ITEMS
CATEGORIAS_LENTES 1:N ─────── INVENTARIO_ITEMS
DOCTORES ─────── 1:N ─────── TARIFAS_DOCTOR
DOCTORES ─────── 1:N ─────── EVENTOS_HONORARIO
DOCTORES ─────── 1:N ─────── LIQUIDACIONES_DOCTOR
PERIODOS_PAGO ── 1:N ─────── EVENTOS_HONORARIO
PERIODOS_PAGO ── 1:N ─────── LIQUIDACIONES_DOCTOR
LIQUIDACIONES_DOCTOR 1:N ── AJUSTES_LIQUIDACION
EVENTOS_HONORARIO ── N:1 ── AGENDA_CIRUGIAS
USUARIOS ─────── 1:N ─────── NOTIFICACIONES
USUARIOS ─────── 1:N ─────── NOTIFICACION_PREFERENCIAS
```

## Tablas

### usuarios
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| nombre | VARCHAR(255) | NOT NULL |
| rol | ENUM | admin, doctor, recepcionista |
| activo | BOOLEAN | DEFAULT true |
| avatar_url | TEXT | DEFAULT NULL |
| preferencias | JSONB | DEFAULT '{}' (incluye modo_focus para doctor_jefe) |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### doctores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| usuario_id | UUID | FK → usuarios, UNIQUE |
| nombre_completo | VARCHAR(255) | NOT NULL |
| cedula_profesional | VARCHAR(50) | UNIQUE |
| especialidad | VARCHAR(255) | DEFAULT 'Oftalmología' |
| telefono | VARCHAR(20) | |
| email | VARCHAR(255) | |
| activo | BOOLEAN | DEFAULT true |
| periodo_pago_honorarios | ENUM | SEMANAL, QUINCENAL, MENSUAL, CUSTOM |
| honorario_consulta | DECIMAL(10,2) | DEFAULT 0 |
| honorario_estudio | DECIMAL(10,2) | DEFAULT 0 |
| honorario_procedimiento | DECIMAL(10,2) | DEFAULT 0 |

### pacientes
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| nombre_completo | VARCHAR(255) | NOT NULL |
| sexo | ENUM | MASCULINO, FEMENINO, OTRO |
| fecha_nacimiento | DATE | NOT NULL |
| edad | INTEGER | |
| telefono | VARCHAR(20) | |
| email | VARCHAR(255) | |
| direccion | TEXT | |
| contacto_emergencia | VARCHAR(255) | |
| tel_emergencia | VARCHAR(20) | |
| aseguranza_id | UUID | FK → aseguranzas ON DELETE SET NULL |
| numero_poliza | VARCHAR(100) | |
| numero_afiliacion | VARCHAR(100) | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### aseguranzas
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| nombre | VARCHAR(255) | NOT NULL |
| tipo | ENUM | PRIVADA, CONVENIO, PARTICULAR |
| vigente_desde | DATE | |
| vigente_hasta | DATE | |
| telefono | VARCHAR(20) | |
| direccion | TEXT | |
| contacto | VARCHAR(255) | |
| activo | BOOLEAN | DEFAULT true |

### coberturas_aseguranza
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| aseguranza_id | UUID | FK → aseguranzas ON DELETE CASCADE |
| porcentaje_cobertura | DECIMAL(5,2) | NOT NULL |
| copago_fijo | DECIMAL(10,2) | NOT NULL DEFAULT 0 |
| aplica_estudios | BOOLEAN | DEFAULT true |
| aplica_procedimientos | BOOLEAN | DEFAULT true |
| vigente_desde | DATE | |
| vigente_hasta | DATE | |

### consultas
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| paciente_id | UUID | FK → pacientes |
| doctor_id | UUID | FK → doctores |
| fecha | DATE | NOT NULL |
| hora_inicio | TIME | NOT NULL |
| hora_fin | TIME | |
| tipo_consulta | ENUM | CONSULTA, ESTUDIO, REVISION, PROCEDIMIENTO |
| tipo_visita | ENUM | PRIMERA_VEZ, SUBSECUENTE |
| diagnostico | VARCHAR(500) | |
| estudios | JSONB | array de {nombre, doctor_id} |
| procedimiento | TEXT | |
| procedimiento_doctor_id | UUID | FK → doctores |
| aseguranza_id | UUID | FK → aseguranzas (resolve from paciente) |
| notas | TEXT | |
| metodo_pago | ENUM | EFECTIVO, TARJETA, TRANSFERENCIA, SEGURO, NO_APLICA |
| estatus | ENUM | BORRADOR, PROCESADA, PENDIENTE_ESTUDIO, PENDIENTE_CIRUGIA, FINALIZADA |
| estatus_pago | ENUM | PENDIENTE_PAGO, PAGADO |
| moneda | VARCHAR(10) | DEFAULT 'MXN' |
| costo_total | DECIMAL(10,2) | DEFAULT 0 |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### consulta_historial
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_id | UUID | FK → consultas ON DELETE CASCADE |
| tipo_evento | ENUM | CAMBIO_ESTATUS, EDICION, CANCELACION, REAGENDADO, PAGADO, FINALIZADO |
| valor_anterior | JSONB | |
| valor_nuevo | JSONB | |
| usuario_id | UUID | FK → usuarios ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### consulta_conceptos
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_id | UUID | FK → consultas ON DELETE CASCADE |
| tipo_concepto | ENUM | ESTUDIO, PROCEDIMIENTO, CONSULTA |
| concepto_id | UUID | nullable (polymorphic ref) |
| cantidad | INTEGER | DEFAULT 1 |
| precio_aplicado | DECIMAL(10,2) | DEFAULT 0 |
| texto_original | TEXT | |
| doctor_id | UUID | FK → doctores ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### concepto_doctores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_concepto_id | UUID | FK → consulta_conceptos ON DELETE CASCADE |
| doctor_id | UUID | FK → doctores ON DELETE CASCADE |
| rol | ENUM | PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INTERPRETACION, REFERIDOR |
| porcentaje_participacion | DECIMAL(5,2) | DEFAULT 100.00 |
| created_at | TIMESTAMPTZ | DEFAULT now() |

> UNIQUE (consulta_concepto_id, doctor_id, rol)

---

## Inventario Dual (Visión + Intraocular)

### inventario_items
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| tipo | ENUM | LENTE_VISION, LENTE_INTRAOCULAR |
| marca | VARCHAR(255) | NOT NULL |
| modelo | VARCHAR(255) | |
| categoria_id | UUID | FK → categorias_lentes |
| proveedor_id | UUID | FK → proveedores |
| codigo_barras | VARCHAR(100) | UNIQUE |
| folio | VARCHAR(50) | UNIQUE |
| grado_esferico | DECIMAL(5,2) | (solo LENTE_VISION) |
| grado_cilindrico | DECIMAL(5,2) | (solo LENTE_VISION) |
| eje | INTEGER | (solo LENTE_VISION) |
| color | VARCHAR(100) | |
| material | VARCHAR(100) | (solo LENTE_VISION) |
| potencia_dioptrias | DECIMAL(5,2) | (solo LENTE_INTRAOCULAR) |
| tipo_lio | ENUM | MONOFOCAL, MULTIFOCAL, TORICA, MULTIFOCAL_TORICA, EDOF, OTRO (solo LENTE_INTRAOCULAR) |
| modelo_fabricante | VARCHAR(255) | (solo LENTE_INTRAOCULAR) |
| cilindro_lio | DECIMAL(5,2) | (solo LENTE_INTRAOCULAR) — añadida por el escáner de etiquetas (migración 1800000000280) |
| add_intermedia | DECIMAL(5,2) | (solo LENTE_INTRAOCULAR) — primera ADD de la etiqueta |
| add_cercana | DECIMAL(5,2) | (solo LENTE_INTRAOCULAR) — segunda ADD de la etiqueta |
| numero_serie | VARCHAR(100) | (solo LENTE_INTRAOCULAR) — `SN` impreso; **nunca** es el código de barras |
| codigo_barras_tipo | VARCHAR(20) | formato reportado por el decoder (p. ej. CODE_39, EAN_13) |
| stock | INTEGER | DEFAULT 0 |
| stock_minimo | INTEGER | DEFAULT 5 |
| precio_compra | DECIMAL(10,2) | |
| precio_venta | DECIMAL(10,2) | |
| lote | VARCHAR(100) | |
| fecha_caducidad | DATE | |
| estado | ENUM | DISPONIBLE, RESERVADO, OCUPADO, DANADO, VENCIDO |
| notas | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### inventario_movimientos (Kardex)
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| inventario_item_id | UUID | FK → inventario_items ON DELETE CASCADE |
| tipo | ENUM | ENTRADA, SALIDA, AJUSTE, DEVOLUCION, SALIDA_CIRUGIA |
| cantidad | INTEGER | NOT NULL |
| stock_resultante | INTEGER | NOT NULL |
| usuario_id | UUID | FK → usuarios ON DELETE SET NULL |
| referencia_tipo | VARCHAR(50) | (ej: 'CIRUGIA', 'COMPRA') |
| referencia_id | UUID | |
| motivo | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

> **Regla Kardex:** Nunca UPDATE directo de stock. Toda mutación genera un movimiento.

### categorias_lentes
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| nombre | VARCHAR(255) | NOT NULL |
| descripcion | TEXT | |
| activo | BOOLEAN | DEFAULT true |

### proveedores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| nombre | VARCHAR(255) | NOT NULL |
| telefono | VARCHAR(20) | |
| email | VARCHAR(255) | |
| direccion | TEXT | |
| contacto | VARCHAR(255) | |
| activo | BOOLEAN | DEFAULT true |

---

## Agenda / Cirugías

### agenda_cirugias
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| paciente_id | UUID | FK → pacientes |
| nombre_paciente | VARCHAR(255) | NOT NULL |
| expediente | TEXT | |
| fecha | DATE | |
| hora | TIME | |
| jornada | VARCHAR(50) | |
| diagnostico | TEXT | |
| procedimiento | TEXT | |
| ojo | VARCHAR(10) | |
| lio | VARCHAR(100) | (texto libre: potencia) |
| marca_lio | VARCHAR(100) | (texto libre: marca) |
| inventario_item_id | UUID | FK → inventario_items ON DELETE SET NULL |
| tiempo_estimado | TEXT | |
| tiempo_estancia | TEXT | |
| doctor_id | UUID | FK → doctores |
| estado | ENUM | agendada, aplazada, reagendada, completada, cancelada |
| procedencia | TEXT | |
| motivo_aplazamiento | TEXT | |
| notas | TEXT | |
| consulta_id | UUID | FK → consultas ON DELETE SET NULL |
| notificado | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### agenda_cirugia_doctores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| cirugia_id | UUID | FK → agenda_cirugias ON DELETE CASCADE |
| doctor_id | UUID | FK → doctores ON DELETE CASCADE |
| rol | ENUM | CIRUJANO_PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INSTRUMENTISTA, CIRCULANTE |
| porcentaje_participacion | DECIMAL(5,2) | DEFAULT 100.00 |
| created_at | TIMESTAMPTZ | DEFAULT now() |

> UNIQUE (cirugia_id, doctor_id, rol)

---

## Honorarios

### tarifas_doctor
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| doctor_id | UUID | FK → doctores ON DELETE CASCADE |
| tipo_concepto | ENUM | ESTUDIO, PROCEDIMIENTO, CONSULTA |
| concepto_id | UUID | nullable |
| rol | ENUM | PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INTERPRETACION, REFERIDOR |
| tipo_calculo | ENUM | PORCENTAJE (único modo v2) |
| valor | DECIMAL(10,2) | DEFAULT 0 |
| vigente_desde | DATE | NOT NULL |
| vigente_hasta | DATE | NULL = active |
| creado_por | UUID | FK → usuarios ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

> UNIQUE (doctor_id, tipo_concepto, concepto_id, rol) WHERE vigente_hasta IS NULL

### periodos_pago
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| codigo | VARCHAR(20) | UNIQUE NOT NULL |
| fecha_desde | DATE | NOT NULL |
| fecha_hasta | DATE | NOT NULL |
| estado | ENUM | ABIERTO, EN_REVISION, CERRADO, PAGADO |
| cerrado_por | UUID | FK → usuarios ON DELETE SET NULL |
| cerrado_at | TIMESTAMPTZ | |
| notas | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### eventos_honorario
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| origen_tipo | ENUM | CONSULTA, ESTUDIO, PROCEDIMIENTO, CITA, OPERACION |
| origen_id | UUID | NOT NULL |
| doctor_id | UUID | FK → doctores ON DELETE CASCADE |
| rol | ENUM | PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INTERPRETACION, REFERIDOR |
| paciente_id | UUID | FK → pacientes ON DELETE SET NULL |
| fecha_servicio | DATE | NOT NULL |
| monto_base | DECIMAL(10,2) | DEFAULT 0 |
| tarifa_snapshot | JSONB | |
| monto_devengado | DECIMAL(10,2) | DEFAULT 0 |
| moneda | VARCHAR(3) | DEFAULT 'PESOS' |
| estado | ENUM | PENDIENTE, DEVENGADO, REVERSADO, LIQUIDADO |
| periodo_id | UUID | FK → periodos_pago |
| cirugia_id | UUID | FK → agenda_cirugias ON DELETE SET NULL |
| notas | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

> UNIQUE (origen_tipo, origen_id, doctor_id, rol)

### liquidaciones_doctor
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| periodo_id | UUID | FK → periodos_pago ON DELETE CASCADE |
| doctor_id | UUID | FK → doctores ON DELETE CASCADE |
| total_devengado | DECIMAL(10,2) | DEFAULT 0 |
| total_ajustes | DECIMAL(10,2) | DEFAULT 0 |
| total_retenciones | DECIMAL(10,2) | DEFAULT 0 |
| neto_pagar | DECIMAL(10,2) | DEFAULT 0 |
| moneda | VARCHAR(3) | DEFAULT 'PESOS' |
| estado | ENUM | BORRADOR, PENDIENTE_APROBACION, APROBADA, PAGADA, RECHAZADA |
| aprobado_por | UUID | FK → usuarios ON DELETE SET NULL |
| aprobado_at | TIMESTAMPTZ | |
| pagado_at | TIMESTAMPTZ | |
| referencia_pago | VARCHAR(100) | |
| notas | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

> UNIQUE (periodo_id, doctor_id)

### ajustes_liquidacion
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| liquidacion_id | UUID | FK → liquidaciones_doctor ON DELETE CASCADE |
| tipo | ENUM | BONO, DESCUENTO, ANTICIPO, CORRECCION |
| concepto | VARCHAR(255) | NOT NULL |
| monto | DECIMAL(10,2) | NOT NULL |
| motivo | TEXT | |
| creado_por | UUID | FK → usuarios ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### bitacora_honorarios
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| tabla | VARCHAR(50) | NOT NULL |
| registro_id | UUID | NOT NULL |
| accion | VARCHAR(50) | NOT NULL |
| valor_anterior | JSONB | |
| valor_nuevo | JSONB | |
| usuario_id | UUID | FK → usuarios ON DELETE SET NULL |
| ip_address | INET | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### configuracion_sistema
| Campo | Tipo | Constraints |
|-------|------|-------------|
| clave | VARCHAR(100) | PRIMARY KEY |
| valor | JSONB | NOT NULL |
| descripcion | TEXT | |
| updated_by | UUID | FK → usuarios ON DELETE SET NULL |
| updated_at | TIMESTAMPTZ | DEFAULT now() |
| created_at | TIMESTAMPTZ | DEFAULT now() |

---

## Notificaciones (Nuevas)

### notificacion_preferencias
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| usuario_id | UUID | FK → usuarios ON DELETE CASCADE |
| tipo_evento | VARCHAR(50) | NOT NULL |
| canal | ENUM | IN_APP, EMAIL, PUSH |
| activo | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT now() |

> UNIQUE (usuario_id, tipo_evento, canal)

### notificaciones
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| usuario_id | UUID | FK → usuarios ON DELETE CASCADE |
| tipo | VARCHAR(50) | NOT NULL |
| titulo | VARCHAR(255) | NOT NULL |
| mensaje | TEXT | NOT NULL |
| payload | JSONB | |
| leida | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | DEFAULT now() |

### agenda_import_log
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| usuario_id | UUID | FK → usuarios ON DELETE SET NULL |
| archivo_nombre | VARCHAR(255) | NOT NULL |
| filas_ok | INTEGER | DEFAULT 0 |
| filas_rechazadas | INTEGER | DEFAULT 0 |
| detalle_rechazados | JSONB | [{fila, motivo}] |
| created_at | TIMESTAMPTZ | DEFAULT now() |

---

## Tablas ELIMINADAS (Legacy)

| Tabla | Razón |
|-------|-------|
| `cobros` | Pago se registra como `estatus_pago = PAGADO` en consultas |
| `lentes` | Renombrada a `inventario_items` con tipo discriminator |
| `lentes_x_consulta` | Reemplazada por `inventario_item_id` en `agenda_cirugias` |
| `cobro_detalles` | Dependía de `cobros` eliminada |
| `matriz_costos` | Coberturas ahora viven en `coberturas_aseguranza` |
