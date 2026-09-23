# 00 — Mapa del repositorio para Fase 1 (Creación de cirugía homologada)

> **Fuente de verdad de requisitos:** `docs/cirugias/fase-1-creacion-cirugia.md` (89 IDs: OBJ, ORI, CAT, PAC, DAT, OJO, MED, PRD, EXP, CON, LIO, ARC, STO, AUD, PER, FLU, VAL, AGE, EST, DET, ARQ, ALC-01..16, FUE-001).
> **Matriz de auditoría:** `docs/cirugias/auditoria-fase-1.md` (una fila por ID; se actualiza tras cada bloque de trabajo).
> Elaborado: 2026-09-21 · Método: exploración amplia delegada (@explore) + verificación directa con grep/glob/lectura de archivos. Toda ruta citada fue verificada.

---

## 1. Stack y arquitectura (verificado)

- **Next.js 14 (App Router) + TypeScript 5 + React 18 + Tailwind** (`package.json`). PWA con service worker (`src/app/layout.tsx`).
- **Supabase**: `@supabase/ssr`. Clientes: `src/lib/supabase/server.ts` (SSR + `requireAuth()` + `requireRole()`), `src/lib/supabase/client.ts` (browser), `src/lib/supabase/admin.ts` (service role).
- **Patrón de API** (consistente en todo el repo): `requireAuth()` → `requireRole(user, roles)` → Zod → `getSupabaseAdmin()` → query → respuesta. Ejemplo: `src/app/api/agenda/route.ts:31-33,103-107`.
- **Middleware** solo valida sesión (`src/middleware.ts` → `src/lib/supabase/middleware.ts`); el RBAC es por endpoint.
- **Migraciones**: TypeScript (TypeORM `MigrationInterface`) en `src/migrations/` (34 archivos), convención `<timestamp>-<Nombre>.ts`, aplicadas con `node scripts/run-migrations.js` (usa `DATABASE_URL`; tabla `schema_migrations`). Seeds en `scripts/` y `sql/`.
- **Transacciones**: el proyecto ya tiene el patrón RPC PostgreSQL para atomicidad (`crear_consulta`, `src/migrations/1800000000160-CreateCrearConsultaRPC.ts`).
- **Tests: NO EXISTE NINGUNO** (glob `**/*.test.*` → 0; sin vitest/jest/playwright en `package.json`).

## 2. Qué existe (por dominio, con evidencia)

### 2.1 Agenda / Cirugías (base actual)
- Tabla **`agenda_cirugias`** (`src/migrations/1757600000000-CreateAgendaCirugiasTable.ts:10-33`): `paciente_id` FK (opcional), `nombre_paciente`/`expediente`/`procedimiento`/`ojo`/`lio`/`marca_lio`/`tiempo_estimado`/`procedencia` (todo TEXT), `fecha DATE`, `hora TIME`, `doctor_id` FK, `estado` con **ENUM de solo 4 valores** (`agendada|aplazada|completada|cancelada`, línea 8 — falta `reagendada` en BD; el tipo TS sí lo tiene: `src/types/index.ts:210`), DEFAULT `'agendada'` (línea 26). RLS + 3 policies (admin/doctor propio/recepcionista).
- Complementos: `consulta_id` FK nullable (`1800000000004-AddConsultaIdToAgendaCirugias.ts:8-13`), `inventario_item_id` FK nullable (`1800000000060-AddInventarioItemIdToAgendaCirugias.ts:8-12`).
- Tabla **`agenda_cirugia_doctores`** (`1800000000012-CreateAgendaCirugiaDoctoresTable.ts:20-33`): `cirugia_id, doctor_id, rol` (ENUM fijo `rol_cirugia`: CIRUJANO_PRINCIPAL/AYUDANTE/ANESTESIOLOGO/INSTRUMENTISTA/CIRCULANTE), `porcentaje_participacion`, trigger de validación de porcentajes, RLS. **Solo la escribe el import de Excel** (`src/app/api/agenda/import/route.ts:332-335`, siempre CIRUJANO_PRINCIPAL); el POST de creación no crea participantes.
- **API**: `src/app/api/agenda/route.ts` (GET listado con filtros/RBAC; POST crear — `cirugiaCreateSchema` líneas 8-28 con `paciente_id` **opcional**, `procedimiento`/`ojo`/`procedencia` texto libre, valida solo doctor existe/activo líneas 130-140; si viene `inventario_item_id` llama `consumirLIO` tras el insert y revierte si falla), `src/app/api/agenda/[id]/route.ts` (GET/PATCH/DELETE; al asignar/cambiar LIO descuenta stock, al reemplazar libera el anterior, al pasar a `completada` consume si aún no, al `cancelada` libera), `src/app/api/agenda/import/route.ts` (Excel), `src/app/api/agenda/notificaciones/route.ts`.
- **UI**: `src/app/(dashboard)/agenda/page.tsx` + `AgendaContent.tsx` (~1200 líneas: calendario mes/semana/día, drag&drop para reagendar, import, filtros, detalle en popover, formulario plano de cirugía líneas ~1021-1151 con "LIO desde Inventario" select). Detalle: `src/app/(dashboard)/agenda/[id]/page.tsx` (básico, sin código CIR- ni origen). Vista móvil: `src/components/agenda/MobileCalendarView.tsx`.
- **Detección de conflictos: NO EXISTE** (grep `conflicto|traslape|overlap|conflict` en `src/` → 0 resultados). No hay agenda unificada (el calendario solo muestra cirugías).

