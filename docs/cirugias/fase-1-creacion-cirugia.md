# Fase 1 — Creación de cirugía homologada (con archivos de apoyo)

> **Ubicación sugerida en el repo:** `docs/cirugias/fase-1-creacion-cirugia.md`
> **Stack de referencia:** Next.js (App Router) · TypeScript · PostgreSQL / Supabase.
> **Punto de partida:** Agenda/Cirugías hoy es una parte diferenciada del flujo de consultas. Esta fase la integra con la homologación de **Agenda, Origen, servicios, asignación médica y productividad**.

## 0. Cómo usar este documento

Cada requisito tiene un **ID único** (`OBJ-001`, `ARC-003`, …) y un **criterio de aceptación**. La implementación, la auditoría final y la validación manual se referencian por ID. **Un ID sin evidencia = requisito no cubierto.**

Adaptar el modelo de datos del Anexo A al esquema existente. No duplicar tablas que ya existan (pacientes, expedientes, consultas, médicos, inventario, catálogo de servicios, roles, historial).

---

## 1. Objetivo

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| OBJ-001 | La creación de cirugía deja de ser solo "agendar" y pasa a ser **crear una atención quirúrgica programada** relacionada con paciente, expediente, origen, servicio, médicos, recursos y documentos de apoyo. | La cirugía guardada tiene relación con todos esos elementos. |
| OBJ-002 | La creación queda integrada con la homologación de Agenda, Origen, servicios, asignación médica y productividad. | Al crear, la cirugía aparece en Agenda, genera historial y genera base de productividad. |
| OBJ-003 | Flujo: Paciente → Expediente clínico → Crear cirugía, con 6 bloques: datos de agenda, datos clínicos, origen, servicio/procedimiento, asignación médica, inventario/LIO y archivos de apoyo. | El formulario expone esos bloques en ese orden. |

## 2. Origen

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| ORI-001 | La cirugía guarda **Origen** además de paciente, doctor, procedimiento, fecha y hora. (Ej.: Juan Pérez · AXA · Cirugía de catarata · 25/09/2026 · 10:00.) | Campo/relación `origen` obligatorio en la cirugía. |
| ORI-002 | El origen se **conserva** en la cirugía aunque después cambie la aseguradora del paciente. | Cambiar el origen del paciente no altera el origen de cirugías ya creadas. |
| ORI-003 | El origen alimenta la cadena Origen → Servicio → Asignación médica → Productividad → Pago. | Productividad se resuelve a partir del origen de la cirugía. |

## 3. Catálogo de servicios / procedimiento

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| CAT-001 | El procedimiento se elige de **catálogo**, no texto libre. | No existe input de texto libre para procedimiento. |
| CAT-002 | El catálogo depende del origen (Origen → Catálogo de servicios → procedimiento). | Al cambiar el origen, la lista de procedimientos se filtra/recarga. |
| CAT-003 | La cirugía queda relacionada por referencia al servicio que corresponde al origen. | FK cirugía → servicio; backend valida que el servicio corresponde al origen. |

## 4. Formulario de creación (6 secciones)

### Sección 1 — Paciente

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| PAC-001 | Buscador de paciente por nombre / expediente. | Buscar por ambos criterios devuelve resultados. |
| PAC-002 | Muestra paciente (nombre), expediente (ej. EXP-000123) y botón **Ver expediente**. | Visible tras seleccionar. |
| PAC-003 | No se puede crear una cirugía sin paciente (frontend **y** backend). | UI bloquea; API rechaza. |
| PAC-004 | Al seleccionar paciente se pueden consultar: datos básicos, expediente, antecedentes relevantes, consultas previas y cirugías previas. | Los cinco elementos accesibles desde el formulario. |

### Sección 2 — Datos de cirugía

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| DAT-001 | Campos: Origen, Procedimiento, Ojo, Fecha, Hora inicio, Duración estimada (min), Estatus. | Los 7 campos existen y se persisten. |
| DAT-002 | El estatus inicial es **Agendada**. | Cirugía nueva queda en `agendada`. |
| OJO-001 | Ojo es campo explícito con catálogo: **OD** Derecho · **OI** Izquierdo · **OU** Ambos (no texto libre). | Solo acepta esos 3 valores (UI y backend). |
| OJO-002 | El ojo queda disponible para cirugía, LIO, inventario, expediente y reportes. | Campo consultable/expuesto en esos módulos donde aplique. |

