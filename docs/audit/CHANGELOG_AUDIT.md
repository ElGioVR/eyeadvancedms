# CHANGELOG_AUDIT.md — Cambios del ciclo de auditoría (Fase 3)
**Fecha:** 2026-09-25 · Sin commits (todo en working tree, según reglas AGENTS).

## Wave 0 — Infraestructura transversal
- `src/lib/supabase/handle-error.ts` (nuevo): log estructurado + traducción segura de errores de Supabase.
- `src/lib/text.ts` (nuevo): `normalizeNombre`, `parseCsv`, `formatBytes`, `getInitials` — consolida 9 implementaciones duplicadas.
- `src/app/error.tsx` + `src/app/(dashboard)/error.tsx` (nuevos): Error Boundary global con Reintentar (español).
- `package.json`: scripts `test:unit` y `test:cobertura` (node:test + cobertura v8, 19 unit tests); `tsx` agregado como devDependency (justificado: `ts-node/esm` falla en Node 22 con node:test).
- `api/usuarios/me` PATCH: whitelist de claves de `preferencias` (`modo_focus`, `theme`, `festividad`); try/catch en JSON; `errorTranslations`.
- `api/consultas/[id]/historial` POST: validación (tipo_evento ≤60, payload objeto), verificación de existencia de consulta, JSON inválido → 400.

## Wave 1 — Base de datos
- `src/migrations/1800000000300` + `sql/patch-indices-perf.sql`: índices `inventario_items(stock)`, compuestos `(fecha, deployed_to_performance)` en consultas y agenda_cirugias; DROP del RPC `crear_consulta` (código muerto).

## Wave 2 — Pacientes
- `api/pacientes/[id]/resumen` GET: `requireRole(['admin','doctor','recepcionista'])` (antes cualquier autenticado leía PII).
- **`PATCH /api/pacientes/[id]` nuevo** (edición de paciente con zod; antes no existía endpoint de edición).
- `GET /api/pacientes/[id]`: límite 200 consultas; join de doctor corregido a `alias` (se había escapado del renombre).
- `pacientes/page.tsx`: `AbortController` en fetch de aseguranzas; `window.location.reload()` → `refetch()`.

## Wave 3 — Consultas
- `resolverServicio` con cache + estudios/procedimientos resueltos en `Promise.all` (N+1 → paralelo con dedupe).
- `api/search`: escape de wildcards `%`/`_` y límite de 60 chars en `q`.
- `api/configuracion/aseguranzas/servicios` GET: escape de wildcards.
- `api/consultas/[id]` PATCH: `handleSupabaseError`.

## Wave 4 — Inventario / Archivos
- `api/cirugias/[id]/archivos/[archivoId]` GET: proyección sin `storage_path` en la respuesta; DELETE borra el binario del bucket (`eliminarArchivoDeStorage`) tras el soft-delete.
- `api/cirugias/roles` y `recursos`: `handleSupabaseError`.

## Wave 5 — Cobros / Productividad (críticos de performance)
- `api/productividad/sync` POST: precarga batch de eventos/doctor-cirugía (chunks de 500) — de 3-5 queries por fila a ~3 queries por lote completo.
- `lib/productividad/resumen.ts`: filtro de procedimientos cancelados en batch (2 queries) en vez de 2 por fila.
- `services/productividad/MotorDevengoService.ts` (`listarPendientesDespliegue`): precarga batch de conceptos, doctores de cirugía y eventos (de N+1 a ~5 queries por lote).
- `api/agenda/import`: límites 5MB/2000 filas, nombre de archivo sanitizado en `agenda_import_log`.

## Wave 6 — Reportes / Frontend
- recharts a **dynamic import** (`DashboardCharts.tsx` nuevo con skeleton): Dashboard y charts.tsx dejan de cargar ~200 kB estáticos.
- `api/search`: limit en query de cirugías por filtro de ojo.

## Wave 7 — Configuración
- `handleSupabaseError` en 15 catch sin log (Anexo A de FINDINGS) — todos los errores de BD ahora quedan en logs del server.
- `getInitials` local de doctores → `lib/text`.

## Wave 8 — Dashboard / Global
- Waterfalls SSR: `dashboard/page.tsx` y `agenda/page.tsx` paralelizan perfil+datos (3→2 round-trips).
- `next.config.js`: `Cache-Control: no-store` en APIs clínicas (PWA no cachea datos sensibles).
- `jspdf`/`jspdf-autotable` removidos de `package.json` (dependencia muerta, cero imports).
- Dashboard: enlace "Mis honorarios" para rol doctor (restaura navegación que validaba b19).

## Diferidos (requieren decisión o alcance aparte)
- `crearNotificacion` duplicado → unificar con `services/notificaciones` (firma distinta).
- Constante compartida `SELECT_CIRUGIA_LISTA` (3 SELECTs de agenda_cirugias).
- CSP enforcing (requiere mover scripts inline; riesgo medio).
- Rate-limit distribuido (requiere infra externa tipo Upstash).
- Virtualización de listas (no hay datasets suficientemente grandes aún).
