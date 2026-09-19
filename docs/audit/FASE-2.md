# FASE 2 — MIGRACIONES

**Fecha:** 2026-09-18
**Commit:** `0208a5c`

## Cambios aplicados

| # | Item | Cambio | Archivos |
|---|------|--------|----------|
| 1 | Schema baseline (read-only) | `pg_dump` vía query: 31 tablas, todas RLS ON | `docs/audit/schema-baseline.json` |
| 2 | run-migrations.js recreado | Eliminado por git filter-repo; reconstruido: `schema_migrations` table, 1 txn/migration, errores no tragan, modo range | `scripts/run-migrations.js` |
| 3 | Moneda homologada | `MXN - Peso Mexicano` → `MXN`; NULL → `MXN`; CHECK `IN ('MXN','USD')` | Migración 140 |
| 4 | CHECK constraints | `chk_estatus` (5 valores), `chk_estatus_pago` (2 valores), `chk_moneda` | Migración 140 |
| 5 | `consultas.aseguranza_id` | UUID FK → `aseguranzas(id)`, índice | Migración 140 |
| 6 | Folio UNIQUE | `uq_consultas_folio` + `seq_consulta_folio` SEQUENCE | Migración 140 |
| 7 | Índices de rendimiento | 6 índices: consultas(fecha), consultas(paciente_id), consultas(doctor_id, fecha), agenda_cirugias(fecha), agenda_cirugias(doctor_id, fecha), eventos_honorario(doctor_id, estado, fecha_servicio) | Migración 140 |

## Drift detectado

- `tipo_consulta`/`tipo_visita` son enums en BD pero TEXT en código — sin fix (requiere análisis de impacto)
- `estado_pago` varchar(20) coexiste con `estatus_pago` TEXT — limpiar en fase futura
- `aseguradora` varchar(100) coexiste con `aseguranza_id` UUID — migrar datos en F3

## Pendiente

- F2.2: Reescribir run-migrations.js completamente (tabla schema_migrations + modo --dry-run) — parcialmente hecho
- F2.3: Validar en BD limpia (staging) — requiere configurar staging branch
- Tablas sin migración TypeORM (usuarios, doctores, pacientes, consultas, aseguranzas, cobros, inventario_items, proveedores, categorias_lentes) — definidas por Supabase, no por code