### Sección 3 — Asignación médica

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| MED-001 | UI con Cirujano, Ayudante, Anestesiólogo y **[+ Agregar participante]**. | Se pueden agregar participantes adicionales. |
| MED-002 | Modelo interno **no** son 3 columnas fijas: Cirugía → Participantes (médico + rol). | Tabla de participantes con `cirugia_id`, `medico_id`, `rol`. |
| MED-003 | Nuevos roles se agregan sin modificar el modelo (catálogo de roles). | Agregar un rol = insertar en catálogo, sin migración de columnas. |
| MED-004 | Debe existir asignación de cirujano (alcance 1.9). | Backend rechaza cirugía sin participante con rol cirujano. |

### Productividad (base)

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| PRD-001 | La asignación médica genera la base de productividad por participante, con estado **Pendiente**. | Por cada participante existe registro de productividad "Pendiente". |
| PRD-002 | El monto **no** se captura manualmente en el formulario de creación. | No existe campo de monto en el formulario. |
| PRD-003 | El monto proviene de reglas de productividad por **Origen + Servicio + Rol**. | El registro referencia origen, servicio y rol (aunque el cálculo quede pendiente). |

### Sección 4 — Expediente

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| EXP-001 | Sección con: **Ver expediente**, última consulta (fecha), diagnóstico y **Consultar historial**. | Los 4 elementos visibles y funcionales. |
| EXP-002 | No se duplica el expediente dentro de cirugía; se relaciona con expediente/consulta. | Solo FKs, sin copia de datos clínicos. |

### Relación con consulta

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| CON-001 | Se conserva `consulta_id` (opcional) cuando la cirugía surge de una consulta. | Columna nullable y se llena al crear desde consulta. |
| CON-002 | Navegación Consulta → Cirugía y Cirugía → Consulta que la originó. | Ambos enlaces funcionan. |
| CON-003 | Se puede iniciar "Crear cirugía" desde una consulta (decisión quirúrgica), precargando paciente y consulta. | Flujo desde consulta precarga datos. |

### Sección 5 — Lente intraocular (LIO)

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| LIO-001 | Buscador de LIO desde **inventario**; muestra marca, modelo, tamaño, lote y caducidad. | Al seleccionar se muestran los 5 datos. |
| LIO-002 | Relación Cirugía → LIO utilizado → Inventario, seleccionando el producto existente; **no** se copia manualmente su información. | FK a inventario; sin campos duplicados de marca/modelo/lote. |
| LIO-003 | La sección aplica solo cuando corresponde (opcional según procedimiento). | Se puede crear cirugía sin LIO cuando no aplica. |

### Sección 6 — Archivos de apoyo

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| ARC-001 | Sección con arrastrar/soltar, botón **+ Agregar archivo**, formatos permitidos visibles y lista con nombre, tamaño y acciones **Ver / Descargar / Eliminar**. | Todos los elementos presentes. |
| ARC-002 | Formatos: PDF, JPG, JPEG, PNG, WEBP (no limitado a un único tipo). | Los 5 se aceptan. |
| ARC-003 | Límites de tamaño máximo, extensión, MIME type y cantidad de archivos, validados **también en backend**. | Llamada directa a la API con archivo inválido es rechazada. |
| ARC-004 | Los archivos **pertenecen a la cirugía** (`cirugia_archivos`): `id, cirugia_id, nombre_original, nombre_storage, mime_type, size, storage_path, tipo_documento, uploaded_by, created_at`. | Tabla con esos campos y FK a cirugía. |
| ARC-005 | `tipo_documento` clasifica el archivo (ej. consentimiento, valoración preoperatoria, estudio). | Se puede elegir/guardar el tipo al subir. |
| ARC-006 | Los archivos **no** se mezclan con el expediente general del paciente en esta fase. | No aparecen en expediente general; pertenecen primero a la cirugía. |
| ARC-007 | Se pueden agregar archivos tanto en la creación como en el detalle de la cirugía. | Botón "+ Agregar archivo" en ambos. |

## 5. Almacenamiento

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| STO-001 | Los archivos van en **Storage**, no dentro de PostgreSQL. | Sin columnas `bytea`/base64 para el archivo. |
| STO-002 | PostgreSQL guarda solo metadata (cirugia_id, nombre, ruta, tipo, tamaño, usuario, fecha). | Verificable en `cirugia_archivos`. |
| STO-003 | Flujo Frontend → API → (Storage + PostgreSQL). Permite visualizar y descargar. | El cliente no escribe directo a la BD sin pasar por API. |

