# FASE 3 — MODELO ASEGURADORAS/CONSULTAS

**Fecha:** 2026-09-18
**Commits:** `98eba99`, `37ebd8c`

## Cambios aplicados

| # | Item | Cambio | Archivos |
|---|------|--------|----------|
| 1 | Tabla `aseguranza_servicios` | CREATE TABLE + RLS (read authenticated, write admin) + UNIQUE(aseguranza_id,tipo,nombre_norm) + CHECK 0..100 | Migración 150, DB |
| 2 | Catálogo 81 procedimientos oftalmológicos | Seed: 22 estudios, 6 consultas, 53 procedimientos — todos bajo ISSSTECALI | `scripts/setup-aseguranza-servicios.js` (ejecutado, borrado) |
| 3 | API CRUD `aseguranza_servicios` | GET (filtro por aseguradora/tipo/search), POST (admin), PATCH (admin) | `api/configuracion/aseguranzas/servicios/route.ts` |
| 4 | Endpoint catálogo por paciente | `GET /api/catalogo-servicios?paciente_id=X` — resuelve aseguranza del paciente, retorna servicios + fallback genérico | `api/catalogo-servicios/route.ts` |
| 5 | Precio resuelto en servidor | POST consultas: `resolverCostoServicio()` consulta `aseguranza_servicios` por nombre normalizado, fallback a costo client si no hay precio server | `api/consultas/route.ts` |
| 6 | `consultas.aseguranza_id` snapshot | INSERT incluye `aseguranza_id` del paciente; GET retorna el campo | `api/consultas/route.ts` |
| 7 | CSV de referencia guardado | `data/ENTRADA_Y_SALIDA_2026_SEPTIEMBRE.csv` — 31 consultas, 75+ procedimientos, 2 aseguradoras | `data/` |

## Perfil del CSV

- **31 consultas** reales (Septiembre 2026)
- **77 procedimientos** únicos extraídos como catálogo
- **Aseguradoras**: ISSSTECALI (20), JORNADA (8) + overflow: GNP, DOCTORALIA, BANCOS, PLAN SEGURO
- **Problemas**: encoding CP-1252, 9 filas con datos overflow, 6 columnas vacías

## Pendiente

| # | Item | Razón |
|---|------|-------|
| F3.3 | Matriz de consultas editable | Falta Excel de matriz con precios/coberturas por aseguradora |
| F3.5 | RPC `crear_consulta` atómica | Requiere función SQL en Supabase (no solo JS API); evaluar si el flujo actual (8 pasos secuenciales) cumple la atomicidad suficiente |
| F3.2 | UI import masivo en Configuración>Aseguranzas | Requiere componentes UI nuevos; la API POST/PATCH de servicios ya existe |

## Tablas nuevas

| Tabla | RLS | Policies |
|-------|-----|----------|
| `aseguranza_servicios` | ON | `aseguranza_servicios_read` (all authenticated), `aseguranza_servicios_admin_write` (admin only) |

## Nota: scripts eliminados

Los scripts `seed-aseguranza-servicios.js` y `setup-aseguranza-servicios.js` se ejecutaron y eliminaron. No deben volver a ejecutarse (idempotentes pero redundantes).
