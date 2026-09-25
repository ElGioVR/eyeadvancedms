# Auditoría — Módulo Productividad (solo admin)

Requisitos → estado → evidencia. Actualizar tras cada bloque.

**Fusión (D-FUS-01):** el módulo admin del antiguo "Analítico" y el motor de productividad de cirugía (`src/lib/productividad-cirugia.ts`) viven bajo un único namespace `productividad`:

- Lib: `src/lib/productividad/{index,cirugia,resumen}.ts` (cirugia re-exporta el motor existente para no romper `test:b8`).
- API cirugía: se mantiene `POST /api/cirugias` y `GET /api/cirugias/[id]/productividad` (contexto de una cirugía).
- API admin: `GET /api/productividad` (B14) — resumen + tabs.
- UI admin: `/(dashboard)/productividad` (B15) — pestañas unificadas.
- Migraciones/SQL/docs ya en `productividad` (B12).

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| D1 Secciones Honorarios / Por doctor / Cirugías / Entradas y salidas / Estudios | CUBIERTO | `src/app/api/productividad/route.ts` (tabs disponibles, carga solo el tab pedido); `src/app/(dashboard)/productividad/page.tsx:67-74` (`VISTAS`: Métricas / Honorarios / Doctores / Pagos / Sync en botones `role="tablist"` `:709-710`; sin `<Tabs>`; "Entradas y salidas" = botón de descarga CSV) |
| D2 "Entradas y salidas" = consultas, no inventario | CUBIERTO (API) | `src/app/api/productividad/route.ts` (tab `entradas_salidas` = joins `consultas`/`pacientes`/`doctores`, sin inventario) |
| D2b Reporte entradas/salidas tipo CSV de consultas (horarios, teléfono, sexo, nacimiento/edad, diagnóstico, visita, estudios 1-3, operador, procedimiento, aseguranza, método de pago, moneda) | CUBIERTO | API: `src/app/api/productividad/route.ts` (select de `hora_inicio/hora_fin/tipo_visita/diagnostico/estudio_1..3/procedimiento/metodo_pago/moneda` + join `pacientes(teléfono,sexo,fecha_nacimiento)` y `aseguranzas(nombre)`, helpers `calcularEdad`/`operadorDeConceptos`/`consolidarConsultas`, CSV con encabezados `FECHA…TIPO DE MONEDA` + FOLIO/PAGADO/SALDO/ESTATUS PAGO); UI: `src/app/(dashboard)/productividad/page.tsx` botón "Entradas y salidas (CSV)" en PageHeader → `descargarReporte('entradas_salidas')` (fetch `tab=entradas_salidas&formato=csv` + blob download). Sin pestaña ni tabla en la UI (sección eliminada: 24 columnas, cards y helpers `formatHora12`/`sexoLabel`) | Test: `npm run test:b14` → 11 OK; `npm run test:b15` → 9 OK (incluye botón CSV y aguja de "sin tabla"); `npx tsc --noEmit` → 0. |
| D5 OPERADOR = cantidad de procedimientos si >1 | CUBIERTO | `src/services/honorarios/MotorDevengoService.ts` (`cantidad`, `operador` en `tarifa_snapshot`); `src/app/api/consultas/route.ts` (Zod `cantidad` + `conceptosRows.cantidad`) |
| D6 `consulta_conceptos.cantidad` (existe) + `ojo` | CUBIERTO | `src/migrations/1800000000002-CreateConsultaConceptosTable.ts:15` (`cantidad`); `src/migrations/1800000000230-AddProductividadColumns.ts` (`ojo` + CHECK OD/OI/OU); `src/app/api/consultas/route.ts` (persiste `cantidad`/`ojo`) |
| D8 Honorario cirugía desde `cirugia_productividad` | CUBIERTO (schema/función) | `src/migrations/1800000000240-CreateProductividadHonorariosResumen.ts` (UNION `cirugia_productividad`) |
| D10 Anti-duplicado `consultas.consulta_origen_id` | CUBIERTO | `src/migrations/1800000000230-AddProductividadColumns.ts` (FK + índice); `src/app/api/consultas/route.ts` (Zod + insert + validación); `src/components/consultations/AgendarEstudioModal.tsx` (envía `consulta_origen_id`) |
| D10b `eventos_honorario.dedupe_key` índice único parcial | CUBIERTO | `src/migrations/1800000000230-AddProductividadColumns.ts` (índice); `src/services/honorarios/MotorDevengoService.ts:dedupe_key` en insert |
| D10c Excluir PROCEDIMIENTO si cirugía no cancelada en raíz | CUBIERTO (función) | `src/migrations/1800000000240-CreateProductividadHonorariosResumen.ts` (NOT EXISTS agenda_cirugias) |
| D11 FIJO = valor × cantidad; PORCENTAJE = precio × valor/100; sin tarifa → 0 + `sin_tarifa` | CUBIERTO | `src/services/honorarios/MotorDevengoService.ts:calcularMontoDevengado` (`sin_tarifa` → 0; `FIJO` → `valor * cantidad`; `PORCENTAJE` → `monto_base * valor/100` con base `precio * cantidad`) |
| D12 `PAGADO` en `estado_evento_honorario` | CUBIERTO | `src/migrations/1800000000230-AddProductividadColumns.ts` (reemplazo de tipo, patrón 1800000000170) |
| D13 Rangos `src/lib/rangos.ts` America/Tijuana | CUBIERTO | `src/lib/rangos.ts` (TIMEZONE_ADMIN `America/Tijuana`, `rangoMesActual`, `rangoPersonalizado`) |
| D14 CSV UTF-8 BOM, fechas dd/mm/aaaa | CUBIERTO | `src/lib/rangos.ts` (CSV_BOM `\uFEFF`, `formatFechaCsv` dd/mm/aaaa); `src/app/api/productividad/route.ts` (`csvFrom` + BOM) |
| Backfill `consulta_origen_id` idempotente por prefijo 8 chars | CUBIERTO | `sql/backfill-consulta-origen.sql` |
| Auditoría duplicados solo SELECT | CUBIERTO | `sql/auditoria-duplicados-honorarios.sql` |
| Función `productividad_honorarios_resumen(desde, hasta, doctor)` | CUBIERTO | `src/migrations/1800000000240-CreateProductividadHonorariosResumen.ts` |
| Migraciones registradas en `MIGRATION_ORDER` | CUBIERTO | `scripts/run-migrations.js` (210, 220, 230, 240) |
| Endpoint `/api/productividad` admin-only + Server-Timing | CUBIERTO | `src/app/api/productividad/route.ts:GET` (rol admin → 403, header `Server-Timing`, tabs `honorarios\|por_doctor\|cirugias\|entradas_salidas\|estudios`, `format=csv` con BOM) |
| Lib unificado `src/lib/productividad/` | CUBIERTO | `src/lib/productividad/index.ts`, `cirugia.ts`, `resumen.ts` |
| Motor cirugía re-export sin romper `test:b8` | CUBIERTO | `src/lib/productividad/cirugia.ts` → `@/lib/productividad-cirugia`; rutas API usan `@/lib/productividad` |
| Hidratación SSR/CSR | CUBIERTO | `src/app/(dashboard)/productividad/page.tsx` (fechas en `useEffect` vía `rangoMesActual`; `useState` determinista; sin `new Date`/`window`/`localStorage` en render); rg limpio en la página |
| Link Sidebar admin-only `/productividad` | CUBIERTO | `src/components/layout/Sidebar.tsx` (`adminOnly: true` + filtro `user?.rol === 'admin'`) |
| Tests b12–b16 | CUBIERTO | `npm run test:b12` → 25 OK; `test:b13` → 7 OK; `test:b14` → 11 OK; `test:b15` → 16 OK; `test:b16` → 39 OK; `npx tsc --noEmit` → 0 |
| Tests b17–b18 | CUBIERTO | `npm run test:b17` → 32 OK (liga honorarios + rendimiento); `npm run test:b18` → 17 OK (métricas/embudo/detalle doctor/historial de pagos); anti-regresión `test:b1` → 18 OK, `test:b8` → 95 OK |
| `npx next build` con el rediseño | CUBIERTO | corridas → exit 0, `Compiled successfully`; `/productividad` 15.6 kB (First Load 187 kB) con `recharts` fuera del bundle inicial (`dynamic ssr:false`); rutas nuevas registradas `/api/productividad/metricas` y `/api/productividad/honorarios/pagos`; solo warnings preexistentes (`<img>`, `useEffect`) |
| Liga honorarios (fases 2–6) | CUBIERTO | `src/lib/productividad/{liga,periodo,resolver-fuente}.ts`; `src/app/api/productividad/honorarios/**`; `src/migrations/1800000000260-AddHonorariosSimplificados.ts` (archivo); UI `productividad/page.tsx` sin Tarifas/Períodos (las secciones Pagos y agrupación "Por doctor" ahora existen por el rediseño B18); `npm run test:b17` → 32 OK |
| RM-1 Quitar pestañas y poner botones de secciones (Métricas / Honorarios / Doctores / Pagos) | CUBIERTO | `page.tsx:67-74` `VISTAS` (Métricas, Honorarios, Doctores, Pagos, Sync); `:709-710` contenedor `role="tablist"` con botones; `:474` guard de `vista` válida; sin import de `Tabs`; `npm run test:b15` → 16 OK (aguja `VISTAS` + aserción "sin componente Tabs") |
| RM-2 Métricas gráficas con librería (barras/pastel) y tamaños 360 / 320 / 300 / 280 px | CUBIERTO | `package.json` (`"recharts": "^3.10.1"`, única dependencia nueva); `src/components/productividad/charts.tsx:32-35` (`ALTURA_BARRAS_DOCTOR 'h-[360px] max-lg:h-[280px]'`, `ALTURA_DONUT 'h-[320px] max-lg:h-[260px]'`, `ALTURA_ESTADO 'h-[280px]'`, `ALTURA_SERIE 'h-[300px] max-lg:h-[240px]'`) + `ResponsiveContainer`; `page.tsx:44-59` `dynamic(... { ssr: false })` de `MetricasSeccion`/`DoctorDetalle`; `npm run test:b15` (aguja `recharts` + alturas) |
| RM-3 Reportes de valor (serie diaria, por fuente, por estado, ticket promedio) | CUBIERTO | `src/lib/productividad/metricas.ts` (`agregarMetricas` → `kpis.ticket_promedio:106`, `serie_diaria:39`, `por_doctor`, `por_fuente`, `por_estado`); endpoint nuevo `src/app/api/productividad/metricas/route.ts` (admin, `Server-Timing`, `formato=csv` + BOM, sin `select *`); UI `MetricasSeccion.tsx` (6 KPIs + 4 gráficas); `npm run test:b18` → 17 OK |
| RM-4 Reporte de entradas y salidas como CSV | CUBIERTO | `page.tsx:674` botón → `descargarReporte('entradas_salidas')`; API `route.ts:385-441` (CSV con encabezados del CSV fuente); `test:b14` → 11 OK, `test:b15` → 9 OK |
| RH-1 Honorarios como embudo (etapas devengado→pagado + chips fuente/estado + agrupación) | CUBIERTO | `src/components/productividad/Embudo.tsx:21-45` (etapas: total_eventos → con tarifa → total_filtrado/devengado → por_pagar → pagado, con % y color); chips fuente/estado en `page.tsx` + filtros server-side `src/app/api/productividad/honorarios/route.ts:19-23,35-37` (`fuente`, `estado`, `agrupar_por`) → `src/lib/productividad/liga.ts:239,353` (`agruparFilas` + `agrupado` en respuesta); select de agrupación `detalle|dia|doctor|fuente`; `npm run test:b15`/`b18` |
| RD-1 Detalle por doctor: productividad del doctor + su agenda | CUBIERTO | `src/components/productividad/DoctorDetalle.tsx` (cards de doctor → detalle; 3 fetchs en paralelo: `/api/productividad/metricas?doctor_id`, `/api/productividad/honorarios?doctor_id`, `:70` `fetch('/api/agenda?${agendaQs}')` con `fechaDesde|fechaHasta|doctorId|pageSize`); render en `page.tsx:779-782` (`vista === 'doctores'` + `dynamic ssr:false`); KPIs + 2 gráficas + tabla de agenda + honorarios del doctor |
| RP-1 Historial de pagos de honorarios (fecha de pago, pagado por, CSV) | CUBIERTO | Endpoint `src/app/api/productividad/honorarios/pagos/route.ts:41-47` (select explícito de columnas, `estado='PAGADO'`, `fecha_pago` en rango, joins `doctores`/`usuarios`, `Server-Timing`, CSV `historial-pagos-*`); UI `src/components/productividad/PagosHistorial.tsx` (paginado ≤100, 1000 filas CSV, columna descarga); índice parcial `src/migrations/1800000000270-AddIndiceHistorialPagos.ts` + registro en `scripts/run-migrations.js` (`test:b1` 18 OK, `test:b12` 25 OK); `test:b18` 17 OK |
| Rendimiento de la liga (página de honorarios ≤500 ms p95) | CUBIERTO | Medición con stub de Supabase que cuenta round-trips (25 ms simulados/consulta, harness en temp): **41 consultas/página → 8** (10 → 4 en la última página), 3 páginas **123 → 20 consultas** y **3848 → 434 ms**, con dump de `items`/`origen`/`resumen`/`total`/`page` **idéntico** antes/después; causa: N+1 de `resolverOrigenBatch` (34 queries) + consultas en serie + `agenda_cirugias` duplicada. `src/lib/productividad/liga.ts` (`Promise.all` de eventos/doctores/período y de agenda/consultas, origen solo para la página visible, fallback en lote, `agenda_cirugias` 1 vez), `panelDoctorHonorarios` en paralelo, `Server-Timing` con `auth;dur`/`db;dur` en ambas rutas (salida real `auth;dur=0.1, db;dur=37.3, honorarios;dur=37.7`); `npm run test:b17` → 32 OK |

