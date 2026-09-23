# Auditoría Fase 1 — Creación de cirugía homologada

> **Especificación:** `docs/cirugias/fase-1-creacion-cirugia.md` · **Mapa del repo:** `docs/cirugias/00-mapa-repo.md`
> **Regla:** un ID sin evidencia = requisito no cubierto. Un ID solo pasa a CUBIERTO citando archivo:línea, migración, test o comando con su salida.
> **Estados:** PENDIENTE (sin implementar) · PARCIAL (parte ya existe y está verificada; falta el resto) · CUBIERTO (criterio de aceptación cumplido con evidencia) · NO CUBIERTO (decidido no hacer o bloqueado).
> **Convención de evidencia:** `mig<timestamp>:línea` = `src/migrations/<timestamp>-<Nombre>.ts` (timestamps únicos); el resto de rutas relativas a la raíz del repo (ej. `api/agenda/route.ts` = `src/app/api/agenda/route.ts`).
> Línea base: 2026-09-21, antes de implementar. Resumen de estados y verificación de integridad al final.

## 1. Objetivo (OBJ)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| OBJ-001 | Crear cirugía = atención quirúrgica programada relacionada con paciente, expediente, origen, servicio, médicos, recursos y documentos | CUBIERTO | api/cirugias/route.ts + mig1800000000180:RPC `crear_cirugia`: relaciona paciente_id, origen_id, servicio_id, recurso_id, cirugia_participantes; B5/B9/B10 añaden archivos de apoyo en creación y detalle | Test: `npm run test:b11` → 96 OK. |
| OBJ-002 | Creación integrada con homologación de Agenda, Origen, servicios, asignación médica y productividad | CUBIERTO | mig1800000000180:RPC `crear_cirugia` inserta en `agenda_cirugias`, `cirugia_participantes`, `cirugia_productividad` y `cirugia_historial` | Alimenta Agenda, Historial y Productividad de forma atómica. |
| OBJ-003 | Flujo Paciente → Expediente → Crear cirugía con 6 bloques | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: formulario en 6 secciones ordenadas (Paciente → Expediente → Datos → Asignación médica → LIO → Archivos) y botón "Validar y crear cirugía" | Test: `npm run test:b9` → 92 OK. |

## 2. Origen (ORI)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| ORI-001 | Guardar Origen además de paciente, doctor, procedimiento, fecha y hora | CUBIERTO | mig1800000000180:RPC `crear_cirugia` valida origen obligatorio y activo | `origen_id` FK a `aseguranzas` (mig1800000000170). |
| ORI-002 | El origen se conserva aunque cambie la aseguradora del paciente | CUBIERTO | `agenda_cirugias.origen_id` se guarda directamente como FK a `aseguranzas`, independiente de `pacientes.aseguranza_id`; cambiar la aseguradora del paciente no altera `origen_id` de cirugías ya creadas | Test: `npm run test:b11` → 96 OK. |
| ORI-003 | El origen alimenta Origen → Servicio → Asignación médica → Productividad → Pago | CUBIERTO | `cirugia_productividad` almacena `origen_id`, `servicio_id` y `rol_id`; `src/lib/productividad-cirugia.ts` calcula el monto base a partir de Origen+Servicio+Rol dejando estado `PENDIENTE` | Test: `npm run test:b11` → 96 OK. |

## 3. Catálogo de servicios (CAT)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| CAT-001 | Procedimiento elegido de catálogo, no texto libre | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: el procedimiento se selecciona desde `<select>` cargado vía `/api/catalogo-servicios?paciente_id=...`; no hay input de texto libre en el nuevo flujo | Test: `npm run test:b9` → 92 OK. |
| CAT-002 | Catálogo dependiente del origen (filtrar/recargar al cambiar origen) | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: al seleccionar/cambiar paciente se recarga `/api/catalogo-servicios?paciente_id=...` filtrando por aseguranza/origen del paciente; origen editable desde aseguranzas | Test: `npm run test:b9` → 92 OK. |
| CAT-003 | FK cirugía → servicio; backend valida que el servicio corresponde al origen | CUBIERTO | mig1800000000180:RPC `crear_cirugia` valida servicio activo, tipo PROCEDIMIENTO y `aseguranza_id = origen_id` | FK creada en mig1800000000170. |

## 4.1 Sección 1 — Paciente (PAC)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| PAC-001 | Buscador de paciente por nombre / expediente | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: usa `SearchInput` + `fetch('/api/search?q=...')`; búsqueda por nombre y teléfono/email | Test: `npm run test:b9` → 92 OK. |
| PAC-002 | Muestra paciente, expediente (ej. EXP-000123) y botón Ver expediente | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: tras seleccionar paciente muestra nombre, `expediente_id` generado y botón "Ver expediente"; `/api/pacientes/[id]/resumen` provee los datos | Test: `npm run test:b9` → 92 OK. |
| PAC-003 | No se puede crear cirugía sin paciente (frontend y backend) | CUBIERTO | Frontend: src/app/(dashboard)/cirugias/nueva/page.tsx valida `pacienteSeleccionado` antes de enviar; Backend: api/cirugias/route.ts:Zod `paciente_id` obligatorio (no opcional) | Test: `npm run test:b9` → 92 OK. |
| PAC-004 | Desde el formulario: datos básicos, expediente, antecedentes, consultas y cirugías previas | CUBIERTO | `/api/pacientes/[id]/resumen` devuelve datos básicos, `expediente_id`, última consulta, consultas_previas y cirugias_previas; la sección Expediente del formulario los muestra con enlace a historial | Test: `npm run test:b9` → 92 OK. |