### 2.2 Pacientes y expediente
- `pacientes` con `aseguranza_id` FK (`docs/ERD.md:78`), póliza, afiliación. API: `src/app/api/pacientes/route.ts`, `pacientes/[id]/route.ts`, búsqueda global `src/app/api/search/route.ts`.
- **NO existe tabla `expedientes`**: "expediente" es un campo TEXT suelto (`agenda_cirugias` línea 14; también en consultas). No hay vista de expediente por paciente.

### 2.3 Consultas (relacionadas con cirugía)
- `consultas` con `paciente_id`, `doctor_id`, `hora_inicio/hora_fin`, `diagnostico`, `aseguranza_id`, estatus. POST valida existencia de paciente (`src/app/api/consultas/route.ts:232-238`) y resuelve aseguranza del paciente (líneas 268-273). RPC transaccional `crear_consulta` (`1800000000160`) con historial integrado (líneas 139, 183-188).
- **Navegación consulta ↔ cirugía: NO EXISTE** (grep `cirugi` en `src/app/(dashboard)/consultas` → 0; grep `consulta` en `src/app/(dashboard)/agenda/*.tsx` → 0).

### 2.4 Origen (aseguradoras) y catálogos de servicios
- `aseguranzas` (PRIVADA/CONVENIO/PARTICULAR, `activo`) + `coberturas_aseguranza`. Admin: `src/app/(dashboard)/configuracion/aseguranzas/`.
- **`aseguranza_servicios`** (`1800000000150-CreateAseguranzaServicios.ts:9`): puente **origen → servicio** (`aseguranza_id`, `tipo` ESTUDIO/PROCEDIMIENTO/CONSULTA, `nombre`, `costo`, `porcentaje_cobertura`). CRUD + import en `/api/configuracion/aseguranzas/servicios`.
- `catalogo_procedimientos` con `requiere_quirofano` y `duracion_estimada_min` (`1800000000001-EnhanceCatalogoEstudiosProcedimientos.ts:41`); `catalogo_estudios` similar. CRUD en `/api/configuracion/catalogo-procedimientos` y `catalogo-estudios`.
- `/api/catalogo-servicios` resuelve servicios según la aseguradora del paciente.

### 2.5 Médicos y participantes
- `doctores` (usuario_id FK, `activo`, especialidad, honorarios). Admin: `/api/configuracion/doctores`.
- Participantes de cirugía: ver 2.1 (`agenda_cirugia_doctores`, ENUM fijo — sin catálogo de roles configurable).

### 2.6 Inventario / LIO
- `inventario_items` (dual LENTE_VISION/LENTE_INTRAOCULAR): marca, modelo, `tipo_lio`, `potencia_dioptrias`, `lote`, `fecha_caducidad`, `stock`, `estado` (DISPONIBLE/…/VENCIDO). Kardex `inventario_movimientos` (regla del proyecto: nunca UPDATE directo de stock).
- API: `/api/inventario` (CRUD), `/api/inventario/disponible` (GET disponibles por tipo), `/api/inventario/movimientos`.
- Lib: `src/lib/inventario.ts` — `consumirLIO()` (SALIDA_CIRUGIA, idempotente: no descuenta dos veces la misma cirugía+ítem) y `liberarLIO()` (DEVOLUCIÓN); conectados a POST/PATCH de agenda y al POST de `/api/cirugias` (red de seguridad tras el RPC). Seeds: `scripts/seed-inventario-io.{ts,sql}`.

