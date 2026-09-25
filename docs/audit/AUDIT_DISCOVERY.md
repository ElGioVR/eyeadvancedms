# AUDIT_DISCOVERY.md — Fase 0: Descubrimiento
## Proyecto: EyeAdvanced Medical Solutions (eyeadvancedms)
**Fecha:** 2026-09-25 · **Ejecutado por:** OpenCode (auditor) · **Alcance:** estado real del workspace en disco, incluidos cambios sin commitear.

> Este documento es el mapa fiel del estado actual. No contiene propuestas de corrección (eso corresponde a `AUDIT_FINDINGS.md`, Fase 1).

---

## 1. Estado del repositorio (git)

- **HEAD:** `a8adeeb` feat(productividad): unificar honorarios y reportes en modulo admin
- **Últimos commits:** honorarios/reportes, consumo LIO al asignar, fix origen_id cirugías.
- **Cambios sin commitear:** **119 archivos modificados** (77 con diff: **+6,781 / −3,279 líneas**) + **~40 sin trackear** (nuevos).
- **Eliminados sin commitear:** 7 rutas de `api/productividad/` (`pagos/*`, `periodos/*`, `tarifas`) — reemplazadas por el nuevo sistema de honorarios simplificados.

### Distribución de cambios sin commitear por módulo (concentración de riesgo)

| Módulo | Archivos modificados | Nuevos (sin trackear) | Riesgo |
|---|---|---|---|
| **Productividad / Honorarios** | `api/productividad/route.ts`, `sync`, `MotorDevengoService` (743 líneas cambiadas), `types`, `resumen`, UI `page.tsx`, `FiltrosReporte` | **7 carpetas API nuevas** (`honorarios`, `metricas`, `mis-honorarios`, `reportes`, `config-periodo`, `honorarios/pagos`, `honorarios/pagar`), 8 componentes nuevos, `lib/productividad/{liga,metricas,periodo,resolver-fuente}.ts`, 5 tests nuevos (b17–b21) | **ALTO** — refactor end-to-end en progreso, rutas viejas eliminadas |
| **Agenda / Import masivo** | `api/agenda/import` (reescrito: CSV+XLSX+consultas), `agenda/route.ts`, `agenda/[id]`, `AgendaContent` (+280 líneas), `MobileCalendarView` | — | ALTO |
| **Dashboard** | `DashboardContent` (rediseño recharts + festivos), `loading.tsx`, `api/dashboard/charts` | `lib/festivos.ts` | MEDIO |
| **Configuración / Doctores** | `api/configuracion/doctores` (alias), `usuarios` (sin auto-crear doctor), `honorarios-settings`, form doctores | `sql/patch-doctores-alias.sql`, migración `1800000000290` | **ALTO** — renombre de columna **pendiente de aplicar en BD remota** |
| **Consultas** | `api/consultas` + `[id]` + `acciones` (estatus AGENDADA), UI nueva/detalle | — | MEDIO |
| **Inventario** | `api/inventario`, `inventario/disponible` (cascada de esquemas), `lib/inventario`, `LenteForm`, `LabelScanner`, `parseLabel` | `scripts/seed-inventory-new-schema.js`, `lib/{barcodeFile,preprocessImage}.ts` | MEDIO — dualidad de esquema legacy/nuevo sin resolver en BD |
| **Layout/UI global** | `Sidebar` (rediseño), `TopBar` (h-72, modo focus), `DoctorBottomNav` (modo focus), `PageHeader`, `Pagination`, `useUser` | — | BAJO |
| **Migraciones** | `1800000000180` (RPC LIO relajado) | `1800000000260/261/262/270/280/290` | ALTO — 6 migraciones nuevas sin aplicar en remoto |
| **Docs/SQL** | ERD, mapas de auditoría | 2 patches SQL, `docs/honorarios-simplificados.md` | — |

---

## 2. Inventario de arquitectura real

### 2.1 Patrón general
- **Next.js 14 App Router** + React 18. **No hay entidades TypeORM ni repositorios**: el acceso a datos es directo con `@supabase/supabase-js` (`getSupabaseAdmin()` con service-role en server, `createClient()` cookie-based en cliente). TypeORM se usa **solo** como runner de migraciones DDL (`src/migrations/*.ts`, 48 archivos, ejecutadas con `scripts/run-migrations.js`).
- **Validación** con `zod` en la mayoría de los endpoints.
- **Auth**: Supabase Auth (sesión por cookies vía `src/middleware.ts` → `updateSession`). `requireAuth()` / `requireRole([...])` en `src/lib/supabase/server.ts` por route handler.
- **RLS**: gestionado en Supabase; el backend usa mayormente service-role (bypassa RLS); RLS relevante para queries del cliente.