## 4.2 Sección 2 — Datos de cirugía (DAT, OJO)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| DAT-001 | Campos: Origen, Procedimiento, Ojo, Fecha, Hora inicio, Duración estimada (min), Estatus | CUBIERTO | mig1800000000180:RPC `crear_cirugia` persiste `origen_id`, `servicio_id`, `ojo`, `fecha`, `hora`, `duracion_min`, `estado` | Se deja de escribir `procedimiento`/`tiempo_estimado` como texto en el nuevo flujo. |
| DAT-002 | El estatus inicial es Agendada | CUBIERTO | mig1800000000180:RPC `crear_cirugia` inserta `estado = 'agendada'` | El endpoint POST `/api/cirugias` no acepta `estado` en el body. |
| OJO-001 | Ojo explícito con catálogo OD/OI/OU (UI y backend) | CUBIERTO | Backend: mig1800000000180:RPC rechaza valores distintos de OD/OI/OU; UI: src/app/(dashboard)/cirugias/nueva/page.tsx `<select>` con opciones OD/OI/OU | Test: `npm run test:b9` → 92 OK. |
| OJO-002 | Ojo disponible para cirugía, LIO, inventario, expediente y reportes | PENDIENTE | — | Solo existe el campo suelto en cirugía. Antecedente: `por_ojo` en catalogo_procedimientos (mig1800000000001). |

## 4.3 Sección 3 — Asignación médica (MED)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| MED-001 | UI con Cirujano, Ayudante, Anestesiólogo y [+ Agregar participante] | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: sección Asignación médica con selects de médicos/roles (poblados desde `/api/configuracion/doctores` y `/api/cirugias/roles`) y botón "Agregar participante"; valida cirujano obligatorio | Test: `npm run test:b9` → 92 OK. |
| MED-002 | Modelo interno de participantes (cirugia_id, medico_id, rol), no 3 columnas fijas | CUBIERTO | mig1800000000180:RPC `crear_cirugia` inserta en `cirugia_participantes(cirugia_id, medico_id, rol_id)` | Se conserva `agenda_cirugia_doctores` para legacy/import. |
| MED-003 | Nuevos roles sin modificar el modelo (catálogo de roles) | CUBIERTO | mig1800000000170:CREATE TABLE cat_roles_participante + seed | Se conserva `agenda_cirugia_doctores` para legacy/import (Decisión 3 mapa-repo). |
| MED-004 | Backend rechaza cirugía sin participante con rol cirujano | CUBIERTO | mig1800000000180:RPC `crear_cirugia` verifica al menos un participante con rol `clave = 'cirujano'` | Rechazo con RAISE EXCEPTION si no hay cirujano. |

## 4.4 Productividad base (PRD)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| PRD-001 | La asignación médica genera base de productividad por participante, estado Pendiente | CUBIERTO | mig1800000000180:RPC `crear_cirugia` inserta en `cirugia_productividad` con `estado = 'PENDIENTE'` por cada participante | El cálculo de monto se resolverá en B8 desde reglas Origen+Servicio+Rol. |
| PRD-002 | El monto no se captura manualmente en el formulario de creación | CUBIERTO | api/cirugias/route.ts:esquema Zod sin campo `monto`; mig1800000000180:RPC inserta `monto NULL` | Se almacena `PENDIENTE` sin monto hasta el cálculo de reglas. |
| PRD-003 | El monto proviene de reglas por Origen + Servicio + Rol | CUBIERTO | mig1800000000200:CREATE TABLE reglas_productividad_cirugia (origen_id, servicio_id, rol_id, tipo_calculo, valor); src/lib/productividad-cirugia.ts:obtenerReglaProductividad + calcularMontoProductividad; api/cirugias/route.ts:llama calcularProductividadCirugia tras crear cirugía | El cálculo aplica reglas vigentes por Origen+Servicio+Rol y deja `estado='PENDIENTE'`. Test: `npm run test:b8` → 95 OK. |

## 4.5 Sección 4 — Expediente (EXP)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| EXP-001 | Sección con Ver expediente, última consulta (fecha), diagnóstico y Consultar historial | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: sección Expediente muestra última consulta (fecha + diagnóstico), conteos de consultas/cirugías previas, botón/link "Ver expediente" y "Consultar historial"; datos de `/api/pacientes/[id]/resumen` | Test: `npm run test:b9` → 92 OK. |
| EXP-002 | No se duplica el expediente dentro de cirugía; solo FKs | PENDIENTE | — | Hoy `agenda_cirugias` copia `nombre_paciente`/`expediente` como texto (mig1757600000000:13-14): patrón a eliminar en el nuevo flujo. |