### 2.7 Productividad / honorarios
- `eventos_honorario` (`1800000000022`): `origen_tipo` (CONSULTA/ESTUDIO/PROCEDIMIENTO/CITA/OPERACION), `doctor_id`, `rol`, `paciente_id`, `monto_base/devengado`, **`estado` (PENDIENTE/…)**, `periodo_id`, **`cirugia_id`**.
- `tarifas_doctor` (`1800000000020`): reglas por **doctor + tipo_concepto + concepto + rol** (PORCENTAJE) — sin dimensión origen.
- **`MotorDevengoService.generarDesdeCirugia()`** (`src/services/honorarios/MotorDevengoService.ts:133`): lee `agenda_cirugia_doctores`, resuelve `tarifas_doctor` (245-260) y crea eventos. **NO se invoca al crear cirugía**. Servicios asociados: CierrePeriodo, Reversion, Honorarios, MetricasDoctor (`src/services/honorarios/`).
- **NO existe `cirugia_productividad`** (vista base pendiente por participante al crear).

### 2.8 Historial / auditoría
- `consulta_historial` (`1800000000090-AddEstatusAndHistorialToConsultas.ts:39-53`): `consulta_id, tipo_evento (ENUM), payload JSONB, usuario_id` + RLS. Helper `registrarHistorial()` en `src/app/api/consultas/route.ts:96-109` y `src/app/api/consultas/[id]/route.ts:34-41`. Endpoint `/api/consultas/[id]/historial`. Timeline renderizada en el detalle de consulta.
- `bitacora_honorarios` (`1800000000025`): auditoría del módulo honorarios (tabla, registro_id, accion, valor_anterior/nuevo, usuario, ip).
- **NO existe `cirugia_historial`**: el cambio de estado de cirugía no genera historial.

### 2.9 Roles / permisos / RLS
- Roles: `admin | doctor | recepcionista` (`src/lib/supabase/server.ts:6`; enum en `usuarios`). "Doctor-jefe" = admin con `preferencias.modo_focus` (`src/lib/auth-helpers.ts`).
- `requireRole(user, allowedRoles)` en backend (`src/lib/supabase/server.ts:66-81`); RLS con policies por rol en todas las tablas creadas por migraciones.
- Admin de usuarios: `src/app/(dashboard)/configuracion/usuarios/` + `/api/configuracion/usuarios`.
- **NO existe** granularidad de permisos por acción (ver/subir/descargar/eliminar) — solo rol por endpoint.

### 2.10 Supabase Storage
- **Único uso existente**: bucket `avatars` (foto de perfil) **directo desde el cliente**: `src/app/(dashboard)/configuracion/page.tsx:130` (upload), `:139` (publicUrl), `:175` (remove). Columna `avatar_url` (`sql/add_avatar_url.sql`).
- **NO hay** helpers de storage en `lib/`, ni buckets/policies de storage en `src/migrations/` (grep `avatars|storage` → 0), ni flujo Frontend → API → Storage. **Toda la sección de archivos de cirugía es nueva** (bucket, policies, helpers server-side, endpoints).

### 2.11 Componentes UI / hooks reutilizables
- `src/components/ui/`: SearchInput, DataTable, Modal, SidebarPanel, FilterSelect, PageHeader, Pagination, StatusBadge, FormField, EmptyState, ConfirmModal, Toast, Avatar, Tabs, Skeleton, StatCard, BarChart, DonutChart.
- `src/components/inventario/`: LenteForm, BarcodeScanner, LabelScanner. Layout: Sidebar, TopBar, DoctorBottomNav.
- Hooks: `useFetch` (paginado), `useAutosave`, `useDebounce`. Utilidades: `cn()`, `money.ts`, `errorTranslations` (errores PG → ES).
- **NO existen**: componente de upload drag&drop, buscador de paciente con expediente, selector de participantes médicos.

