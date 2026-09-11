# Modelo de Datos (ERD)

## Diagrama de entidades

```
USUARIOS ─────── 1:1 ─────── DOCTORES
DOCTORES ─────── 1:N ─────── CONSULTAS
PACIENTES ────── 1:N ─────── CONSULTAS
CONSULTAS ────── 1:1 ─────── COBROS
CONSULTAS ────── 1:N ─────── LENTES_X_CONSULTA
LENTES ───────── 1:N ─────── LENTES_X_CONSULTA
ASEGURANZAS ──── 1:N ─────── COBROS
PROVEEDORES ──── 1:N ─────── LENTES
CATEGORIAS_LENTES 1:N ─────── LENTES
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