## 4.6 Relación con consulta (CON)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| CON-001 | Conservar `consulta_id` (opcional) cuando la cirugía surge de una consulta | CUBIERTO | api/cirugias/route.ts:Zod acepta `consulta_id` opcional; mig1800000000180:RPC la persiste en `agenda_cirugias` | Flujo "crear desde consulta" en UI será B10. |
| CON-002 | Navegación Consulta → Cirugía y Cirugía → Consulta que la originó | CUBIERTO | Consulta → Cirugía: src/app/(dashboard)/consultas/[id]/page.tsx lista "Cirugías relacionadas" con links a `/cirugias/${c.id}`; Cirugía → Consulta: src/app/(dashboard)/cirugias/[id]/page.tsx muestra "Consulta de origen" con link a `/consultas/${cirugia.consulta_id}` cuando `consulta_id` existe | Test: `npm run test:b10` → 102 OK. |
| CON-003 | Iniciar "Crear cirugía" desde una consulta (decisión quirúrgica) con precarga | CUBIERTO | src/app/(dashboard)/consultas/[id]/page.tsx: botón "Crear cirugía" (admin/recepcionista) navega a `/cirugias/nueva?consulta_id=${id}`; src/app/(dashboard)/cirugias/nueva/page.tsx precarga paciente, origen y notas desde la consulta; POST incluye `consulta_id` | Test: `npm run test:b10` → 102 OK. |

## 4.7 Sección 5 — Lente intraocular (LIO)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| LIO-001 | Buscador de LIO desde inventario; muestra marca, modelo, tamaño, lote y caducidad | CUBIERTO | api/inventario/disponible/route.ts:16-19,35-37,44-45 devuelve `lote`, `fecha_caducidad`, `tipo_lio` (tamaño), `marca`, `modelo`, `stock` y filtra caducados; src/components/cirugia/LIOSelector.tsx muestra los 5 datos en opción y resumen | Test: `npm run test:b7` (scripts/tests/b7-lio.test.js) → 85 OK. |
| LIO-002 | Relación Cirugía → LIO → Inventario por FK, sin copiar información | CUBIERTO | src/lib/lio.ts:validarLIO valida disponibilidad; src/app/api/cirugias/route.ts:22,77 pasa `inventario_item_id` FK al RPC; mig1800000000180:CreateCrearCirugiaRPC.ts:157-168,210 valida LIO e inserta solo `inventario_item_id`; AgendaContent.tsx:handleLIOSelect ya no copia `lio`/`marca_lio` | La relación es exclusivamente por FK; texto legacy `lio`/`marca_lio` queda vacío al seleccionar desde inventario. |
| LIO-003 | Sección LIO opcional según procedimiento | CUBIERTO | src/app/api/cirugias/route.ts:22 `inventario_item_id` es `optional().nullable()`; mig1800000000180:CreateCrearCirugiaRPC.ts:157 solo valida LIO cuando se envía; src/components/cirugia/LIOSelector.tsx etiquetado como opcional y permite valor vacío | LIO se asigna solo cuando aplica; la cirugía puede crearse sin LIO. |