## Decisiones y supuestos (D2b — reporte entradas/salidas)

1. **Fuente única = `consultas`** (columnas propias + joins a `pacientes` y `aseguranzas`); no se mezcla inventario (consistente con D2).
2. **Edad** se calcula en el servidor con `fecha_nacimiento` vs. `fecha` de la consulta (`calcularEdad`); fallback a `pacientes.edad` si falta nacimiento. No se usa `new Date()` en el cliente (hidratación).
3. **Operador** = suma de `cantidad` de conceptos `PROCEDIMIENTO` de la consulta; se muestra solo si >1 (regla D5), si no → `—`/vacío en CSV.
4. **Consulta con varios conceptos**: el embed `conceptos:consulta_conceptos(...)` duplica filas; `consolidarConsultas` las reagrupa por `id` para no duplicar el listado ni los totales.
5. **"MEDICO IC" del CSV fuente**: no existe columna equivalente en `consultas` (siempre vacía en el CSV); se omite en lugar de inventar datos.
6. **Horas**: se muestran como `H:MM AM/PM` en UI y `HH:MM` en CSV; egreso `hora_fin` puede ser NULL → `—`/vacío.
7. **Límite 200 filas** por tab se conserva (consistente con cirugías/estudios); con conceptos embebidos el límite aplica a filas crudas, por lo que el único consolidado puede ser <200 en casos extremos.
8. **La UI no muestra tabla ni pestaña de entradas/salidas**: el reporte se entrega solo como descarga CSV (botón PageHeader → `descargarReporte('entradas_salidas')` → `GET /api/productividad?tab=entradas_salidas&formato=csv`). Se eliminaron de `page.tsx` la rama `tab === 'entradas_salidas'` (tabla de 24 columnas + tfoot), las 4 cards, `EntradaFila`, `formatHora12`, `sexoLabel` y la entrada de `TAB_LABELS`; `ProductoTablas` ya no incluye `entradas_salidas` ni `entradas_costo/entradas_pagado` (la API sigue exponiéndolos para `test:b14`).
9. **Secciones del módulo**: *Pagos* = pestaña Honorarios (liga, editar monto, pagar seleccionados); *Métricas de productividad* = pestañas Cirugías y Estudios (cards + tablas) más el reporte CSV de consultas. El subtítulo del PageHeader ("Pagos de honorarios y métricas de productividad (consultas, cirugías y estudios)") lo declara; el CSV de entradas/salidas es la cuantificación de **consultas**.
10. **Filename del CSV**: `productividad-<tab>-<desde>_<hasta>.csv` (una sola vez; antes salía duplicado por un `a.download` mal construido). Vale para el CSV de la pestaña activa y para el de entradas/salidas.
11. **Pestaña Sync sin cards**: `cards` devuelve `[]` para `sync` (antes mostraba por herencia las métricas de Estudios, que no corresponden al log de sincronización).

