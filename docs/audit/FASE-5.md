# FASE 5 — COMENTARIOS / UX

**Fecha:** 2026-09-18
**Commit:** `a21ed16`

## Cambios aplicados

| # | Item | Cambio | Archivos |
|---|------|--------|----------|
| 1 | GET /api/consultas/[id] | Nuevo endpoint: patient + doctor + historial + conceptos + aseguradora + RBAC doctor | `api/consultas/[id]/route.ts` |
| 2 | Dashboard: quitar Cobros | Eliminado stat card "Cobros del Día" | `DashboardContent.tsx` |
| 3 | Dashboard: fechas Tijuana | `America/Tijuana` en greeting + date ranges server | `DashboardContent.tsx`, `dashboard-data.ts` |
| 4 | Agenda import: rechazados | Separados `yaExistentes` de `rechazados`; CSV con `fila_original` | `api/agenda/import/route.ts`, `AgendaContent.tsx` |
| 5 | Honorarios: % label | Etiqueta "Porcentaje (%)" cuando tipo=PORCENTAJE en tarifas | `honorarios/tarifas/page.tsx` |
| 6 | Honorarios: ConfirmModal | Reemplazado `window.confirm()` en cerrar período y aprobar liquidación | `periodos/page.tsx`, `liquidaciones/page.tsx` |
| 7 | Consultas editar: enums | Options usan valores DB (PRIMERA_VEZ, SUBSECUENTE, etc.) | `consultas/[id]/editar/page.tsx` |
| 8 | Consulta detail: resumen paciente | Patient summary con nombre, edad, sexo, teléfono + "mostrar más" toggle | `consultas/[id]/page.tsx` |
| 9 | Pacientes: Zod + errores inline | Validación cliente con errores visibles por campo (nombre, sexo, fecha, teléfono, email) | `pacientes/page.tsx` |
| 10 | Skeleton loading | 4 nuevos `loading.tsx`: honorarios, doctores/[id], tarifas, reportes | 4 archivos nuevos |

## Items pendientes (requieren más diseño)

| # | Item | Nota |
|---|------|------|
| - | Pacientes "Agendar" por fila con paciente prellenado | Requiere verificar que `/consultas/nueva?paciente=ID` abre con paciente cargado |
| - | Pacientes búsqueda/filtro por aseguradora en servidor | Ya existe filtro por nombre en cliente; server-side requiere cambio en useFetch |
| - | Consultas: alta rápida de paciente inline | Requiere componente modal nuevo |
| - | Bienvenida animada sin setTimeout | Requiere cambio en flow de login → dashboard |