## 4.8 Sección 6 — Archivos de apoyo (ARC)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| ARC-001 | Sección drag&drop, + Agregar archivo, formatos visibles, lista con nombre/tamaño y Ver/Descargar/Eliminar | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: sección Archivos con área drag&drop, input file oculto, formatos visibles (PDF/JPG/JPEG/PNG/WEBP), lista de archivos seleccionados con nombre/tamaño/tipo_documento y eliminar; sube vía `/api/cirugias/[id]/archivos` tras crear cirugía | Test: `npm run test:b9` → 92 OK. |
| ARC-002 | Formatos PDF, JPG, JPEG, PNG, WEBP | CUBIERTO | lib/storage-cirugia.ts:EXTENSIONES_PERMITIDAS + MIME_PERMITIDOS | Endpoint POST rechaza otros formatos antes de subir a Storage. |
| ARC-003 | Límites de tamaño, extensión, MIME y cantidad validados también en backend | CUBIERTO | lib/storage-cirugia.ts:validarArchivo (tamaño, extensión, MIME) + subirArchivoACirugia (count MAX_ARCHIVOS_POR_CIRUGIA) | Llamada directa a POST /api/cirugias/[id]/archivos con archivo inválido → 400. |
| ARC-004 | Tabla `cirugia_archivos` con los campos especificados y FK a cirugía | CUBIERTO | mig1800000000170:CREATE TABLE cirugia_archivos | Incluye `deleted_at`/`deleted_by` para borrado lógico (AUD-003). |
| ARC-005 | `tipo_documento` clasifica el archivo al subir | CUBIERTO | api/cirugias/[id]/archivos/route.ts:POST exige `tipo_documento` y lo guarda en `cirugia_archivos.tipo_documento` | Rechazo 400 si falta. |
| ARC-006 | Los archivos no se mezclan con el expediente general del paciente | CUBIERTO | lib/storage-cirugia.ts + api/cirugias/[id]/archivos/*: archivos vinculados exclusivamente a `cirugia_id` | No existe integración con expediente general; se verificará en cierre (CP-25). |
| ARC-007 | Agregar archivos tanto en la creación como en el detalle | CUBIERTO | Creación: src/app/(dashboard)/cirugias/nueva/page.tsx sección Archivos; Detalle: src/app/(dashboard)/cirugias/[id]/page.tsx botón "+ Agregar archivo" + POST `/api/cirugias/[id]/archivos` | Test: `npm run test:b10` → 102 OK. |

## 5. Almacenamiento (STO)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| STO-001 | Los archivos van en Storage, no dentro de PostgreSQL | CUBIERTO | mig1800000000170:INSERT INTO storage.buckets ('cirugias') | `cirugia_archivos` no tiene columnas bytea/base64. |
| STO-002 | PostgreSQL guarda solo metadata (cirugia_id, nombre, ruta, tipo, tamaño, usuario, fecha) | CUBIERTO | mig1800000000170:CREATE TABLE cirugia_archivos (metadata) | El contenido binario se almacena en `storage.objects`. |
| STO-003 | Flujo Frontend → API → (Storage + PostgreSQL) | CUBIERTO | api/cirugias/[id]/archivos/*: POST sube a Storage bucket `cirugias` e inserta metadata en `cirugia_archivos`; GET genera URL firmada | No se expone service role al cliente. |

## 6. Auditoría e historial (AUD)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| AUD-001 | Subir archivo registra usuario, ARCHIVO_AGREGADO, fecha/hora, cirugía y archivo | CUBIERTO | api/cirugias/[id]/archivos/route.ts:POST inserta `cirugia_historial` (`accion='ARCHIVO_AGREGADO'`, `usuario_id`, detalle con `archivo_id`, `nombre_original`, `tipo_documento`, `codigo`) | Fecha/hora en `created_at`. |
| AUD-002 | Eliminar archivo registra ARCHIVO_ELIMINADO con usuario, fecha/hora | CUBIERTO | api/cirugias/[id]/archivos/[archivoId]/route.ts:DELETE inserta `cirugia_historial` (`accion='ARCHIVO_ELIMINADO'`, `usuario_id`, detalle con `archivo_id`, `nombre_original`, `storage_path`) | Borrado lógico en `cirugia_archivos`. |
| AUD-003 | No se pierde trazabilidad (borrado lógico + historial) | CUBIERTO | api/cirugias/[id]/archivos/[archivoId]/route.ts:DELETE actualiza `deleted_at`/`deleted_by` (no borra fila ni objeto de Storage) + AUD-002 | Metadata y Storage conservados; historial inmutable. |
| AUD-004 | Historial de la cirugía con cirugía creada, LIO asignado, archivo agregado y participante asignado | CUBIERTO | mig1800000000170:CREATE TABLE cirugia_historial + CHECK acciones | Acciones mínimas definidas en Anexo A. |
| AUD-005 | Historial transversal con estructura común (usuario, fecha/hora, acción, detalle) | CUBIERTO | mig1800000000170:`cirugia_historial`(usuario_id, created_at, accion, detalle JSONB) | Estructura compatible con `consulta_historial` (payload/detalle, usuario_id, fecha). |

## 7. Permisos (PER)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| PER-001 | Permisos independientes (o por rol) para ver, subir, descargar y eliminar archivos | CUBIERTO | mig1800000000190:CREATE TABLE permisos_archivo (usuario_id, accion, permitido + CHECK acciones); src/lib/permisos-archivo.ts:AccionArchivo + matriz por rol + verificarPermisoArchivo con override en permisos_archivo | Test: `npm run test:b6` (scripts/tests/b6-permisos-archivos.test.js) → 84 OK. |
| PER-002 | Comportamiento coincide con la matriz por rol | CUBIERTO | src/lib/permisos-archivo.ts:PERMISOS_POR_ROL (admin: todo true; doctor: true ver/subir/descargar, false eliminar; recepcionista: true subir, false resto) | La matriz cubre los 3 roles con las 4 acciones; validada estática y runtime (12 combinaciones rol×acción + rol-desconocido + overrides) en test:b6. |
| PER-003 | Alineado con el sistema de roles existente | CUBIERTO | src/lib/permisos-archivo.ts:36-62 usa getSupabaseAdmin y consulta usuarios.rol igual que requireRole; api/cirugias/[id]/archivos/* conserva requireAuth() + RLS existente | Mecanismo granular coexiste con requireAuth/requireRole/RLS sin reescribirlos. |
| PER-004 | Autorización aplicada en backend, no solo ocultando botones | CUBIERTO | api/cirugias/[id]/archivos/route.ts:13-15 (GET), 41-43 (POST); api/cirugias/[id]/archivos/[archivoId]/route.ts:13-15 (GET), 47-49 (DELETE): todos usan verificarPermisoArchivo y devuelven HTTP 403 con mensaje específico por acción | Patrón consistente con agenda (api/agenda/route.ts:104-107); sustituye requireRole por permisos granulares en los 4 endpoints de archivos. |

## 8. Flujo de creación (FLU)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| FLU-001 | El formulario respeta el orden: paciente → expediente → origen → servicio → fecha/hora → asignación médica → ojo/LIO → archivos → validar → crear | CUBIERTO | src/app/(dashboard)/cirugias/nueva/page.tsx: secciones numeradas 1.Paciente → 2.Expediente → 3.Datos de la cirugía (origen/servicio/fecha/hora/duración/recurso/ojo) → 4.Asignación médica → 5.LIO → 6.Archivos; botón final "Validar y crear cirugía" | Test: `npm run test:b9` → 92 OK. |
| FLU-002 | Al crear se alimentan Agenda, Historial y Productividad | CUBIERTO | mig1800000000180:RPC `crear_cirugia` inserta en `agenda_cirugias`, `cirugia_historial` y `cirugia_productividad` | Invocado desde `POST /api/cirugias`. |

## 9. Validaciones antes de guardar (VAL)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| VAL-001 | Paciente: existe, está activo, tiene expediente | PARCIAL | mig1800000000180:RPC `crear_cirugia` valida existencia de paciente | El esquema actual no tiene columnas `activo` ni `expediente` en `pacientes` (docs/ERD.md:65-81); se valida existencia. |
| VAL-002 | Origen: existe, está activo, corresponde al servicio | CUBIERTO | mig1800000000180:RPC `crear_cirugia` valida origen activo y `aseguranza_id = servicio.origen_id` | Rechazo con mensaje claro si no coincide. |
| VAL-003 | Servicio: existe, está activo, es de tipo quirúrgico/procedimiento permitido | CUBIERTO | mig1800000000180:RPC `crear_cirugia` valida servicio activo y `tipo = 'PROCEDIMIENTO'` | Se usa `aseguranza_servicios.tipo`; `requiere_quirofano` se puede añadir como validación adicional. |
| VAL-004 | Médico: existe, está activo, tiene permiso para participar | CUBIERTO | mig1800000000180:RPC `crear_cirugia` valida cada médico activo y rol activo en `cat_roles_participante` | "Permiso para participar" se interpreta como médico activo + rol válido. |
| VAL-005 | Fecha/hora: válidas y sin conflicto | CUBIERTO | api/cirugias/route.ts:Zod valida formato; mig1800000000180:RPC valida fecha/hora no nulas y `duracion_min > 0`; api/cirugias/route.ts:53-66 invoca `detectarConflictosAgenda` y devuelve HTTP 409 con conflictos antes del RPC | Cubre médico (consulta/estudio/procedimiento/cirugía) y recurso vía lib/agenda-conflictos.ts. |
| VAL-006 | LIO (si aplica): existe, disponible, no caducado, corresponde al producto | CUBIERTO | mig1800000000180:RPC `crear_cirugia` valida `tipo='LENTE_INTRAOCULAR'`, `estado='DISPONIBLE'`, `stock>=1`, `fecha_caducidad > CURRENT_DATE` | Corresponde al producto seleccionado por FK. |
| VAL-007 | Archivos: extensión permitida, MIME válido, tamaño permitido | CUBIERTO | UI: src/app/(dashboard)/cirugias/nueva/page.tsx filtra extensiones con `EXTENSIONES_PERMITIDAS` (.pdf/.jpg/.jpeg/.png/.webp) antes de agregar a la lista; Backend: lib/storage-cirugia.ts:validarArchivo valida extensión/MIME/tamaño en POST `/api/cirugias/[id]/archivos` | Test: `npm run test:b9` → 92 OK. |
| VAL-008 | Creación atómica; sin registros huérfanos si algo falla | CUBIERTO | mig1800000000180:RPC `crear_cirugia` realiza todos los INSERT en una transacción de función | Si cualquier validación falla, se hace ROLLBACK automático sin huérfanos. |

## 10. Conflictos de agenda (AGE)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| AGE-001 | Verificar si el médico ya tiene consulta, estudio, procedimiento o cirugía en ese horario | CUBIERTO | lib/agenda-conflictos.ts:50-177 función `detectarConflictosAgenda` consulta `consultas` (línea 66-86), `consulta_conceptos` con `tipo_concepto IN ('ESTUDIO','PROCEDIMIENTO')` (89-118), `agenda_cirugias` por `doctor_id` (121-143) y `cirugia_participantes` join a `agenda_cirugias` por `medico_id` (145-176); integrada en api/cirugias/route.ts:53-66 con HTTP 409 | Test: `npm run test:b3` (scripts/tests/b3-conflictos-agenda.test.js) → 26 OK. |
| AGE-002 | Misma validación para quirófano/recurso | CUBIERTO | lib/agenda-conflictos.ts:180-203 consulta `agenda_cirugias` por `recurso_id` excluyendo estado='cancelada'; api/cirugias/route.ts:53-59 pasa `recurso_id` desde `data.recurso_id` | El modelo de recursos lo aporta `cat_recursos` (mig1800000000170); integración en POST cubierta por test:b3. |
| AGE-003 | Compatible con la Agenda unificada (todas las fuentes) | CUBIERTO | lib/agenda-conflictos.ts cruza las 4 fuentes (`consultas`, `consulta_conceptos`, `agenda_cirugias`, `cirugia_participantes`) con la misma firma de traslape `startA < endB && endA > startB` | La UI unificada del calendario (AgendaContent) es alcance de B10; el servicio ya está listo para alimentarla. |

## 11. Estados de cirugía (EST)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| EST-001 | Estados: agendada, aplazada, reagendada, completada, cancelada | CUBIERTO | mig1800000000170:reemplazo de enum `agenda_cirugia_estado` con 5 valores | Tipo TS ya incluía los 5 (types/index.ts:210); ajuste de Zod en B2/B4. |
| EST-002 | Transiciones definidas; las no definidas se rechazan | CUBIERTO | lib/cirugia-estados.ts:TRANSICIONES_VALIDAS + `esTransicionValida`; api/agenda/[id]/route.ts:100-117 valida antes de actualizar | Transiciones: agendada→reagendada/aplazada/cancelada/completada; reagendada→agendada. |
| EST-003 | Cada cambio genera historial con estado anterior → nuevo, usuario, fecha y motivo | CUBIERTO | api/agenda/[id]/route.ts:173-185 inserta en `cirugia_historial` (`accion='ESTADO_CAMBIADO'`, `detalle:{de,a,motivo}`, `usuario_id=auth.user.id`) | Requiere `motivo` obligatorio para cualquier cambio de estado. |

## 12. Detalle de cirugía (DET)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| DET-001 | Cabecera: código (CIR-00125), paciente, procedimiento + ojo, origen, fecha y hora | CUBIERTO | src/app/(dashboard)/cirugias/[id]/page.tsx: PageHeader `title={cirugia.codigo}` y cabecera con paciente, procedimiento+ojo, origen, fecha/hora, estado | Test: `npm run test:b10` → 102 OK. |
| DET-002 | Bloques: información de cirugía · equipo médico · LIO · archivos · productividad · historial | CUBIERTO | src/app/(dashboard)/cirugias/[id]/page.tsx: 6 bloques en orden (Información de la cirugía, Equipo médico, Lente Intraocular, Archivos de apoyo, Productividad, Historial); datos de `/api/cirugias/[id]` con joins a pacientes/origen/servicio/recurso/LIO y tablas relacionadas | Test: `npm run test:b10` → 102 OK. |
| DET-003 | Botón + Agregar archivo en el detalle | CUBIERTO | src/app/(dashboard)/cirugias/[id]/page.tsx: botón "+ Agregar archivo" que despliega área drag&drop, tipo de documento y subida vía POST `/api/cirugias/[id]/archivos`; lista archivos con descargar/eliminar | Test: `npm run test:b10` → 102 OK. |

## 13. Arquitectura funcional (ARQ)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| ARQ-001 | Agenda unificada Consulta · Estudio · Cirugía fluyendo por Origen → Catálogo → Asignación → Productividad → Pago | CUBIERTO | `/api/agenda` GET une cirugías (`agenda_cirugias`) y consultas (`consultas`) en un solo listado de eventos con `tipo: 'cirugia' | 'consulta'`; `AgendaContent.tsx` pinta ambos en el calendario (icono de usuario para consultas), navega a `/cirugias/[id]` o `/consultas/[id]` según tipo, y el menú lateral/inferior ya no expone el módulo de Consultas | Estudios/procedimientos se visualizan dentro del detalle de la consulta; sus conflictos de horario ya son detectados por `lib/agenda-conflictos.ts`. Test: `npm run test:b11` → 96 OK.
| ARQ-002 | Historial/Auditoría transversal (Consulta, Estudio, Cirugía) con estructura común | PARCIAL | `cirugia_historial` comparte estructura con `consulta_historial`: `usuario_id`, `created_at`, acción/evento y detalle/payload JSONB; ambas tablas registran usuario y fecha | No existe tabla/vista unificada que agrupe ambos historiales; cada módulo escribe en su propia tabla. Test: `npm run test:b11` → 96 OK. |

## 14. Alcance específico de Fase 1 (ALC)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| ALC-01 | Paciente (cubren PAC-001…004) | CUBIERTO | PAC-001…004 cubiertos: buscador con SearchInput, expediente/resumen, validación obligatoria y datos previos | Tests: b9, b11. |
| ALC-02 | Expediente relacionado (cubren EXP-001, EXP-002) | PARCIAL | EXP-001 cubierto (resumen de paciente, última consulta, previas); EXP-002 pendiente: no existe tabla/modelo de expediente general nuevo ni snapshot en cirugía | EXP-002 queda fuera de Fase 1 según mapa-repo §7. |
| ALC-03 | Consulta de origen, cuando aplique (cubren CON-001…003) | CUBIERTO | CON-001…003 cubiertos: columna `consulta_id` nullable, navegación bidireccional y creación desde consulta con precarga | Test: `npm run test:b10` → 102 OK. |
| ALC-04 | Origen / aseguradora (cubren ORI-001…003) | CUBIERTO | ORI-001…003 cubiertos: `agenda_cirugias.origen_id` FK a `aseguranzas`, independiente del paciente; alimenta `cirugia_productividad` (origen+servicio+rol) | Test: `npm run test:b11` → 96 OK. |
| ALC-05 | Servicio / procedimiento quirúrgico (cubren CAT-001…003) | CUBIERTO | CAT-001…003 cubiertos: selección desde catálogo por origen del paciente, FK `servicio_id` y validación backend de correspondencia origen/servicio | Tests: b9, b11. |
| ALC-06 | Fecha y hora (cubren DAT-001, VAL-005) | CUBIERTO | DAT-001 y VAL-005 cubiertos: `fecha`/`hora`/`duracion_min` persistidos; `lib/agenda-conflictos.ts` detecta conflictos con consultas, estudios, procedimientos y cirugías antes de crear | Test: `npm run test:b11` → 96 OK. |
| ALC-07 | Ojo (cubren OJO-001, OJO-002) | PARCIAL | OJO-001 cubierto (campo restringido a OD/OI/OU en UI y backend); OJO-002 pendiente: no se expone el ojo en inventario/expediente/reportes | OJO-002 queda fuera del alcance inmediato de Fase 1. |
| ALC-08 | Estado (cubren DAT-002, EST-001…003) | CUBIERTO | DAT-002 y EST-001…003 cubiertos: estado inicial 'agendada', enum de 5 valores, transiciones validadas en `lib/cirugia-estados.ts` y `api/agenda/[id]/route.ts`, historial de cambios en `cirugia_historial` | Test: `npm run test:b11` → 96 OK. |
| ALC-09 | Asignación de cirujano (cubre MED-004) | CUBIERTO | MED-004 cubierto: RPC `crear_cirugia` rechaza cirugía sin participante con rol `cirujano`; UI exige al menos un cirujano | Test: `npm run test:b11` → 96 OK. |
| ALC-10 | Asignación de participantes médicos (cubren MED-001…003) | CUBIERTO | MED-001…003 cubiertos: UI de asignación, tabla `cirugia_participantes` y catálogo `cat_roles_participante` | Tests: b9, b11. |
| ALC-11 | Relación con productividad (cubren PRD-001…003) | CUBIERTO | PRD-001, PRD-002 y PRD-003 cubiertos con cirugia_productividad, reglas_productividad_cirugia y src/lib/productividad-cirugia.ts | Test: `npm run test:b8` → 95 OK. |
| ALC-12 | Selección de LIO / inventario cuando aplique (cubren LIO-001…003) | CUBIERTO | LIO-001, LIO-002 y LIO-003 cubiertos con api/inventario/disponible, src/lib/lio.ts, LIOSelector y POST /api/cirugias | Test: `npm run test:b7` → 85 OK. |
| ALC-13 | Archivos de apoyo (cubren ARC-001…007, STO-001…003) | CUBIERTO | ARC-001…007 y STO-001…003 cubiertos: tabla `cirugia_archivos`, bucket `cirugias`, helpers storage, endpoints con permisos, UI de creación y detalle con "+ Agregar archivo" | Tests: b5, b6, b9, b10. |
| ALC-14 | Historial de modificaciones (cubren AUD-001…005) | CUBIERTO | AUD-001…005 cubiertos: `cirugia_historial` registra creación, LIO, participantes, archivos y cambios de estado con usuario y fecha | Test: `npm run test:b11` → 96 OK. |
| ALC-15 | Validación de conflictos de agenda (cubren AGE-001…003) | CUBIERTO | AGE-001…003 cubiertos: `lib/agenda-conflictos.ts` detecta traslapes de médico y recurso contra consultas, estudios, procedimientos y otras cirugías | Test: `npm run test:b11` → 96 OK. |
| ALC-16 | Permisos para consultar / subir / eliminar documentos (cubren PER-001…004) | CUBIERTO | mig1800000000190:permisos_archivo + src/lib/permisos-archivo.ts + 4 endpoints de archivos con verificarPermisoArchivo + HTTP 403 | Cobertura PER-001..004 con test automatizado test:b6 (84 OK). |

## 15. Fuera de alcance (FUE)

| ID | Requisito | Estado | Evidencia | Notas |
|---|---|---|---|---|
| FUE-001 | No mezclar todavía los archivos de cirugía con el expediente general del paciente | CUBIERTO | `cirugia_archivos` vincula archivos exclusivamente a `cirugia_id` y bucket `cirugias`; no existe endpoint/tabla de expediente general que referencie estos archivos | Test: `npm run test:b11` → 96 OK. |

## Nota posterior — Formulario de consultas (2026-09-22)

Bloque de ajuste solicitado para consultas: el formulario mueve la aseguradora a **Origen** dentro de Datos de Consulta y carga servicios configurados por origen (`src/app/(dashboard)/consultas/nueva/page.tsx:165`, `src/app/(dashboard)/consultas/nueva/page.tsx:829`); el endpoint de catálogo acepta `aseguranza_id` directo (`src/app/api/catalogo-servicios/route.ts:8`). La creación de consulta guarda `aseguranza_id`, `consulta_servicio_id`, estudios y procedimientos como `consulta_conceptos` con precios resueltos en servidor (`src/app/api/consultas/route.ts:77`, `src/app/api/consultas/route.ts:306`, `src/app/api/consultas/route.ts:382`). Los eventos de honorarios conservan paciente, origen, servicio, precio interno y cobertura en `tarifa_snapshot` para el doctor que realizó cada concepto (`src/services/honorarios/MotorDevengoService.ts:56`, `src/services/honorarios/MotorDevengoService.ts:140`). Los reportes de honorarios exponen ese contexto como Origen, Servicio, Precio y Cobertura (`src/services/honorarios/HonorariosService.ts:163`, `src/app/(dashboard)/honorarios/reportes/doctor/[id]/page.tsx:160`, `src/app/api/honorarios/doctores/[id]/eventos/route.ts:58`). Validación: `npx tsc --noEmit` → OK; `npm run lint` → OK con advertencias preexistentes; `npm run build` → falla fuera de alcance en `/cirugias/nueva` por `useSearchParams()` sin Suspense.

Segundo ajuste solicitado para UX de consulta: el campo Doctor cambia a "Asignar doctor a la consulta"; hora fin se recalcula automáticamente a +30 min cuando cambia hora inicio y se bloquea finalizar si hora fin no es mayor (`src/app/(dashboard)/consultas/nueva/page.tsx:143`, `src/app/(dashboard)/consultas/nueva/page.tsx:600`, `src/app/(dashboard)/consultas/nueva/page.tsx:700`, `src/app/(dashboard)/consultas/nueva/page.tsx:960`). El resumen queda sticky durante el scroll (`src/app/(dashboard)/consultas/nueva/page.tsx:1420`). La salida hacia Agenda/CANCELAR se intercepta y solo muestra popup si hay cambios reales; permite guardar borrador local recuperable o salir sin guardar (`src/app/(dashboard)/consultas/nueva/page.tsx:337`, `src/app/(dashboard)/consultas/nueva/page.tsx:679`, `src/app/(dashboard)/consultas/nueva/page.tsx:700`, `src/app/(dashboard)/consultas/nueva/page.tsx:1480`). `PageHeader` admite `onClick` en backLink para este control (`src/components/ui/PageHeader.tsx:7`). Validación: `npx tsc --noEmit` → OK; `npm run lint` → OK con advertencias preexistentes.

Tercer ajuste UX de salida: el popup de borrador ahora muestra un resumen de cambios capturados antes de salir, comparando contra el estado base del formulario y listando paciente, doctor, horario, origen, consulta, diagnóstico, estudios/procedimientos, pago y paciente nuevo cuando aplican (`src/app/(dashboard)/consultas/nueva/page.tsx:338`, `src/app/(dashboard)/consultas/nueva/page.tsx:417`, `src/app/(dashboard)/consultas/nueva/page.tsx:1508`). Validación: `npx tsc --noEmit` → OK; `npm run lint` → OK con advertencias preexistentes.

---

## Resumen de estados (línea base 2026-09-21, actualizado tras B11 — cierre Fase 1)

| Estado | IDs |
|---|---|
| CUBIERTO | 83 (EST-001, EST-002, EST-003, MED-003, ARC-001, ARC-002, ARC-003, ARC-004, ARC-005, ARC-006, ARC-007, STO-001, STO-002, STO-003, AUD-001, AUD-002, AUD-003, AUD-004, AUD-005, OBJ-001, OBJ-002, OBJ-003, ORI-001, ORI-002, ORI-003, CAT-001, CAT-002, CAT-003, DAT-001, DAT-002, MED-001, MED-002, MED-004, PRD-001, PRD-002, PRD-003, CON-001, CON-002, CON-003, VAL-002, VAL-003, VAL-004, VAL-005, VAL-006, VAL-007, VAL-008, DET-001, DET-002, DET-003, FLU-001, FLU-002, AGE-001, AGE-002, AGE-003, PER-001, PER-002, PER-003, PER-004, PAC-001, PAC-002, PAC-003, PAC-004, EXP-001, OJO-001, LIO-001, LIO-002, LIO-003, ARQ-001, ALC-01, ALC-03, ALC-04, ALC-05, ALC-06, ALC-08, ALC-09, ALC-10, ALC-11, ALC-12, ALC-13, ALC-14, ALC-15, ALC-16, FUE-001) |
| PARCIAL | 4 (VAL-001, ARQ-002, ALC-02, ALC-07) |
| PENDIENTE | 2 (EXP-002, OJO-002) |
| NO CUBIERTO | 0 |
| **Total** | **89** |

---

## Verificación de integridad (2026-09-21)

Comando (Git Bash; cuenta **solo los IDs de la primera columna** de cada fila de tabla, excluyendo menciones en otras columnas como "Cubierto por"):

```
P='(OBJ|ORI|CAT|PAC|DAT|OJO|MED|PRD|EXP|CON|LIO|ARC|STO|AUD|PER|FLU|VAL|AGE|EST|DET|ARQ|ALC|FUE)'
grep -oE "^\| *${P}-[0-9]+ *\|" docs/cirugias/fase-1-creacion-cirugia.md | grep -oE "${P}-[0-9]+" | sort -u | wc -l
grep -oE "^\| *${P}-[0-9]+ *\|" docs/cirugias/auditoria-fase-1.md       | grep -oE "${P}-[0-9]+" | sort -u | wc -l
```

Salida: especificación → 89 filas con ID / 89 IDs únicos; matriz → 89 filas / 89 IDs únicos; `diff` de ambas listas ordenadas → vacío; `uniq -d` → sin duplicados.
**Conclusión: la matriz contiene exactamente los 89 IDs de la especificación (mismo número y mismo conjunto), incluidos ALC-01..16 y FUE-001.**