## Decisiones y supuestos (B12–B13)

1. **`cantidad` ya existía** en `consulta_conceptos` (mig 1800000000002); la 230 solo garantiza `IF NOT EXISTS` y agrega `ojo`.
2. **Enum `PAGADO`** vía reemplazo de tipo (no `ALTER TYPE ADD VALUE`) por transaccionalidad, igual que `agenda_cirugia_estado` en 1800000000170. `down` revierte `PAGADO` → `DEVENGADO`.
3. **`estado_pago` del resumen**: `PENDIENTE_CONFIG` si `tarifa_snapshot.sin_tarifa` o productividad sin `regla_id`/`monto`; `PAGADO` si evento/productividad en `PAGADO`; `POR_PAGAR` en otro caso (incluye `LIQUIDADO` de eventos — cierre de período es flujo separado en `/mis-honorarios`).
4. **D10c en SQL** usa `COALESCE(consulta_origen_id, id)`; el backfill `sql/backfill-consulta-origen.sql` debe correr para que estudios derivados apunten a la raíz. Hasta entonces, el join puede no excluir si la cirugía está ligada a la raíz y el evento al estudio.
5. **`origen` del resumen**: prioriza `tarifa_snapshot.origen_nombre`, luego `consultas.aseguranza_id` vía concepto, luego `pacientes.aseguranza_id`. Productividad usa `cirugia_productividad.origen_id`.
6. **`fuente`**: `origen_tipo` del evento (`CONSULTA`/`ESTUDIO`/`PROCEDIMIENTO`/`CITA`/`OPERACION`) o literal `CIRUGIA` para productividad.
7. **`210` y `220`** existían como archivos sin estar en `MIGRATION_ORDER`; se registraron para que el runner sea completo (aditivo, no reescribe).
8. **No se ejecutan migraciones** contra BD remota; solo archivos + registro. Usuario aplica SQL donde corresponda.
9. **No se inventan columnas**: verificado con `schema-baseline.json` y rg en `src/migrations` (`consultas.aseguranza_id` en 1800000000140; baseline desactualizado omite esa columna pero el código y la migración la usan).

## Decisiones y supuestos (B13)

1. **`dedupe_key`** = `origen_tipo:origen_id:doctor_id:rol` (estable, no incluye fecha). El índice único parcial rechaza re-devengo sin `REVERSADO`; `23505` → `crearEvento` devuelve `false` sin throw.
2. **D11 FIJO** usa `valor * cantidad` (no `precio_aplicado`). **PORCENTAJE** usa `monto_base = precio_aplicado * cantidad` × `valor/100`. `sin_tarifa: true` en `tarifa_snapshot` fuerza monto 0 (alineado con `estado_pago = PENDIENTE_CONFIG` del resumen).
3. **D5 `operador`** solo se marca en `tarifa_snapshot` cuando `cantidad > 1`; display en B14/B15.
4. **`consulta_origen_id`** en `AgendarEstudioModal` apunta a la raíz (`consulta.id`); el `diagnostico` con prefijo 8 chars se conserva para el backfill idempotente.
5. **`generarDesdeCirugia`** ahora selecciona `servicio_id` y usa costo de `aseguranza_servicios` como base PORCENTAJE (antes usaba `valor` como base — incorrecto).
6. **`costo_total` de consulta** = Σ(`precio_aplicado * cantidad`) para cuadrar con conceptos multi-unidad.
7. **No se ejecutan migraciones** contra BD remota; el usuario aplica el SQL de 230/240/backfill donde corresponda.

## Decisiones y supuestos (B14)

1. **`rangos.ts`** calcula con `Intl.DateTimeFormat` sobre `America/Tijuana` (no `new Date()` local del servidor) para que mes actual y rangos personalizados coincidan con la clínica, no con la TZ de despliegue.
2. **`formatFechaCsv`** recibe fecha `YYYY-MM-DD` (o ISO) y produce `dd/mm/aaaa` con `Intl.DateTimeFormat('es-MX')` — estable, sin depender de locale del host.
3. **CSV**: siempre `\uFEFF` + CRLF; celdas escapadas (`"` → `""`); números sin formato de miles (para que Excel los lea como número).
4. **`tab`** controla qué se arma; sin `tab` devuelve `{ honorarios, por_doctor, cirugias, entradas_salidas, estudios }` (payload completo, pero la UI pedirá una a una para respetar ≤500 ms p95).
5. **`doctor_id`** opcional filtra el RPC y los joins; se valida con `isUuid` para evitar inyección en SQL.
6. **`format=csv`** se procesa en el mismo handler; descarga con `Content-Disposition: attachment; filename=productividad_<tab>_<desde>_<hasta>.csv`.
7. **Filas CSV** se tipan con `csvCell`/`toNumber` para que `tsc` no infiera `unknown[][]` desde Supabase (evita casts dispersos).