## 6. Auditoría e historial

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| AUD-001 | Subir archivo registra: usuario, acción `ARCHIVO_AGREGADO`, fecha, hora, cirugía (ej. CIR-00125) y archivo. | Registro completo en historial. |
| AUD-002 | Eliminar archivo registra `ARCHIVO_ELIMINADO` con usuario, fecha, hora. | Registro completo en historial. |
| AUD-003 | No se pierde trazabilidad: no se borra el registro histórico sin dejar rastro (borrado lógico + historial). | Tras eliminar, la metadata/historial siguen consultables. |
| AUD-004 | Historial de la cirugía muestra: cirugía creada, LIO asignado, archivo agregado, participante asignado (ej. 09:30 / 09:31 / 09:35 / 09:40). | Los 4 eventos se generan y se ven en el detalle. |
| AUD-005 | Historial transversal con estructura común: usuario, fecha/hora, acción, detalle (compatible con consulta y estudio). | Misma estructura de campos. |

## 7. Permisos

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| PER-001 | Permisos independientes (o por rol) para **ver, subir, descargar y eliminar** archivos. | Cada acción se autoriza por separado. |
| PER-002 | Matriz por rol (ver abajo). | Comportamiento coincide con la matriz. |
| PER-003 | Alineado con el sistema de roles existente. | Reutiliza el mecanismo de roles del proyecto. |
| PER-004 | Autorización aplicada en backend, no solo ocultando botones. | Llamada directa a la API sin permiso → 403. |

| Acción | Admin | Doctor | Recepción |
|---|---|---|---|
| Ver | ✓ | ✓ | Según permiso |
| Subir | ✓ | ✓ | ✓ |
| Descargar | ✓ | ✓ | Según permiso |
| Eliminar | ✓ | Según permiso | Según permiso |

## 8. Flujo de creación

Orden: Seleccionar paciente → Consultar expediente → Origen → Servicio quirúrgico → Fecha/hora → Asignación médica (Cirujano / Ayudante / Anestesiólogo) → Ojo / LIO → Archivos de apoyo → Validar → Crear → (Agenda · Historial · Productividad).

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| FLU-001 | El formulario respeta el orden anterior. | Orden verificable en UI. |
| FLU-002 | Al crear se alimentan **Agenda, Historial y Productividad**. | Los tres reflejan la cirugía nueva. |

## 9. Validaciones antes de guardar (no es un simple INSERT)

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| VAL-001 | **Paciente:** existe, está activo, tiene expediente. | Rechazo con mensaje claro en cada caso. |
| VAL-002 | **Origen:** existe, está activo, corresponde al servicio seleccionado. | Ídem. |
| VAL-003 | **Servicio:** existe, está activo, es de tipo quirúrgico/procedimiento permitido. | Ídem. |
| VAL-004 | **Médico:** existe, está activo, tiene permiso para participar. | Ídem. |
| VAL-005 | **Fecha/hora:** fecha válida, hora válida, sin conflicto. | Ídem. |
| VAL-006 | **LIO** (si se requiere): existe, disponible, no caducado, corresponde al producto seleccionado. | Ídem. |
| VAL-007 | **Archivos:** extensión permitida, MIME válido, tamaño permitido. | Ídem. |
| VAL-008 | La creación es atómica: si algo falla no quedan registros huérfanos (cirugía sin participantes, archivos sin cirugía, etc.). | Fallo forzado a mitad no deja residuos. |

## 10. Conflictos de agenda

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| AGE-001 | Antes de guardar, verificar si el médico (ej. Dr. García, 25/09/2026 10:00–11:00) ya tiene **consulta, estudio, procedimiento o cirugía** en ese horario. | Cada uno de los 4 tipos genera conflicto. |
| AGE-002 | Misma validación para **quirófano/recurso** correspondiente. | Conflicto de recurso detectado. |
| AGE-003 | Compatible con la Agenda unificada. | Consulta de conflictos usa la agenda unificada / todas las fuentes. |