### 2.2 Inventario de API routes (56 archivos, ~105 handlers)

> `Auth` = requireAuth() · `Rol` = requireRole([...]) · `Val` = validación zod/safeParse del body

| # | Route | Métodos | Datos | Auth | Rol | Val |
|---|---|---|---|:-:|---|:-:|
| 1 | api/auth/login | POST | auth.signIn | ✗ | ✗ | ✓ |
| 2 | api/auth/logout | POST | auth.signOut | ✗ | ✗ | ✗ |
| 3 | api/usuarios/me | GET, PATCH | usuarios, doctores | ✓ | ✗ | ✗ (merge manual) |
| 4 | api/search | GET | pacientes, agenda_cirugias, consultas, inventario_items, doctores, cobros | ✓ | ✗ | ✗ |
| 5 | api/dashboard | GET | (lib/dashboard-data) | ✓ | ✗ | ✗ |
| 6 | api/dashboard/charts | GET | consultas, agenda_cirugias | ✓ | ✗ | ✗ |
| 7 | api/pacientes | GET, POST | pacientes | ✓ | ✓ admin/doctor/recep | ✓ |
| 8 | api/pacientes/[id] | GET | pacientes, consultas, cobros, aseguranzas | ✓ | ✓ | ✗ |
| 9 | api/pacientes/[id]/resumen | GET | pacientes, aseguranzas, consultas, agenda_cirugias | ✓ | ✗ | ✗ |
| 10 | api/consultas | GET, POST | consultas, consulta_conceptos, consulta_historial, consulta_doctor_costo, eventos_honorario (devengo), notificaciones | ✓ | ✓ | ✓ |
| 11 | api/consultas/[id] | GET, PATCH, DELETE | consultas, consulta_historial | ✓ | ✓ | ✓ |
| 12 | api/consultas/[id]/historial | GET, POST | consulta_historial, usuarios | ✓ | ✓ | ✗ (POST body raw) |
| 13 | api/consultas/[id]/acciones | POST | consultas, consulta_historial | ✓ | ✓ | ✓ |
| 14 | api/consultas/[id]/aseguradora | GET | consultas, aseguranzas, coberturas_aseguranza | ✓ | ✗ | ✗ |
| 15 | api/cirugias | GET, POST | agenda_cirugias; RPC `crear_cirugia` | ✓ | ✓ admin/recep (POST); GET sin rol | ✓ |
| 16 | api/cirugias/[id] | GET | agenda_cirugias + 5 tablas relacionadas | ✓ | ✗ | ✗ |
| 17 | api/cirugias/roles | GET | cat_roles_participante | ✓ | ✗ | ✗ |
| 18 | api/cirugias/recursos | GET | cat_recursos | ✓ | ✗ | ✗ |
| 19 | api/cirugias/[id]/archivos | GET, POST | cirugia_archivos, storage, cirugia_historial | ✓ | permisos granulares (`permisos_archivo`) | ✗ |
| 20 | api/cirugias/[id]/archivos/[archivoId] | GET, DELETE | ídem | ✓ | permisos granulares | ✗ |
| 21 | api/cirugias/[id]/productividad | GET | cirugia_productividad | ✓ | ✗ | ✗ |
| 22 | api/agenda | GET, POST | agenda_cirugias, consultas, doctores, notificaciones, pacientes | ✓ | ✓ (GET), ✓ admin/recep (POST) | ✓ |
| 23 | api/agenda/[id] | GET, PATCH, DELETE | agenda_cirugias, cirugia_historial, inventario (LIO) | ✓ | ✓ / ✓ admin (DELETE) | ✓ |
| 24 | api/agenda/import | POST | agenda_cirugias, agenda_cirugia_doctores, agenda_import_log, pacientes, consultas | ✓ | ✓ admin/recep | ✗ (parse manual) |
| 25 | api/agenda/notificaciones | GET | agenda_cirugias, notificaciones | Bearer CRON_SECRET | ✗ | ✗ |
| 26 | api/inventario | GET, POST, PATCH, DELETE | inventario_items, inventario_movimientos, notificaciones | ✓ | ✓ | ✓ |
| 27 | api/inventario/movimientos | GET, POST | inventario_movimientos, inventario_items | ✓ | ✓ | ✓ |
| 28 | api/inventario/disponible | GET | inventario_items | ✓ | ✗ | ✗ |
| 29 | api/notificaciones | GET, PATCH | notificaciones | ✓ | ✗ | ✓ |
| 30 | api/notificaciones/unread-count | GET | notificaciones | ✓ | ✗ | ✗ |
| 31 | api/notificaciones/preferencias | GET, PATCH | notificacion_preferencias | ✓ | ✗ | ✓ |
| 32 | api/configuracion/usuarios | GET, POST, PATCH, DELETE | usuarios (auth admin) | ✓ | ✓ admin (PATCH self-service) | ✓ |
| 33 | api/configuracion/doctores | GET, POST, PATCH, DELETE | doctores, usuarios | ✓ | ✓ | ✓ |
| 34 | api/configuracion/aseguranzas | GET, POST, PATCH, DELETE | aseguranzas | ✓ | ✓ | ✓ |
| 35 | api/configuracion/aseguranzas/servicios | GET, POST, PATCH | aseguranza_servicios | ✓ | ✓ admin (POST/PATCH); GET sin rol | ✓ |
| 36 | api/configuracion/aseguranzas/servicios/import | POST | aseguranza_servicios | ✓ | ✓ admin | ✗ (manual) |
| 37 | api/configuracion/coberturas-aseguranza | GET, POST, PUT, DELETE | coberturas_aseguranza | ✓ | ✓ admin (escritura) | ✓ |
| 38 | api/configuracion/proveedores | GET, POST, PATCH, DELETE | proveedores | ✓ | ✓ | ✓ |
| 39 | api/configuracion/categorias-lentes | GET, POST, PATCH, DELETE | categorias_lentes | ✓ | ✓ | ✓ |
| 40 | api/configuracion/matriz-costos | GET, POST, PUT, DELETE | matriz_costos | ✓ | ✓ admin (escritura) | ✓ |
| 41 | api/configuracion/catalogo-estudios | GET, POST, PUT, DELETE | catalogo_estudios | ✓ | ✓ admin (escritura) | ✓ |
| 42 | api/configuracion/catalogo-procedimientos | GET, POST, PUT, DELETE | catalogo_procedimientos | ✓ | ✓ admin (escritura) | ✓ |
| 43 | api/configuracion/honorarios-settings | GET, PUT | configuracion_sistema | ✓ | ✓ admin (PUT) | ✓ |
| 44 | api/catalogo-servicios | GET | aseguranza_servicios, pacientes | ✓ | ✗ | ✗ |
| 45 | api/calcular-costo | POST | matriz_costos, catálogos, coberturas | ✓ | ✗ | ✓ |
| 46 | api/fx/usd-mxn | GET | API externa | ✓ | ✗ | ✗ |
| 47 | api/productividad | GET | consultas, cirugia_productividad, consulta_conceptos, doctores | ✓ | ✓ admin | ✗ (params manuales) |
| 48 | api/productividad/sync | GET, POST | consultas, agenda_cirugias, eventos_honorario, sync_log | ✓ | ✓ admin | ✓ |
| 49 | api/productividad/honorarios | GET | (liga) eventos_honorario | ✓ | ✓ admin | ✗ |
| 50 | api/productividad/honorarios/[id] | PATCH | eventos_honorario | ✓ | ✓ admin | ✓ |
| 51 | api/productividad/honorarios/pagos | GET | eventos_honorario, doctores | ✓ | ✓ admin | ✗ |
| 52 | api/productividad/honorarios/pagar | POST | eventos_honorario (pagarHonorarios) | ✓ | ✓ admin | ✓ |
| 53 | api/productividad/honorarios/doctor/[doctorId] | GET | eventos_honorario | ✓ | ✓ admin | ✗ |
| 54 | api/productividad/metricas | GET | (metricas) + doctores | ✓ | ✓ admin | ✗ |
| 55 | api/productividad/reportes/cirugias | GET | agenda_cirugias + doctores | ✓ | ✓ admin | ✗ |
| 56 | api/productividad/mis-honorarios | GET | usuarios, doctores (panel doctor) | ✓ | ✗ (doctor self) | ✗ |
| 57 | api/productividad/config-periodo | GET, PUT | configuracion_sistema | ✓ | ✓ admin (PUT) | ✓ |