## Decisiones y supuestos (B15)

1. **El endpoint carga solo el tab pedido** (`cargarTabs(..., [tab])`) para acercarse a ≤500 ms p95; la UI pide un tab por request y cambia de pestaña re-fetch.
2. **Rango inicial**: `useState('')` + `rangoMesActual()` en `useEffect` (post-mount) — cumple hidratación; placeholders/Skeleton mientras `userLoading`.
3. **Gate admin en cliente**: `useUser` → no-admin ve `EmptyState` "Acceso restringido"; el endpoint ya devuelve 403 server-side.
4. **CSV desde UI**: fetch `formato=csv` + blob download (BOM y dd/mm/aaaa los pone el servidor).
5. **Sidebar**: item `adminOnly` se filtra solo cuando `user?.rol === 'admin'` (no aparece para otros roles).
6. **Abort**: cambios de tab/filtro abortan el fetch anterior (`AbortController`) para evitar respuestas fuera de orden.
7. **Fechas en tablas**: `formatFechaCsv` (parse determinista de string, sin `new Date` en JSX).

## Decisiones y supuestos (B18 — rediseño: botones, gráficos y pagos)

1. **5 botones de sección** (`VISTAS`: Métricas, Honorarios, Doctores, Pagos, Sync) reemplazan a `Tabs`; el estado se mantiene en `?vista=` y se valida contra `VISTAS` (`page.tsx:474`). **Supera la decisión 9 de D2b**: Pagos y Honorarios dejan de ser "la misma pestaña" y son secciones independientes.
2. **Cirugías y Estudios dejan de ser pestañas**: sus datos se ven en las gráficas de Métricas (agregados por fuente) y siguen disponibles en CSV (`tab=cirugias|estudios`). No se borró el endpoint ni sus queries (cambio aditivo, D2b intacto).
3. **Sync se conserva como 5ª sección** para no perder la bitácora de sincronizaciones (`SyncTab` renderizada con `vista === 'sync'`).
4. **recharts `^3.10.1`** única dependencia nueva; gráficas vía `next/dynamic` + `ssr:false` con placeholder determinista (hidratación); alturas/tamaños centralizados en `charts.tsx:32-35` (360 barras, 320 donut, 300 serie, 280 estado, con `max-lg`); grid 1→2 columnas y card mínima 360 px.
5. **`GET /api/productividad/metricas`** agrega en memoria sobre `listarResumenHonorarios` + `doctores` en paralelo (1–2 queries, sin `select *`, `Server-Timing`, `formato=csv` con BOM) — objetivo ≤500 ms p95.
6. **Historial de pagos filtra por `fecha_pago`** (no `fecha_servicio`) con `estado='PAGADO'` y `fecha_pago IS NOT NULL`; paginado ≤100 filas; CSV máximo 1000 filas (`historial-pagos-*.csv`); nombres vía joins `doctores`/`usuarios`.
7. **Migración 1800000000270** (índice parcial `WHERE estado='PAGADO'`) solo como archivo + registro en `MIGRATION_ORDER` (aditiva, con `down`); **no se ejecuta** contra BD remota.
8. **Embudo**: etapas (eventos del rango → con tarifa → devengado → por pagar → pagado) derivadas de `listarResumenHonorarios`; los filtros fuente/estado se aplican **antes** de calcular el resumen para que chips y totales coincidan; la agrupación `dia|doctor|fuente` es server-side (`agruparFilas`) para no transportar todas las filas.
9. **Detalle de doctor sin endpoint nuevo**: 3 fetchs paralelos (`metricas?doctor_id`, `honorarios?doctor_id`, `GET /api/agenda?fechaDesde&fechaHasta&doctorId`) reutilizando APIs existentes (`DoctorDetalle.tsx:70`).
10. **b15 actualizado** (9 → 14 OK): needles nuevos (`VISTAS`, botones, `recharts`, alturas, `Embudo`, `ssr: false`, endpoint de pagos); `removidas` deja de incluir `Pagos` y `Por doctor` (ahora son sección y opción de agrupación legítimas); se agregó `test:b18` (15 OK) como evidencia del rediseño. Las filas de IDs D1/D2b/D5/D10b/D11–D14 se conservaron sin renombrar.
11. **Alcance sin cambios**: agenda, consultas, estudios, liga de honorarios y `productividad-cirugia.ts` intactos (`test:b8` 95 OK, `test:b17` 23 OK).
12. **Paginación de honorarios de 10 en 10**: la liga pide `pageSize: '10'` (`page.tsx` en `fetchLiga`) y el panel del doctor acepta `?page=&pageSize=` (default 10 en `panelDoctorHonorarios`; antes 200 sin paginar). `Pagination` se muestra también con panel abierto (páginas del panel); al cerrar el panel se vuelve a la página 1 de la liga. Agujas en `test:b15` (`pageSize: '10'`, `pageSize=10`, `líneas del doctor`) y `test:b18` (default 10 del panel + ruta `page/pageSize`).

## Decisiones y supuestos (B18b � paginaci�n de honorarios: diagn�stico y endurecimiento)

1. **Reporte**: "no funciona la paginaci�n" (captura: `Mostrando 1�10 de 92 honorarios`, `1 / 10`, Siguiente sin efecto). Diagn�stico previo a los cambios: servidor correcto (pruebas con stub de `@/lib/supabase/*` ? `listarHonorariosLiga` y el route devuelven `page` 1/2 distinta, `total: 92`); bundle servido correcto (`/_next/static/chunks/app/(dashboard)/productividad/page.js` con `pageSize: "10"`, `cambiarPagina`, `onPageChange: cambiarPagina`); sin `<form>` ancestro; el service worker (`public/sw.js`) no cachea `/api/` (network-first). **No se pudo reproducir en navegador** (sin sesi�n admin y sin navegador automatizado): no se us� ninguna credencial ni se ley� `.env`.
2. **El indicador ahora usa el estado local** (`page={page}`) en vez del eco del servidor (`liga.page`): reacciona al instante al hacer clic y se reconcilia con la respuesta (`setPage(json.page)` solo si el request no fue abortado).
3. **`cambiarPagina` siempre hace fetch**: si `desde`/`hasta` estuvieran vac�os usa `liga.rango` y en �ltimo caso `rangoMesActual()` (antes `if (desde && hasta)` silenciaba el clic sin ning�n error visible); adem�s normaliza `p` con `Math.max(1, Math.floor(Number(pRaw) || 1))` para que un valor no num�rico no deje la paginaci�n en NaN.
4. **`Pagination` endurecido**: `page`/`pageSize`/`total`/`totalItems` se convierten a n�mero antes de `ceil` (a�sla la aritm�tica de NaN/cadenas); botones con `type="button"`; guion del rango corregido a `�` UTF-8 (hab�a mojibake `–` double-encoded, la captura lo mostraba como `1–10`); n�meros de p�gina visibles hasta 10 p�ginas (`totalPages <= 10`, `hidden md:flex`) y texto largo solo desde `lg` para no desbordar a 640�1024 px.
5. **`finally` de `fetchLiga`** solo limpia `loading` si su controller sigue siendo el vigente (`abortLigaRef.current === controller`): antes un request abortado pod�a dejar `loading = true` (footer inferior `!loading` oculto) sin aviso.
6. **Supuesto conservador**: si el reporte persiste tras recargar la pesta�a, la causa queda fuera del c�digo (bundle antiguo por HMR o error de red); se pedir� al usuario que verifique el contador tras un reload y la pesta�a Network. No se toc� el endpoint ni el `slice` server-side (`test:b17` ? 23 OK).
7. **Agujas nuevas** en `test:b15` (16 OK): `const rangoActivo = desde && hasta`, `if (abortLigaRef.current === controller) setLoading(false)`, `page={page}` y bloque de `Pagination.tsx` (`Math.max(1, Math.floor(Number(page) || 1))`, `totalPages <= 10`, `}�{`, `type="button"`) m�s `assertNotContains('–')`.