### 2.12 Migraciones y seeds
- `src/migrations/` (34 archivos, verificado por glob), `scripts/run-migrations.js`, `scripts/seed-cirugias.ts`, `scripts/seed-catalogos.ts`, `scripts/seed-inventario-io.{ts,sql}`, `sql/` (verificación/seed: `agenda-cirugias.sql`, `seed-honorarios.sql`, `matriz-costos.sql`, etc.).

### 2.13 Documentación
- `docs/ERD.md` (modelo de datos), `docs/ARCHITECTURE.md`, `docs/AI_CONTEXT.md`, `docs/CODE_STANDARDS.md`, `docs/ROADMAP_V2.md`, `docs/HONORARIOS.md`, `docs/rules/00-12`, `docs/refactor/00-05 + decisions.md`, `docs/audit/FASE-1..6.md`, `docs/cirugias/fase-1-creacion-cirugia.md`.

## 3. Qué se reutiliza directamente (mapa área → activo existente)

| Área de Fase 1 | Activo existente reutilizable | IDs beneficiados |
|---|---|---|
| Cirugía (base) | `agenda_cirugias` + API `/api/agenda` + calendario `AgendaContent.tsx` + detalle `agenda/[id]/page.tsx` | OBJ, DAT, FLU, DET, EST (base) |
| Participantes | `agenda_cirugia_doctores` (cirugia_id, doctor_id, rol) | MED-002, MED-004, PRD |
| Origen | `aseguranzas` (+ `pacientes.aseguranza_id`, `coberturas_aseguranza`) | ORI-001..003, VAL-002 |
| Origen→Servicio | `aseguranza_servicios` + `/api/catalogo-servicios` | CAT-002, CAT-003, VAL-002/003 |
| Catálogo quirúrgico | `catalogo_procedimientos` (`requiere_quirofano`, `duracion_estimada_min`, `por_ojo`) | CAT-001, VAL-003, LIO-003, DAT-001 |
| LIO/Inventario | `inventario_items`, `/api/inventario/disponible`, `consumirLIO()/liberarLIO()`, kardex | LIO-001..003, VAL-006 |
| Productividad | `eventos_honorario` (estado PENDIENTE, `cirugia_id`), `tarifas_doctor`, `MotorDevengoService.generarDesdeCirugia()` | PRD-001..003, ARQ-001 |
| Historial | patrón `consulta_historial` + `registrarHistorial()` | AUD-001..005, ARQ-002, EST-003 |
| Permisos | `requireAuth/requireRole`, RLS por tabla, roles en `usuarios` | PER-001..004, VAL (autorización) |
| Atomicidad | patrón RPC `crear_consulta` (`1800000000160`) | VAL-008, FLU-002 |
| Storage | precedente bucket `avatars` (a sustituir por flujo vía API) | STO-001..003 |
| UI | componentes `ui/*`, hooks, `errorTranslations` | PAC, MED-001, ARC-001, DET |
| Consulta↔Cirugía | columna `consulta_id` ya existente | CON-001..003 |

## 4. Qué falta (brechas, por área de la especificación)

