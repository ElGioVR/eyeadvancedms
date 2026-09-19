# FASE 3 — MODELO ASEGURADORAS/CONSULTAS (ACTUALIZADO)

**Fecha:** 2026-09-18
**Commits:** `98eba99`, `37ebd8c`, `28ed824`, `c09befb`

## Cambios aplicados

| # | Item | Cambio | Archivos |
|---|------|--------|----------|
| 1 | Tabla `aseguranza_servicios` | CREATE TABLE + RLS (read auth, write admin) + CHECK 0..100 + UNIQUE | Migración 150 |
| 2 | 81 procedimientos oftalmológicos | Seed: 22 estudios, 6 consultas, 53 procedimientos (ISSSTECALI) | DB seed |
| 3 | API CRUD aseguranza_servicios | GET (filtro), POST (admin), PATCH (admin) | `api/configuracion/aseguranzas/servicios/route.ts` |
| 4 | Catálogo por paciente | `GET /api/catalogo-servicios?paciente_id=X` — resuelve aseguranza + fallback | `api/catalogo-servicios/route.ts` |
| 5 | Precio server-side | POST consultas: `resolverCostoServicio()` desde aseguranza_servicios | `api/consultas/route.ts` |
| 6 | `consultas.aseguranza_id` | Snapshot en INSERT + retorno en GET | `api/consultas/route.ts` |
| 7 | RPC `crear_consulta` | SQL function atómica: consulta + conceptos + historial en 1 txn | Migración 160 |
| 8 | RPC `actualizar_consulta` | SQL function: update + historial automático | Migración 160 |
| 9 | Matriz de consultas editable | Página `/configuracion/aseguranzas/[id]/servicios` con edición inline | `[id]/servicios/page.tsx` |
| 10 | Import masivo servicios | `POST .../servicios/import` — Excel/CSV → preview → confirm → insert | `servicios/import/route.ts` |
| 11 | Import UI | Botón Importar en matriz con modal de preview/rechazados | `[id]/servicios/page.tsx` |
| 12 | CSV de referencia | `data/ENTRADA_Y_SALIDA_2026_SEPTIEMBRE.csv` guardado | `data/` |

## Archivos totales creados/modificados en F3

- `src/migrations/1800000000150-CreateAseguranzaServicios.ts`
- `src/migrations/1800000000160-CreateCrearConsultaRPC.ts`
- `src/app/api/configuracion/aseguranzas/servicios/route.ts`
- `src/app/api/configuracion/aseguranzas/servicios/import/route.ts`
- `src/app/api/catalogo-servicios/route.ts`
- `src/app/(dashboard)/configuracion/aseguranzas/page.tsx` (link servicios)
- `src/app/(dashboard)/configuracion/aseguranzas/[id]/servicios/page.tsx`
- `src/app/api/consultas/route.ts` (precio server + aseguranza_id)
- `scripts/run-migrations.js` (order update)
- `data/ENTRADA_Y_SALIDA_2026_SEPTIEMBRE.csv`

## Pendiente (requiere datos adicionales)

- F3.3 Matrix con precios: la matriz ahora es editable pero con costo=0 para todos los servicios. Para poblar precios reales necesitas el **Excel de procedimientos por aseguradora** con costo y % cobertura por servicio.