## Decisiones y supuestos (B19 � rendimiento de la liga de honorarios)

1. **Diagn�stico medido** con un stub de Supabase que instrumenta cada consulta y simula 25 ms por round-trip (harness en `%TEMP%\opencode\perf-liga.js`, fuera del repo): `listarHonorariosLiga` hac�a **41 consultas por p�gina** (34 de ellas N+1 en `consulta_conceptos`) ? 123 consultas y 3848 ms para 3 p�ginas. Tras la optimizaci�n: **8 / 8 / 4 consultas** y 434 ms (-89 %), con el dump de `items`, `origen`, `resumen`, `total` y `page` **byte-id�ntico** antes/despu�s (`perf-dump-before.json` vs `perf-dump-after.json`).
2. **Causas**: (a) `resolverOrigenBatch` se ejecutaba sobre todo el rango y hac�a 1 query por fila cuando la consulta no ten�a aseguranza; (b) 4�6 round-trips en serie (per�odo ? eventos ? doctores ? conceptos ? consultas ? agenda ? aseguranzas); (c) `agenda_cirugias` se consultaba dos veces con los mismos ids; (d) `panelDoctorHonorarios` esperaba el guard del doctor antes de arrancar la liga.
3. **Cambios (aditativos, contrato intacto)**: `liga.ts` paraleliza `Promise.all([eventos, doctores, per�odo])` y `Promise.all([cadenaAgenda, cadenaConsultas])`; `agenda_cirugias` se consulta 1 vez y se reutiliza para ambas pasadas; el fallback por concepto va en lote (`.in('id', pendientes)`); `origen` se resuelve **solo para la p�gina visible** (`resolverOrigenBatch(rawPagina)`) porque solo se muestra en `items` (no entra en `resumen`, `agrupado`, filtros ni paginaci�n).
4. **Equivalencia de `origen`**: `consultaIdsQuery` conserva exactamente el conjunto de ids que ve�a la query `consultas` antes (los ids que agrega `agenda_cirugias` no se a�aden), de modo que los valores de `origen` no cambian; verificado con el dump id�ntico.
5. **Servidor con etapas**: ambos endpoints de honorarios exponen `Server-Timing: auth;dur, db;dur, honorarios|panel;dur` (salida real: `auth;dur=0.1, db;dur=37.3, honorarios;dur=37.7`) para localizar el cuello restante. `auth` son 2 round-trips a Supabase (`getUser` + perfil) y no son paralelizables: la query del perfil necesita el id que devuelve la primera.
6. **Sin l�mite en la query principal**: se conserva el `slice` en memoria para no alterar `total`/`resumen`; si el rango crece, el costo pasa a ser 1 query grande, no N.
7. **Agujas nuevas en `test:b17`** (23 ? 32 OK): paralelismo, `resolverOrigenBatch(rawPagina)`, lote del fallback, ausencia de `.eq('id', eh.origen_id)` por fila, `agenda_cirugias` consultada 1 vez y `Server-Timing` con `auth;dur`/`db;dur` en ambas rutas.
8. **Supuesto**: la latencia real por consulta a Supabase es del orden de decenas de ms. Si en producci�n la p�gina sigue tardando >1 s, el siguiente paso es leer `Server-Timing` en Network antes de tocar m�s c�digo (no se agreg� cach� ni l�mite de filas para no arriesgar staleness).

## Decisiones y supuestos (B20 - Error 500 reportado tras los cambios de rendimiento)

1. **Reporte**: "dio error Error 500" (tras B19). El cliente muestra literalmente `Error 500` cuando la respuesta no trae campo `error` (`fetchLiga`: `body?.error || \`Error ${res.status}\`` con `res.json().catch(() => null)`), es decir una respuesta **HTML de Next**, no un `{error}` de nuestros `catch`.
2. **Diagnóstico reproducible sin sesión admin**: con `curl` (sin cookies) `honorarios`, `metricas` y `honorarios/doctor/*` devolvían **500 + HTML de 7.7 kB** mientras `config-periodo` devolvía **401 JSON correcto** → el fallo estaba *antes* del handler (carga del módulo/route), no en los datos ni en B19. El mensaje real estaba en `__NEXT_DATA__` de esa página: `Error: Cannot find module './9276.js'` con `Require stack: .next\server\webpack-runtime.js → .next\server\app\api\productividad\...`.
3. **Causa**: `npx next build` (evidencia de `test:b18`/build) se ejecutó **con `next dev` levantado**: `next build` limpia y sobrescribe `.next` con artefactos de producción, y el runtime de dev quedó apuntando a chunks inexistentes (`BUILD_ID` de producción conviviendo con `webpack-runtime.js` de dev). **No era el código**: `tsc --noEmit`, `eslint`, `test:b1`–`b18` y el propio `next build` estaban en verde.
4. **Fix y verificación**: detener el dev server, borrar `.next` y relanzar `next dev` (log en `%TEMP%\opencode\dev-out.log` / `dev-err.log`, fuera del repo). Después: `honorarios`, `metricas` y `honorarios/doctor/*` → **401 `{"error":"No autenticado"}`** (antes 500) y `/productividad` → **200** con compilación limpia.
5. **Regla operativa para próximas sesiones**: (a) **no ejecutar `next build` mientras `next dev` esté corriendo** — si hace falta evidencia de build, detener el dev primero; (b) si un endpoint devuelve 500 sin JSON, leer `message` de `__NEXT_DATA__` (o `dev-err.log`) **antes** de tocar código; (c) validar endpoints sin sesión con `curl`: el esperado es 401 JSON, no 500.
6. **Alcance**: no se modificó ninguna línea de `src/` en esta iteración; B19 (rendimiento) y B18b (paginación) siguen vigentes.