1. **Modelo de cirugía homologada**: `origen_id` (hoy `procedencia` TEXT), `servicio_id` de catálogo (hoy `procedimiento` texto libre, input en `AgendaContent.tsx:1130`), `codigo` CIR-NNNNN, `duracion_min` numérico, `recurso/quirofano_id`, valor `reagendada` en el ENUM SQL. (ORI-001, CAT-001/003, DAT-001, DET-001, EST-001.)
2. **Expediente**: sin tabla ni vista de expediente; el formulario debe exponer consultas/cirugías previas y "Ver expediente" sin duplicar datos. (PAC-002/004, EXP-001/002.)
3. **Paciente obligatorio**: `paciente_id` hoy opcional en Zod (`route.ts:9-10`) — la API acepta cirugías sin paciente. (PAC-003.)
4. **Ojo normalizado**: `ojo TEXT` libre → catálogo OD/OI/OU en UI y backend. (OJO-001/002.)
5. **Participantes en el flujo**: UI de Cirujano/Ayudante/Anestesiólogo/+ participante, catálogo `cat_roles_participante` (el ENUM `rol_cirugia` es fijo), obligatoriedad de cirujano. (MED-001/003/004.)
6. **Productividad al crear**: base pendiente por participante (tabla `cirugia_productividad` o conexión del devengo al POST) con reglas Origen+Servicio+Rol (tarifas sin dimensión origen). (PRD-001..003.)
7. **Archivos de apoyo (todo nuevo)**: tabla `cirugia_archivos`, bucket Storage + policies, helpers server-side, endpoints upload/ver/descargar/eliminar, UI drag&drop, `tipo_documento`, borrado lógico. (ARC-001..007, STO-001..003, AUD-001..003, VAL-007.)
8. **Historial de cirugía**: tabla `cirugia_historial` + acciones `CIRUGIA_CREADA/LIO_ASIGNADO/PARTICIPANTE_ASIGNADO/ARCHIVO_AGREGADO/ARCHIVO_ELIMINADO/ESTADO_CAMBIADO`. (AUD-004/005, EST-003, ARQ-002.)
9. **Conflictos de agenda**: no existe nada; hay que cruzar consultas (`hora_inicio/hora_fin`), cirugías (fecha/hora/duración) y recursos por médico y quirófano. (AGE-001..003, VAL-005.)
10. **Estados/transiciones**: máquina de estados con rechazo de inválidas y motivo. (EST-002/003.)
11. **Validaciones backend de creación**: paciente activo/con expediente, origen↔servicio, servicio quirúrgico, permiso de médicos, LIO disponible/no caducado, archivos, atomicidad. (VAL-001..008.)
12. **Detalle de cirugía (6 bloques)** y "+ Agregar archivo" en detalle. (DET-001..003, ARC-007.)
13. **Navegación consulta ↔ cirugía** y creación desde consulta con precarga. (CON-001..003.)
14. **Agenda unificada** (consulta·estudio·cirugía) — hoy el calendario solo lista cirugías. (ARQ-001, AGE-003.)
15. **Permisos granulares por acción** (ver/subir/descargar/eliminar) y su matriz. (PER-001..004.)
16. **Tests y guía de validación manual**: no hay framework de tests; CP-01..26 sin convertir en guía. (Cierre, ALC-01..16, FUE-001.)

## 5. Decisiones y supuestos

1. **"Origen" ≈ `aseguranzas` existente** (la especificación los equipara en ALC-04 "Origen / aseguradora"). `origen_id` será FK a `aseguranzas`; no se crea una tabla nueva de orígenes (cambio aditivo).
2. **Se extiende `agenda_cirugias`** como tabla de cirugías de Fase 1 (el Anexo A "cirugias" se materializa sobre ella). No se crea una tabla `cirugias` paralela (regla de no duplicación). La UI/API actuales de Agenda se conservan.
3. **`agenda_cirugia_doctores` se conserva** como tabla de participantes; para MED-003 se crea `cat_roles_participante` y se pasa del ENUM fijo manteniendo compatibilidad con el import y el devengo existentes.
4. **Columnas texto legado** (`procedencia`, `procedimiento`, `lio`, `marca_lio`, `nombre_paciente`, `expediente`, `tiempo_estimado`) no se eliminan en Fase 1; el nuevo flujo deja de escribirlas/las deprecia (cambios aditivos; FUE/borrados en fases posteriores).
5. **Productividad**: supuesto conservador = crear `cirugia_productividad` (Anexo A) como base "Pendiente" por participante al crear, y conectarla al devengo existente (`eventos_honorario` ya tiene `cirugia_id`). Alternativa (reutilizar solo `eventos_honorario`) se deja anotada para el implementador.
6. **Storage**: bucket nuevo `cirugias` con subida vía API (service role) — NO se replica el patrón cliente-directo de `avatars` (STO-003 lo exige así).
7. **Expediente en Fase 1** = relación con paciente/consultas (EXP-002), sin crear expediente general nuevo ni mezclar archivos (FUE-001, ARC-006).
8. **PER-002 "Según permiso"** (Recepción: ver/descargar/eliminar): se asume que exige un mecanismo granular además de los 3 roles fijos; decisión de implementación (por usuario o rol+permiso), alineado con PER-003.
9. **'reagendada'**: migración aditiva `ALTER TYPE agenda_cirugia_estado ADD VALUE` + ajuste de Zod (`route.ts:23` no lo incluye hoy).
10. Verificaciones de cierre tipo "no existe X" (FUE-001, ARC-006) se comprueban al final con CP-25; hoy se cumplen por ausencia total.
11. **Consumo de stock LIO**: se descuenta al **asignar** el LIO (alta o PATCH), no solo al completar; `consumirLIO` es idempotente para no duplicar con el RPC `crear_cirugia` ni con el paso a `completada`. Al reemplazar el LIO se libera el anterior con `liberarLIO`.