### 2.3 Migraciones (48) — resumen
- **Crean tablas (18):** notificaciones, matriz_costos, consulta_conceptos, cobro_detalles, concepto_doctores, agenda_cirugia_doctores, tarifas_doctor, periodos_pago, eventos_honorario, liquidaciones_doctor, ajustes_liquidacion, bitacora_honorarios, configuracion_sistema, inventario_items(+movimientos), consulta_historial, notificacion_preferencias, agenda_import_log, aseguranza_servicios, agenda_cirugias, cirugia_participantes/archivos/historial/productividad/cat_roles_participante/cat_recursos/reglas_productividad_cirugia, permisos_archivo, sync_log.
- **RPC (2):** `crear_consulta` (1800000000160, no usado por el código actual), `crear_cirugia` (1800000000180 — modificado sin commitear: LIO relajado + lio/marca_lio).
- **Pendientes en BD remota (sin commitear):** 260/261/262/270/280 (honorarios simplificados, deployed_to_performance, moneda, índice pagos, campos etiqueta LIO) y **290 (doctores.alias — crítico: el código ya selecciona `alias`)**.

---

## 3. ERD documentado vs modelo real

Fuente: `docs/ERD.md` (modificado sin commitear). Desalineaciones detectadas:

1. **`cobros`** — ERD la marca "eliminada (legacy)" pero se consulta activamente (`api/search/route.ts:136`, `api/pacientes/[id]/route.ts:42`) y alimenta métricas.
2. **`matriz_costos`** — ERD "eliminada"; CRUD completo activo (`api/configuracion/matriz-costos`, `api/calcular-costo`).
3. **`cobro_detalles`** — migración la crea, ERD "eliminada", sin uso en código.
4. **Tablas ausentes del ERD** (existen en migraciones + código): `consulta_doctor_costo`, `permisos_archivo`, `aseguranza_servicios`, `sync_log`, `cat_roles_participante`, `cat_recursos`, `reglas_productividad_cirugia`, `cirugia_participantes`, `cirugia_archivos`, `cirugia_historial`, `cirugia_productividad`.
5. **Tablas creadas sin endpoints dedicados:** `concepto_doctores`, `tarifas_doctor`, `liquidaciones_doctor`, `ajustes_liquidacion` (accesibles solo vía services/lib).
6. **Renombre pendiente de documentar en ERD:** `doctores.nombre_completo` → `alias` (+ `nombre`, `apellido`) — migración 290 sin commitear; ERD aún no lo refleja.