## B21 — Reportes con modal de rango de fechas + filtro de doctores

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| Reporte de cirugías en el módulo (columnas del CSV fuente `CIRUGIA.csv`) | CUBIERTO | Endpoint nuevo `src/app/api/productividad/reportes/cirugias/route.ts` (admin-only, `agenda_cirugias` paginada de 1000 en 1000 con tope de 10 000 filas, joins `doctores`/`pacientes`, encabezados `FECHA … NOTAS`, `sanitizeCsvCell` + `CSV_BOM`, `Server-Timing`); botón "Cirugías (CSV)" en `page.tsx` (`REPORTES`) |
| Todo reporte abre un modal con rango de fechas | CUBIERTO | `src/components/productividad/ModalRangoFechas.tsx` (desde/hasta, validación `desde <= hasta`, `Loader2` mientras genera); uso en `page.tsx` (`<ModalRangoFechas … onConfirm={confirmarReporte}>`) |
| Parámetro de doctor en el modal de reportes | CUBIERTO | `ModalRangoFechas.tsx` select **Doctor** (opción "Todos los doctores", valor inicial = filtro doctor activo) → `onConfirm(rango, doctorId)` → `page.tsx` `descargarReporte(tipo, rango, doctorSel)` agrega `doctor_id`; soportado por `/api/productividad?tab=…`, `/productividad/metricas`, `/productividad/honorarios/pagos` y `/productividad/reportes/cirugias` |
| "Entradas y salidas" abre el modal (igual que cirugías) | CUBIERTO | `page.tsx` botón → `setReporteModal('entradas_salidas')` → `descargarReporte('entradas_salidas', rango)` → `GET /api/productividad?tab=entradas_salidas&formato=csv` |
| Botón CSV = honorarios con su rango de fechas | CUBIERTO | `REPORTES` incluye `honorarios` (botón "Honorarios (CSV)") → modal → `descargarReporte('honorarios', rango)` → `GET /api/productividad?tab=honorarios&formato=csv`; se retiró `reporteDeVista()` |
| Quitar el botón Sync del header | CUBIERTO | `page.tsx` sin botón Sync ni `<SyncModal>` en el PageHeader; la sincronización sigue disponible en la pestaña `Sync` (`SyncTab`, `VISTAS`) |
| Filtro de doctores: al limpiar sí debe limpiar | CUBIERTO | `src/components/productividad/FiltrosReporte.tsx` (`applyPreset`/`handleDoctorChange` enviaban `doctor_id: id \|\| undefined`, y el padre interpretaba `undefined` = "conservar actual", por lo que la X nunca limpiaba) → ahora envían `doctor_id: id` (string vacío = todos); `page.tsx` `handleFilter` (`f.doctor_id !== undefined ? f.doctor_id : doctorId`) |
| Panel/_detalle del doctor con el rango seleccionado | CUBIERTO | `page.tsx` `fetchPanelDoctor(id, p, desde, hasta)` (`?pageSize=10&…&desde&hasta`), refetch al cambiar filtros con panel abierto (`handleFilter`) y al abrir/paginar/editar/pagar; `src/app/api/productividad/honorarios/doctor/[doctorId]/route.ts` (acepta `desde`/`hasta`, 400 si `desde > hasta`); `src/lib/productividad/liga.ts` `panelDoctorHonorarios(…, rango)` → `listarHonorariosLiga({desde, hasta})` (si no hay rango conserva `referencia`/período) |

**Verificación**: `npx tsc --noEmit` → 0; `npx next lint` sobre los archivos tocados → solo la advertencia preexistente de `cargarPreview`; `node scripts/tests/b12…b18` → 25/7/11/16/39/32/17 OK; el resto de suites `b1–b11` sin regresiones (los fallos de `b9`/`b10`/`b11` son preexistentes y ajenos: catálogo de servicios, `new Date(h.created_at)` y joins de `consultas`); `GET /api/productividad/reportes/cirugias` → 401 JSON sin sesión; `GET /productividad` → 200.

## Decisiones y supuestos (B21)

1. **Encabezados del reporte de cirugías = los del CSV fuente**, con una sola tanda `OJO/LIO/MARCA`: el CSV de origen trae dos tandas (segundo ojo) pero `agenda_cirugias` sólo almacena `ojo`/`lio`/`marca_lio` de un solo bloque y `api/agenda/import` sólo importa la primera; no se inventan columnas sin dato.
2. **FECHA y FECHA NAC. en ISO `AAAA-MM-DD`** (no `dd/mm/aaaa`): es el formato que espera `parseExcelDate` del import, de modo que el reporte puede re-importarse; `HORA CX` se emite tal cual (`HH:MM:SS`).
3. **Edad** calculada en servidor con `fecha_nacimiento` vs. `fecha` de la cirugía (mismo criterio que el reporte de entradas/salidas); sin `new Date()` en cliente.
4. **FECHA NAC./SEXO**: se toman de `pacientes` por `paciente_id`; como la importación masiva no liga `paciente_id`, se hace un respaldo por nombre exacto **sólo cuando es unívoco** (dos pacientes con el mismo nombre → celdas vacías en vez de datos de otra persona).
5. **CIRUJANO**: participantes de `agenda_cirugia_doctores` unidos con `/` (ej. `BAYARDO/IRINA`), con el doctor principal de `agenda_cirugias.doctor_id` primero; si no hay participantes se usa ese doctor.
6. **Se incluyen todos los estados** del rango (agendada/aplazada/completada/cancelada): el CSV fuente no tiene columna de estado y sí traía filas "SUSPENDIDO" en `NOTAS`; filtrarlos perdería filas que el usuario espera ver.
7. **Límite 10 000 filas** (10 páginas de 1000) para respetar el tope de rendimiento de la API; si el rango lo supera el CSV queda truncado y habría que paginar en el cliente (hoy ningún rango llega cerca).
8. **`doctor_id` del reporte de cirugías** filtra por `agenda_cirugias.doctor_id` (cirujano principal), no por participantes; el filtro de la página se envía igual que en los demás reportes.
9. **Agujas de test ajustadas al nuevo diseño** (justificado): `b15` usa `descargarReporte('entradas_salidas'` (ahora recibe el rango desde el modal) y agrega `ModalRangoFechas` + `/api/productividad/reportes/cirugias`; `b18` usa `conRango ? { desde, hasta } : undefined` para la ruta del panel del doctor. Ninguna aserción se debilitó.
10. **`SyncModal.tsx` queda sin uso** en `page.tsx` (se retiró el botón del header, como se pidió); el componente y la pestaña `Sync` siguen en el repo, y `src/components/productividad/SyncModal.tsx` no se borra para no destruir funcionalidad.
11. **CSV de métricas** deja de tener botón propio al reemplazar el genérico "CSV" por "Honorarios (CSV)"; el endpoint `GET /api/productividad/metricas?formato=csv` sigue disponible y `descargarReporte('metricas')` sigue implementado.