## 6. Orden recomendado de implementación (B1..B11)

| Bloque | Alcance | IDs principales que cubre | Depende de |
|---|---|---|---|
| **B1 — Migraciones de datos** | Extender `agenda_cirugias` (`origen_id`, `servicio_id`, `codigo`, `duracion_min`, `quirofano/recurso_id`), agregar `reagendada` al ENUM; crear `cat_roles_participante`, `cirugia_archivos`, `cirugia_historial`, `cirugia_productividad`; bucket Storage `cirugias` + policies; RLS. | ORI-001, CAT-003, ARC-004, EST-001, MED-003 (esquema), AUD-004/005 (esquema), PRD-003 (esquema) | — |
| **B2 — Helpers y servicios backend** | Helpers Storage server-side (upload/download/delete), generador de código CIR-NNNNN, CRUD de roles de participante, validadores de dominio reutilizables (paciente/origen/servicio/médico/LIO). | DET-001 (código), MED-003, VAL-001..004, VAL-006 | B1 |
| **B3 — Conflictos de agenda** | Servicio de detección de traslapes por médico y por recurso/quirófano cruzando consultas, estudios y cirugías (todas las fuentes). | AGE-001..003, VAL-005 (conflicto) | B1 |
| **B4 — API de creación transaccional** | POST de cirugía con VAL-001..008 (atomicidad estilo RPC `crear_consulta`), participantes + cirujano obligatorio, estatus inicial forzado, productividad base "Pendiente", historial inicial. | PAC-003, DAT-001/002, OJO-001 (backend), MED-004, PRD-001..003, FLU-002, VAL-001..008, OBJ-001 | B2, B3 |
| **B5 — API de archivos de apoyo** | Upload/listar/ver/descargar/eliminar con validación backend (extensión/MIME/tamaño/cantidad), borrado lógico + historial ARCHIVO_AGREGADO/ELIMINADO. | ARC-001..007 (backend), STO-001..003, AUD-001..003, VAL-007 | B2 |
| **B6 — Permisos de archivos** | Ver/subir/descargar/eliminar por acción y rol (403 en backend + matriz en UI). | PER-001..004 | B5 |
| **B7 — UI formulario de creación (6 bloques)** | Bloques Paciente / Datos / Asignación médica / Expediente / LIO / Archivos en el orden de FLU-001, reutilizando `ui/*`, `/api/pacientes`, `/api/inventario/disponible`. | OBJ-003, FLU-001, PAC-001..004, DAT-001, OJO-001/002, MED-001, EXP-001, LIO-001..003, ARC-001 (UI) | B4, B5 |
| **B8 — Navegación consulta ↔ cirugía** | "Crear cirugía" desde consulta con precarga (llena `consulta_id`), enlaces bidireccionales. | CON-001 (completo), CON-002, CON-003, EXP-002 | B4, B7 |
| **B9 — Estados y transiciones** | Máquina de estados (válidas/inválidas) + motivo + historial ESTADO_CAMBIADO, en backend y UI. | EST-002, EST-003 | B1, B4 |
| **B10 — Detalle y Agenda** | Detalle con 6 bloques + "+ Agregar archivo" (base: `agenda/[id]/page.tsx`); integración con Agenda/homologación; verificación ORI-002/003. | DET-001..003, ARC-007, ARQ-001/002, OBJ-002, FLU-002 | B4..B7 |
| **B11 — Verificación y cierre** | Instalar framework de tests (no hay ninguno), tests de validaciones/permisos/conflictos, guía de validación manual CP-01..26 con rutas/usuarios reales, regresión de Agenda/consultas/estudios, actualización de la matriz de auditoría con evidencias. | Transversal (todos), ALC-01..16, FUE-001 | B1..B10 |

**Riesgos señalados:** `AgendaContent.tsx` (~1200 líneas) concentra calendario + formulario + detalle: la intervención debe ser aditiva y protegida con regresión (CP-24). El ENUM `rol_cirugia` fijo y el trigger de porcentajes deben respetarse al introducir el catálogo de roles. Sin tests previos, B11 es obligatorio para poder cerrar la matriz con evidencia.