---

## 4. Flujos de negocio implementados (contrato que no debe romperse)

**Dashboard** (server component, solo lectura): `getDashboardData()` → stats operativos (pacientes, consultas hoy/semana, LIOs bajo stock), citas de hoy, gráficas recharts (estatus 30d, top procedimientos, agenda 7d). Sin efectos secundarios.

**Pacientes**: alta validada con zod (`api/pacientes POST`); historial consolida consultas + cobros + cirugías. Sin efectos secundarios.

**Consultas**: crear → insert directo + `consulta_conceptos` (precios resueltos server-side) + historial CREACION + devengo automático (`MotorDevengoService.generarDesdeConsulta`, configurable) + notificación al doctor. Estados nacen `AGENDADA` (cambio reciente, antes BORRADOR→PROCESADA) y pasan a COMPLETADA vía acciones; acciones (aplazar/reagendar/cancelar) validan conflictos de agenda y registran historial; cancelar cancela devengo.

**Cirugías**: crear → validación conflictos → RPC `crear_cirugia` (valida LIO disponible, descuenta stock, inserta participantes/productividad/historial, genera código CIR-NNNNN) + `consumirLIO` idempotente como red de seguridad + `calcularProductividadCirugia`. Estados con transiciones válidas + motivo + historial; cambio de LIO libera el anterior (`liberarLIO`); cancelar cancela devengo.

**Agenda**: timeline cirugías+consultas (doctor ve solo lo suyo; admin con modo_focus ve solo lo del doctor ligado — `isModoFocus` en `lib/auth-helpers`). Import masivo: cirugías (CSV/XLSX, hojas CIRUGIA/APLAZADOS, headers duplicados de segundo ojo, SUSPENDIDO→cancelada, sin fecha→aplazada, dedupe por nombre+fecha+hora, CSV de rechazados) y **consultas** (CSV "entradas y salidas": fecha larga EN, AM/PM, encoding Windows-1252, pacientes upsert por teléfono/nombre, doctores por alias, aseguranzas por nombre, nacen AGENDADA, dedupe por fecha+hora+paciente). Notificaciones cron 30-min protegidas por CRON_SECRET.

