# Modelo de Datos (ERD)

## Diagrama de entidades

```
USUARIOS ─────── 1:1 ─────── DOCTORES
DOCTORES ─────── 1:N ─────── CONSULTAS
PACIENTES ────── 1:N ─────── CONSULTAS
CONSULTAS ────── 1:1 ─────── COBROS
CONSULTAS ────── 1:N ─────── LENTES_X_CONSULTA
CONSULTAS ────── 1:N ─────── CONSULTA_CONCEPTOS
CONSULTA_CONCEPTOS 1:N ──── CONCEPTO_DOCTORES
CONSULTA_CONCEPTOS 1:N ──── COBRO_DETALLES
LENTES ───────── 1:N ─────── LENTES_X_CONSULTA
ASEGURANZAS ──── 1:N ─────── COBROS
PROVEEDORES ──── 1:N ─────── LENTES
CATEGORIAS_LENTES 1:N ─────── LENTES
DOCTORES ─────── 1:N ─────── TARIFAS_DOCTOR
DOCTORES ─────── 1:N ─────── EVENTOS_HONORARIO
DOCTORES ─────── 1:N ─────── LIQUIDACIONES_DOCTOR
PERIODOS_PAGO ── 1:N ─────── EVENTOS_HONORARIO
PERIODOS_PAGO ── 1:N ─────── LIQUIDACIONES_DOCTOR
LIQUIDACIONES_DOCTOR 1:N ── AJUSTES_LIQUIDACION
AGENDA_CIRUGIAS ── 1:N ──── AGENDA_CIRUGIA_DOCTORES
AGENDA_CIRUGIAS ── 1:N ──── EVENTOS_HONORARIO
COBROS ───────── 1:N ─────── EVENTOS_HONORARIO
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
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### doctores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| usuario_id | UUID | FK → usuarios |
| nombre_completo | VARCHAR(255) | NOT NULL |
| cedula_profesional | VARCHAR(50) | UNIQUE |
| especialidad | VARCHAR(255) | DEFAULT 'Oftalmología' |
| telefono | VARCHAR(20) | |
| email | VARCHAR(255) | |
| activo | BOOLEAN | DEFAULT true |

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
| estudio_1 | VARCHAR(255) | |
| estudio_2 | VARCHAR(255) | |
| estudio_3 | VARCHAR(255) | |
| procedimiento | TEXT | |
| notas | TEXT | |

### cobros
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_id | UUID | FK → consultas |
| paciente_id | UUID | FK → pacientes |
| aseguranza_id | UUID | FK → aseguranzas |
| metodo_pago | ENUM | EFECTIVO, TARJETA, TRANSFERENCIA, NO_APLICA |
| monto | DECIMAL(10,2) | NOT NULL |
| moneda | ENUM | PESOS, DOLARES |
| pagado | BOOLEAN | DEFAULT false |
| fecha_pago | TIMESTAMP | |
| folio | VARCHAR(50) | |

### aseguranzas
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| nombre | VARCHAR(255) | NOT NULL |
| telefono | VARCHAR(20) | |
| direccion | TEXT | |
| contacto | VARCHAR(255) | |
| activo | BOOLEAN | DEFAULT true |

### categorias_lentes
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| nombre | VARCHAR(255) | NOT NULL |
| descripcion | TEXT | |

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

### lentes
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| categoria_id | UUID | FK → categorias_lentes |
| marca | VARCHAR(255) | NOT NULL |
| modelo | VARCHAR(255) | NOT NULL |
| codigo_barras | VARCHAR(100) | UNIQUE |
| grado_esferico | DECIMAL(5,2) | |
| grado_cilindrico | DECIMAL(5,2) | |
| eje | INTEGER | |
| color | VARCHAR(100) | |
| material | VARCHAR(100) | |
| stock | INTEGER | DEFAULT 0 |
| stock_minimo | INTEGER | DEFAULT 5 |
| precio_compra | DECIMAL(10,2) | |
| precio_venta | DECIMAL(10,2) | |
| lote | VARCHAR(100) | |
| fecha_caducidad | DATE | |
| proveedor_id | UUID | FK → proveedores |
| estado | ENUM | DISPONIBLE, OCUPADO, DANADO, VENCIDO |

### lentes_x_consulta
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_id | UUID | FK → consultas |
| lente_id | UUID | FK → lentes |
| ojo | ENUM | DERECHO, IZQUIERDO, AMBOS |
| grado_aplicado | DECIMAL(5,2) | |
| cantidad | INTEGER | DEFAULT 1 |

---

## Tablas Honorarios (Módulo de Normalización y Devengo)

### consulta_conceptos
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_id | UUID NOT NULL | FK → consultas ON DELETE CASCADE |
| tipo_concepto | ENUM | ESTUDIO, PROCEDIMIENTO, CONSULTA |
| concepto_id | UUID | nullable (polymorphic ref) |
| cantidad | INTEGER NOT NULL | DEFAULT 1 |
| precio_aplicado | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| texto_original | TEXT | |
| doctor_id | UUID | FK → doctores ON DELETE SET NULL |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

### cobro_detalles
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| cobro_id | UUID NOT NULL | FK → cobros ON DELETE CASCADE |
| consulta_concepto_id | UUID NOT NULL | FK → consulta_conceptos ON DELETE CASCADE |
| monto | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| descuento | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| monto_final | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

### concepto_doctores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| consulta_concepto_id | UUID NOT NULL | FK → consulta_conceptos ON DELETE CASCADE |
| doctor_id | UUID NOT NULL | FK → doctores ON DELETE CASCADE |
| rol | ENUM | PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INTERPRETACION, REFERIDOR |
| porcentaje_participacion | DECIMAL(5,2) NOT NULL | DEFAULT 100.00 |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

> **Constraint:** UNIQUE (consulta_concepto_id, doctor_id, rol)
> **Trigger:** trg_validar_porcentaje_concepto — validates SUM(porcentaje_participacion) ≤ 100 per concepto

### agenda_cirugia_doctores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| cirugia_id | UUID NOT NULL | FK → agenda_cirugias ON DELETE CASCADE |
| doctor_id | UUID NOT NULL | FK → doctores ON DELETE CASCADE |
| rol | ENUM | CIRUJANO_PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INSTRUMENTISTA, CIRCULANTE |
| porcentaje_participacion | DECIMAL(5,2) NOT NULL | DEFAULT 100.00 |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

> **Constraint:** UNIQUE (cirugia_id, doctor_id, rol)
> **Trigger:** trg_validar_porcentaje_cirugia — validates SUM(porcentaje_participacion) ≤ 100 per surgery

### tarifas_doctor
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| doctor_id | UUID NOT NULL | FK → doctores ON DELETE CASCADE |
| tipo_concepto | ENUM | ESTUDIO, PROCEDIMIENTO, CONSULTA |
| concepto_id | UUID | nullable (polymorphic ref) |
| rol | ENUM | PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INTERPRETACION, REFERIDOR |
| tipo_calculo | ENUM | FIJO, PORCENTAJE, POR_HORA |
| valor | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| moneda | VARCHAR(3) NOT NULL | DEFAULT 'PESOS' |
| vigente_desde | DATE NOT NULL | |
| vigente_hasta | DATE | NULL = active |
| creado_por | UUID | FK → usuarios ON DELETE SET NULL |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

> **Constraint:** UNIQUE (doctor_id, tipo_concepto, concepto_id, rol) WHERE vigente_hasta IS NULL
> **Trigger:** trg_cerrar_tarifa_anterior — auto-closes previous active tariff on insert

### periodos_pago
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| codigo | VARCHAR(20) NOT NULL | UNIQUE |
| fecha_desde | DATE NOT NULL | |
| fecha_hasta | DATE NOT NULL | |
| estado | ENUM | ABIERTO, EN_REVISION, CERRADO, PAGADO |
| cerrado_por | UUID | FK → usuarios ON DELETE SET NULL |
| cerrado_at | TIMESTAMPTZ | |
| notas | TEXT | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

### eventos_honorario
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| origen_tipo | ENUM | CONSULTA, ESTUDIO, PROCEDIMIENTO, CITA, OPERACION |
| origen_id | UUID NOT NULL | (polymorphic ref) |
| doctor_id | UUID NOT NULL | FK → doctores ON DELETE CASCADE |
| rol | ENUM | PRINCIPAL, AYUDANTE, ANESTESIOLOGO, INTERPRETACION, REFERIDOR |
| paciente_id | UUID | FK → pacientes ON DELETE SET NULL |
| fecha_servicio | DATE NOT NULL | |
| monto_base | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| tarifa_snapshot | JSONB | |
| monto_devengado | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| moneda | VARCHAR(3) NOT NULL | DEFAULT 'PESOS' |
| estado | ENUM | PENDIENTE, DEVENGADO, REVERSADO, LIQUIDADO |
| periodo_id | UUID | FK → periodos_pago |
| cobro_id | UUID | FK → cobros ON DELETE SET NULL |
| notas | TEXT | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

> **Constraint:** UNIQUE (origen_tipo, origen_id, doctor_id, rol) — idempotency

### liquidaciones_doctor
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| periodo_id | UUID NOT NULL | FK → periodos_pago ON DELETE CASCADE |
| doctor_id | UUID NOT NULL | FK → doctores ON DELETE CASCADE |
| total_devengado | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| total_ajustes | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| total_retenciones | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| neto_pagar | DECIMAL(10,2) NOT NULL | DEFAULT 0 |
| moneda | VARCHAR(3) NOT NULL | DEFAULT 'PESOS' |
| estado | ENUM | BORRADOR, PENDIENTE_APROBACION, APROBADA, PAGADA, RECHAZADA |
| aprobado_por | UUID | FK → usuarios ON DELETE SET NULL |
| aprobado_at | TIMESTAMPTZ | |
| pagado_at | TIMESTAMPTZ | |
| referencia_pago | VARCHAR(100) | |
| notas | TEXT | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

> **Constraint:** UNIQUE (periodo_id, doctor_id)

### ajustes_liquidacion
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| liquidacion_id | UUID NOT NULL | FK → liquidaciones_doctor ON DELETE CASCADE |
| tipo | ENUM | BONO, DESCUENTO, ANTICIPO, CORRECCION |
| concepto | VARCHAR(255) NOT NULL | |
| monto | DECIMAL(10,2) NOT NULL | |
| motivo | TEXT | |
| creado_por | UUID | FK → usuarios ON DELETE SET NULL |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |

### bitacora_honorarios
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PRIMARY KEY |
| tabla | VARCHAR(50) NOT NULL | |
| registro_id | UUID NOT NULL | |
| accion | VARCHAR(50) NOT NULL | |
| valor_anterior | JSONB | |
| valor_nuevo | JSONB | |
| usuario_id | UUID | FK → usuarios ON DELETE SET NULL |
| ip_address | INET | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() |