## 11. Estados de cirugía

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| EST-001 | Estados: agendada, aplazada, reagendada, completada, cancelada. | Los 5 existen. |
| EST-002 | Transiciones: Agendada → Reagendada → Agendada; Agendada → Aplazada; Agendada → Cancelada; Agendada → Completada. | Transiciones no definidas son rechazadas. |
| EST-003 | Cada cambio genera historial con estado anterior → nuevo, usuario, fecha y motivo (ej. Cirugía #123: AGENDADA → REAGENDADA). | Historial contiene los 4 datos. |

## 12. Detalle de cirugía

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| DET-001 | Cabecera: código (ej. CIR-00125), paciente, procedimiento + ojo (ej. Catarata OD), origen, fecha y hora. | Visible. |
| DET-002 | Bloques: Información de cirugía (procedimiento, ojo, estado) · Equipo médico (nombre + rol) · LIO (marca, modelo, lote, caducidad) · Archivos de apoyo (Ver/Descargar) · Productividad (médico, rol, estado) · Historial. | Los 6 bloques presentes. |
| DET-003 | Botón **+ Agregar archivo** en el detalle. | Funcional (ver ARC-007). |

## 13. Arquitectura funcional

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| ARQ-001 | Agenda unificada agrupa Consulta · Estudio · Cirugía; todas fluyen por Origen → Catálogo de servicios → Asignación médica → Productividad → Pago. Cirugía aporta: Expediente, Procedimiento, Ojo, LIO, Archivos, Equipo médico. | La cirugía se integra sin romper consultas ni estudios. |
| ARQ-002 | Historial/Auditoría transversal (Consulta, Estudio, Cirugía) con usuario, fecha/hora, acción y detalle. | Cirugía escribe en el mismo esquema/mecanismo. |

## 14. Alcance específico de la Fase 1 (checklist de cierre)

| ID | Alcance | Cubierto por |
|---|---|---|
| ALC-01 | Paciente | PAC-001…004 |
| ALC-02 | Expediente relacionado | EXP-001, EXP-002 |
| ALC-03 | Consulta de origen, cuando aplique | CON-001…003 |
| ALC-04 | Origen / aseguradora | ORI-001…003 |
| ALC-05 | Servicio / procedimiento quirúrgico | CAT-001…003 |
| ALC-06 | Fecha y hora | DAT-001, VAL-005 |
| ALC-07 | Ojo | OJO-001, OJO-002 |
| ALC-08 | Estado | DAT-002, EST-001…003 |
| ALC-09 | Asignación de cirujano | MED-004 |
| ALC-10 | Asignación de participantes médicos | MED-001…003 |
| ALC-11 | Relación con productividad | PRD-001…003 |
| ALC-12 | Selección de LIO / inventario cuando aplique | LIO-001…003 |
| ALC-13 | Archivos de apoyo | ARC-001…007, STO-001…003 |
| ALC-14 | Historial de modificaciones | AUD-001…005 |
| ALC-15 | Validación de conflictos de agenda | AGE-001…003 |
| ALC-16 | Permisos para consultar / subir / eliminar documentos | PER-001…004 |

## 15. Fuera de alcance (explícito)

| ID | Restricción | Criterio |
|---|---|---|
| FUE-001 | No mezclar todavía los archivos de cirugía con el expediente general del paciente. Después se decidirá si aparecen desde el expediente vía relación o vista agregada. | No existe integración archivos-cirugía ↔ expediente general en esta fase. |

---

## Anexo A — Modelo de datos sugerido (adaptar al esquema existente)

```
cirugias
  id, codigo (CIR-00125), paciente_id, expediente_id, consulta_id (null),
  origen_id, servicio_id, ojo (OD|OI|OU), fecha, hora_inicio, duracion_min,
  estatus, recurso_id/quirofano_id (null), lio_inventario_id (null),
  created_by, created_at, updated_at

cat_roles_participante         (cirujano, ayudante, anestesiologo, ...)
cirugia_participantes          id, cirugia_id, medico_id, rol_id
cirugia_productividad          id, cirugia_id, participante_id, origen_id, servicio_id,
                               rol_id, estado (pendiente), monto (null), regla_id (null)
cirugia_archivos               (campos de ARC-004) + deleted_at, deleted_by
cirugia_historial              id, cirugia_id, usuario_id, accion, detalle (jsonb), created_at
```

Acciones de historial mínimas: `CIRUGIA_CREADA`, `LIO_ASIGNADO`, `PARTICIPANTE_ASIGNADO`, `ARCHIVO_AGREGADO`, `ARCHIVO_ELIMINADO`, `ESTADO_CAMBIADO`.

## Anexo B — Casos de validación manual base

> El agente que implemente debe convertir esto en una guía con rutas, usuarios y datos reales del proyecto.

| Caso | Qué probar | Resultado esperado | Requisitos |
|---|---|---|---|
| CP-01 | Intentar crear cirugía sin paciente (UI y API directa) | Bloqueado | PAC-003 |
| CP-02 | Buscar paciente por nombre y por expediente; abrir "Ver expediente"; ver antecedentes, consultas y cirugías previas | Funciona | PAC-001, 002, 004, EXP-001 |
| CP-03 | Cambiar origen; revisar procedimientos; buscar campo de texto libre | Lista filtrada; sin texto libre | CAT-001, 002 |
| CP-04 | Revisar opciones de Ojo; enviar valor inválido por API | Solo OD/OI/OU; inválido rechazado | OJO-001 |
| CP-05 | Crear cirugía completa (camino feliz) | Se crea con código CIR-…, estatus Agendada, aparece en Agenda | DAT-001, 002, DET-001, FLU-002 |
| CP-06 | Cambiar aseguradora del paciente y reabrir la cirugía | Origen de la cirugía no cambia | ORI-002 |
| CP-07 | Asignar cirujano, ayudante, anestesiólogo y un rol adicional; intentar sin cirujano | Se guardan con su rol; sin cirujano se rechaza | MED-001…004 |
| CP-08 | Ver productividad de la cirugía; buscar campo de monto en el formulario | Filas "Pendiente" por participante; sin campo de monto | PRD-001…003 |
| CP-09 | Crear cirugía desde una consulta; navegar en ambos sentidos | Precarga; enlaces funcionan | CON-001…003 |
| CP-10 | Seleccionar LIO válido; probar caducado / no disponible / inexistente | Muestra 5 datos; los inválidos se rechazan | LIO-001…003, VAL-006 |
| CP-11 | Subir PDF, JPG, JPEG, PNG y WEBP | Aceptados y listados con nombre y tamaño | ARC-001, 002, 005 |
| CP-12 | Subir .exe, archivo con extensión falsa (MIME distinto), archivo sobre el límite, exceder cantidad; repetir por API directa | Todos rechazados por backend | ARC-003, VAL-007 |
| CP-13 | Ver y descargar un archivo | Abre y descarga correctamente | ARC-001 |
| CP-14 | Eliminar un archivo; revisar historial y BD | Desaparece de la lista; historial `ARCHIVO_ELIMINADO`; rastro conservado | AUD-002, 003 |
| CP-15 | Revisar historial tras crear, asignar LIO, subir archivo, asignar participante | 4 eventos con usuario y hora | AUD-001, 004, 005 |
| CP-16 | Repetir ver/subir/descargar/eliminar con Admin, Doctor y Recepción | Coincide con la matriz de permisos | PER-001…003 |
| CP-17 | Pedir por URL/API un archivo sin permiso y sin sesión | 403/401; storage no público | PER-004, STO-001 |
| CP-18 | Revisar en Storage y en BD un archivo subido | Archivo en Storage; solo metadata en BD | STO-001…003, ARC-004 |
| CP-19 | Crear cirugía con médico ya ocupado por consulta, estudio, procedimiento y cirugía | Conflicto detectado en los 4 casos | AGE-001, 003 |
| CP-20 | Crear cirugía con el mismo quirófano/recurso en horario ocupado | Conflicto detectado | AGE-002 |
| CP-21 | Paciente inactivo/sin expediente; origen inactivo; servicio no quirúrgico o de otro origen; médico inactivo; fecha/hora inválida | Cada caso rechazado con mensaje claro | VAL-001…005 |
| CP-22 | Cambiar estado por transiciones válidas e inválidas, con motivo | Válidas pasan y generan historial; inválidas se rechazan | EST-001…003 |
| CP-23 | Forzar falla (ej. archivo inválido o falla de storage) durante la creación | No quedan cirugía/participantes/archivos huérfanos | VAL-008 |
| CP-24 | Regresión: usar Agenda, consultas y estudios existentes | Sin cambios de comportamiento | ARQ-001, 002 |
| CP-25 | Buscar archivos de la cirugía en el expediente general | No aparecen | ARC-006, FUE-001 |
| CP-26 | Abrir el detalle y revisar los 6 bloques y "+ Agregar archivo" | Todo presente y funcional | DET-001…003, ARC-007 |