## B22 — `/mis-honorarios` (página del doctor, móvil)

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| El doctor puede abrir sus honorarios desde el celular (link `DoctorBottomNav` daba 404) | CUBIERTO | Página restaurada `src/app/(dashboard)/mis-honorarios/page.tsx` (existía y se borró en el commit `a8adeeb`; el link sigue en `src/components/layout/DoctorBottomNav.tsx:18` y `src/app/(dashboard)/dashboard/DashboardContent.tsx:193`) |
| Muestra la data del doctor logueado | CUBIERTO | `GET /api/productividad/mis-honorarios` (`src/app/api/productividad/mis-honorarios/route.ts`): `requireAuth()` → resuelve el `doctor_id` propio (usuario_id, con fallback por email + auto-vinculación igual que `/api/usuarios/me`) → `panelDoctorHonorarios(...)` (misma liga que el panel admin) y agrega `doctor_id`/`doctor_nombre`; **403** `{"error":"Tu usuario no está vinculado a un doctor"}` si no hay doctor |
| No filtra a otro doctor (IDOR) | CUBIERTO | El endpoint **no acepta** `doctor_id` de entrada: siempre usa el resuelto en servidor a partir de la sesión |
| Tarjetas de resumen y movimientos | CUBIERTO | `page.tsx` renderiza `resumen.por_pagar`, `resumen.pagado`, `resumen.total_filtrado`, `resumen.total_eventos`, aviso si `resumen.sin_monto > 0`, y lista `items` con `fuente`/`origen`/`fecha`/`monto`/`estado_pago` (badges Pagado/Por pagar/Sin tarifa/Cancelado) |
| Rango de fechas y periodo vigente | CUBIERTO | Sin `desde`/`hasta` el endpoint usa el periodo vigente (`panelDoctorHonorarios(..., undefined)` → `referencia = hoyTijuana()`); con ambos usa el rango (400 si `desde > hasta` o formato inválido); la página muestra "Mostrando dd/mm/aaaa — dd/mm/aaaa" desde la respuesta |
| Paginación y estados de carga/error | CUBIERTO | `Pagination` (15 por página), `Skeleton` en la primera carga, "Actualizando…" durante refetch y estado de error con "Reintentar"; reglas de hidratación respetadas (sin `new Date()`, `Math.random`, `localStorage`, `sessionStorage`, `matchMedia`) |

**Verificación**: `npx tsc --noEmit` → 0; `npx next lint` sobre los dos archivos nuevos → sin errores; `npm run test:b19` → **27 OK, 0 FAIL** (página, endpoint, links y smoke HTTP); `b12`–`b18` sin regresiones (25/7/11/16/39/32/17 OK); `GET /api/productividad/mis-honorarios` → **401 `{"error":"No autenticado"}`** sin sesión (antes: la ruta no existía); el artefacto `.next/server/app/(dashboard)/mis-honorarios/page.js` compila con el contenido nuevo. La validación con datos reales requiere sesión de doctor (no hay credenciales de prueba en el repo y las escrituras contra Supabase están prohibidas).

## Decisiones y supuestos (B22)

1. **Ruta nueva en vez de reabrir el borrado**: se restaura la página y se agrega `GET /api/productividad/mis-honorarios`; no se toca el RBAC de los endpoints admin (`/api/productividad/honorarios`, `/metricas` y `/honorarios/doctor/[doctorId]` siguen `['admin']`), para no ampliar el alcance del rol doctor sobre datos de otros doctores.
2. **No hay `doctor_id` en la query**: el servidor lo resuelve desde la sesión (misma lógica de `/api/usuarios/me`: `doctores.usuario_id`, fallback `ilike(email)` + auto-vinculación). Evita que un doctor pida otro doctor.
3. **Se reutiliza `panelDoctorHonorarios`** en vez de reimplementar la consulta: la página ve exactamente los mismos montos y estados que el panel del admin (mismo `eventos_honorario`, mismos filtros de periodo y `estado_pago`), lo que elimina el riesgo de discrepancias entre vistas.
4. **Periodo vigente por defecto** (igual que el panel admin): la página no inventa un rango propio; si el usuario marca desde/hasta se manda el rango completo y se valida `desde <= hasta` en servidor.
5. **`pageSize` por defecto 15** (máx 200), igual que el borrado original, para no traer listas largas en móvil.
6. **Se restaura el estilo oscuro/tarjetas** del original (era la UI del doctor) y se agregan `Pagination` y `Skeleton` reutilizando componentes del repo en lugar de markup nuevo.
7. **`test:b19` agregado** a `package.json` (aditivo): aserciones estáticas + smoke HTTP opcional (se omite si no hay servidor en 3000); ninguna suite previa se modificó.
8. **Fuera de alcance**: pagos/liquidaciones desde la vista del doctor (solo lectura), notificaciones y exportación; si el usuario no vinculado debe poder vincularse manualmente, eso ya existe en `/configuracion/doctores`.

## B22b — Inventario en el modo móvil del doctor

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| Inventario disponible en el modo móvil del doctor | CUBIERTO | `src/components/layout/DoctorBottomNav.tsx` suma la sección `{ icon: Package, href: '/inventario', label: 'Inventario' }` entre Agenda y Honorarios (antes: Inicio/Agenda/Honorarios/Perfil). En escritorio ya estaba en `src/components/layout/Sidebar.tsx:30` (sin `adminOnly`) |
| La página funciona con datos para el doctor | CUBIERTO | Todas las lecturas que usa `/inventario` permiten `['admin','doctor','recepcionista']`: `GET /api/inventario` (`:94`), `GET /api/inventario/movimientos` (kardex), `GET /api/configuracion/categorias-lentes` y `GET /api/configuracion/proveedores`; el escáner usa `GET /api/inventario?barcode=` y el selector LIO `/api/inventario/disponible` (solo `requireAuth`) |
| Sin botones que respondan 403 | CUBIERTO | `src/app/(dashboard)/inventario/page.tsx`: `const puedeEscribir = user?.rol === 'admin' \|\| user?.rol === 'recepcionista'` envuelve "Nuevo Ítem", "Ajustar Stock", "Editar" y "Eliminar"; siguen visibles "Kardex" y "ESCANEAR" (solo lectura). Coincide con el RBAC del endpoint (POST/PATCH/DELETE solo admin/recepcionista) |

**Verificación**: `npx tsc --noEmit` → 0; `npx next lint` sobre los dos archivos → sin errores; `npm run test:b20` → **19 OK, 0 FAIL**; `b7` (LIO) 85, `b19` 27, `b5` 87, `b6` 84 sin regresiones; `GET /api/inventario` sin sesión → **401**; el chunk compilado de `/inventario` contiene `puedeEscribir` (HMR OK).

## Decisiones y supuestos (B22b)

1. **No se tocó el RBAC**: el doctor conserva solo lectura (igual que antes); ocultar los botones es presentación, la protección sigue en el endpoint.
2. **Se muestra "ESCANEAR" al doctor**: la búsqueda por código es `GET` y resuelve existencia/stock, que es justamente lo que un doctor necesita en quirófano.
3. **Se muestra "Kardex" al doctor**: `GET /api/inventario/movimientos` ya lo permite.
4. **`/inventario/nueva` y `/inventario/[id]/editar` no se bloquean por ruta**: desde el doctor quedan ocultos los accesos; si alguien entra por URL directa, el 403 lo devuelve el endpoint al guardar.

