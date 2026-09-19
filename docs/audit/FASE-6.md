# FASE 6 — PERFORMANCE

**Fecha:** 2026-09-18
**Commit:** `9619f5f`

## Métricas before/after

| Métrica | Antes | Después | Cambio |
|---------|-------|---------|--------|
| Build time | 56s | 70s | +14s (varianza del sistema) |
| First Load JS | 87.9 kB | 87.9 kB | 0 (cambios server-side) |
| Chunks | 31.9+53.6+2.33 kB | 31.9+53.6+2.33 kB | 0 |

**Nota**: Las optimizaciones son server-side (queries, imports, inserts). El bundle del cliente no cambió.

## Cambios aplicados

| # | Item | Cambio | Archivos |
|---|------|--------|----------|
| 1 | SELECT * → columnas explícitas | 4 archivos: consultas/[id], historial, periodos, liquidaciones/aprobar | 4 archivos |
| 2 | Dynamic imports ExcelJS | API routes agenda/import y servicios/import ahora usan `await import()` | 2 archivos |
| 3 | FX fallback marcado | `source: 'fallback'` → `'estimado'` + campo `warning` | `fx/usd-mxn/route.ts` |
| 4 | Agenda import batch inserts | One-by-one → `.insert(array)` para cirugías y aplazadas | `agenda/import/route.ts` |

## Beneficios esperados (server-side)

- **SELECT * → explícitas**: Menos bytes transferidos del DB, menos memoria en el ORM, menos datos expuestos en respuesta JSON
- **Dynamic ExcelJS**: El módulo `exceljs` (1.5MB) solo se carga cuando se llama POST /import, no al inicio del server
- **Batch inserts**: Import de 100 filas → 2 round-trips en vez de 100 (50x menos latencia)
- **FX fallback**: Sin cambio de performance, pero transparencia para el usuario

## Items de F6 NO aplicados (requieren más investigación)

| Item | Razón |
|------|-------|
| Agregaciones SQL/RPC en dashboard/pacientes/reportes | Los queries ya usan GROUP BY; las gráficas son server-side. Sin evidencia de que sea bottleneck actual. |
| Dividir consultas/nueva en componentes | Ya es 1463 líneas pero el build lo maneja. Dividirlo sin refactorizar todo el flujo es riesgoso. |