**Inventario**: CRUD items con folio LEN-YY-NNNNN, Kardex automático en cambios de stock, notificación stock bajo, `movimientos` valida stock suficiente, `disponible` solo LIOs activos/caducidad futura (cascada de esquemas legacy/nuevo).

**Cobros/Honorarios (refactor en progreso)**: devengo genera `eventos_honorario` desde consultas y cirugías (`resolver-fuente`), con tarifa_snapshot; honorarios simplificados: listar/editar monto/pagar (estado PAGADO) / pagos históricos / panel por doctor / mis-honorarios (doctor self-service, autoconsulta); sync admin recorre rangos y genera pendientes con `sync_log`; config de período en `configuracion_sistema`.

**Configuración**: usuarios (auth admin, soft-delete, protección último admin, **sin auto-crear doctor**); doctores (**alias** + nombre/apellido reales, vínculo usuario doctor|admin validado); aseguranzas + servicios con **import masivo** (plantilla CSV descargable, preview con conteos y detalle, duplicados omitidos o "limpiar todo y recargar"); coberturas, proveedores, categorías, matriz de costos, catálogos.

---

## 5. Stack y configuración

| Paquete | Versión |
|---|---|
| next | ^14.2.35 (App Router) |
| react / react-dom | ^18.2.0 |
| @supabase/supabase-js / ssr | ^2.45.0 / ^0.5.0 |
| zod | ^3.23.0 |
| exceljs | ^4.4.0 (dynamic import, server-only) |
| recharts | ^3.10.1 (dynamic ssr:false) |
| tesseract.js / html5-qrcode | ^7.0.0 / ^2.3.8 (dynamic ssr:false) |
| jspdf / jspdf-autotable | ^4.2.1 / ^5.0.8 — **sin imports detectados en código actual** (posible dependencia muerta) |
| date-fns, lucide-react, next-themes, clsx, tailwind-merge | — |
| TypeScript + ts-node + pg (migraciones) | — |

- **Tests:** 21 scripts `scripts/tests/b1..b22` ejecutados con `node` directo (`npm run test:bN`). **No existe jest/vitest ni runner de cobertura** → "cobertura 100%" del prompt requerirá introducir un runner (decisión pendiente, Fase 2).
- **next.config.js:** CSP en **modo Report-Only** (no enforcing), HSTS, X-Frame-Options DENY, Permissions-Policy cámara/micrófono bloqueados.
- **middleware.ts:** solo refresca sesión Supabase; **no hace RBAC de rutas**.
- **`(dashboard)/layout.tsx`:** layout client sin guard; solo `dashboard/page.tsx` y `agenda/page.tsx` tienen redirect server a `/login`. Las demás páginas client dependen del 401 de las APIs.
- **AGENTS.md (prioridad sobre preferencias):** no commits/push/PR; no escribir BD remota (migraciones solo en BD local desechable); cambios aditivos; español en UI; rendimiento p95 API (lectura ≤500ms, mutación ≤800ms); sin `SELECT *`; sin hidración SSR/CSR no determinista.
- **opencode.json:** git tag/merge/rebase/stash/reset-hard y `gh pr` bloqueados; `psql` requiere confirmación.

---

## 6. Confirmación solicitada (Fase 0 → foco de riesgo inmediato)

**Módulos con mayor concentración de cambios sin commitear** (foco de mayor riesgo):
1. **Productividad / Honorarios** — refactor end-to-end no commiteado (rutas eliminadas + 7 carpetas nuevas + motor de devengo reescrito + 5 tests nuevos).
2. **Configuración / Doctores** — renombre `alias` en código con **migración/patch pendiente de aplicar en la BD** (el código actual fallará contra la BD si el patch no se corre).
3. **Agenda / Import masivo** — reescritura completa (CSV + consultas) probada offline contra los archivos reales del usuario pero sin validación E2E en la app.
4. **Dashboard** — rediseño completo (recharts + festivos) y `lib/festivos.ts` nuevo.
5. **Consultas** — cambio de ciclo de vida de estatus (nacen AGENDADA) con impacto en reportes/filtros históricos.

**Fin de Fase 0.** Siguiente paso según el prompt: Fase 1 (AUDIT_FINDINGS.md) — pendiente de confirmación.