## B23 — Escáner de etiquetas de LIO (OCR + código de barras)

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| Detectar si la etiqueta es LIO o de visión y autollenar sin mezclar campos | CUBIERTO | `src/lib/parseLabel.ts:429` `parseLensLabel(texto, opciones)` con `detectarTipo` (`:348`) y rama LIO separada; `src/components/inventario/LenteForm.tsx:117` `handleLabelParsed` ramifica en `LENTE_INTRAOCULAR` y en esa rama no escribe `grado_esferico/grado_cilindrico/eje/material` |
| Leer potencia, cilindro, las dos ADD, número de serie y caducidad | CUBIERTO | `parseLabel.ts:355` `findPotenciaLio` (excluye spans de `CYL`/`ADD`), `:382` `findCilindroLio`, `:393` `findAdds` (primera → intermedia, segunda → cercana), `:372` `findNumeroSerie`, `findExpiry` con fechas protegidas en `normalizeOcrText` (`:80`) |
| El número de serie nunca es el código de barras | CUBIERTO | `parseLabel.ts` ya no define `findBarcode`; `findBarcodeFromText` descarta la serie y las fechas; `codigo_barras` solo llega del decoder (`barcodeFile.ts`) o de una corrida impresa distinta al `SN`. Test `b21` (TEST 6/7) |
| Decodificar el código de barras de la misma foto | CUBIERTO | `src/lib/barcodeFile.ts` usa `Html5Qrcode.scanFileV2` sobre un contenedor temporal con timeout de 8 s y devuelve `null` ante cualquier fallo; `LabelScanner.tsx:133` corre OCR y decoder en `Promise.all` |
| Preprocesamiento antes del OCR | CUBIERTO | `src/lib/preprocessImage.ts`: reducción a ≤1600 px, escala de grises y autocontraste por percentiles 2/98; degrada al archivo original si algo falla |
| Formulario autollenado con campos nuevos | CUBIERTO | `LenteForm.tsx`: `LenteData` + `emptyForm` con `cilindro_lio`, `add_intermedia`, `add_cercana`, `numero_serie`, `codigo_barras_tipo`; inputs en "Especificaciones LIO" y "Tipo de codigo"; payload `:190`; opción `MULTIFOCAL_TORICA` en el select |
| Modelo de datos mínimo y aditivo | CUBIERTO | `src/migrations/1800000000280-AddLioLabelFields.ts` (5 columnas nuevas en NULL para registros previos + `ALTER TYPE tipo_lio ADD VALUE IF NOT EXISTS 'MULTIFOCAL_TORICA'`), registrada en `scripts/run-migrations.js:54`; `docs/ERD.md` actualizado. **NO ejecutada** (regla del proyecto) |
| API acepta y devuelve los campos | CUBIERTO | `src/app/api/inventario/route.ts:47` Zod `.strict()` con los 5 campos y el valor de enum nuevo; `insert`, allowlist de `PATCH` y `mapLente` propagan todos |
| Vista de resultado "Etiqueta detectada" | CUBIERTO | `LabelScanner.tsx:323` con badge "Lente intraocular", campos LIO y "Aplicar Datos al Formulario" (sigue sin guardar nada: sin `fetch` en el escáner) |
| Tests | CUBIERTO | `scripts/tests/b21-parse-label-lio.test.js` + `npm run test:b21` → **126 OK, 0 FAIL** (8 grupos funcionales con el parser real transpilado + assertions estáticas de la tubería) |

**Verificación**: `npx tsc --noEmit` → 0 errores; `npx next lint` → 0 errores (solo warnings preexistentes); suites b1–b8 y b12–b21 en verde (b9/b10/b11 conservan sus 2/1/5 fallos preexistentes); artefacto compilado `.next/server/app/api/inventario/route.js` contiene `MULTIFOCAL_TORICA` (HMR del dev server en 3000). No se corrió `next build` (dev server levantado, prohibido por AGENTS) y el chunk cliente de `/inventario/nueva` no pudo compilarse sin sesión autenticada (middleware responde 307): la validación de la UI se hizo con `tsc` + `eslint` + `b21`.

## Decisiones y supuestos (B23)

1. **`tipo_lio` gana un solo valor combinado (`MULTIFOCAL_TORICA`)**: el enum de 5 valores no podía representar una LIO multifocal y tórica a la vez (Clareon PanOptix Toric). Razón documentada en la migración y en `docs/ERD.md`. Torica pura → `TORICA`; EDOF + tórica se queda en `TORICA` (no existe valor combinado y no se añade otro).
2. **`codigo_barras` deja de reutilizar el `SN`**: antes `findBarcode` devolvía la serie; eso violaba la regla "serial ≠ barcode". Ahora el código viene del decoder o de una corrida impresa distinta a la serie.
3. **`modelo` = código de la etiqueta (p. ej. `CNATT2`)** y `modelo_fabricante` no se autollena: `modelo` es el campo obligatorio del proyecto; rellenar ambos duplicaría la misma información.
4. **Sin campos nuevos para visión**: `cilindro_lio/add_*/numero_serie/codigo_barras_tipo` solo viajan cuando `tipo = LENTE_INTRAOCULAR` (payload y Zod), para no mezclar modelos.
5. **Preprocesamiento modesto** (escala de grises + autocontraste + reducción): nada de binarización ni dependencias nuevas; si falla se usa el archivo original.
6. **El escáner no escribe**: sin `fetch` en `LabelScanner` (aserción en `b21`), sin tocar Kardex/stock/`consumirLIO`; solo rellena el formulario.
7. **La migración queda como archivo**: no se ejecuta contra ninguna BD; hay que aplicarla en local antes de guardar una LIO con el valor de enum nuevo o los campos nuevos.

## B24 — Alta de ítems en Inventario por el doctor (solo inventario)

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| El doctor puede crear (POST) ítems de inventario | CUBIERTO | `src/app/api/inventario/route.ts:159` `requireRole(auth.user, ['admin', 'doctor', 'recepcionista'])` en POST; PATCH/DELETE siguen restringidos a `['admin', 'recepcionista']` |
| UI muestra "Nuevo Ítem" al doctor, oculta Ajustar/Editar/Eliminar | CUBIERTO | `src/app/(dashboard)/inventario/page.tsx:267-273` `puedeCrear = puedeEscribir || user?.rol === 'doctor'`; Link a `/inventario/nueva` gateado por `puedeCrear`; botones de fila gateados por `puedeEscribir` |
| Tests actualizados | CUBIERTO | `scripts/tests/b20-inventario-doctor-movil.test.js`: aserciones POST permite doctor, PATCH/DELETE no; botón "Nuevo Ítem" usa `puedeCrear` |

**Verificación**: `npx tsc --noEmit` → 0; `npx next lint` → 0; `b20` 24 OK; `b5` 87, `b6` 84, `b7` 85, `b21` 126 OK; sin regresiones en b1–b8 y b12–b21.

## Decisiones y supuestos (B24)

1. **Solo creación (POST), no edición/borrado/ajuste**: el alcance pedido era "crear en el inventario para el doctor, solo inventario". PATCH/DELETE/ajuste de stock requieren más validaciones y seguimiento (Kardex, auditoría) y se mantienen en admin/recepcionista.
2. **No se toca el RBAC de otros módulos**: ni Agenda, ni Consultas, ni Honorarios, ni Productividad; el cambio es puntual a `POST /api/inventario`.
3. **`/inventario/nueva` ya era accesible por URL** (B22b decisión 4): el doctor puede entrar y guardar; el 403 de PATCH/DELETE lo devuelve el endpoint si intenta editar/borrar.
4. **El doctor ve ESCANEAR y Kardex (solo lectura) igual que antes** (B22b decisiones 2-3).