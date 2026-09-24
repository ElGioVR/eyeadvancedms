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
| D1 Pestañas Honorarios / Por doctor / Cirugías / Entradas y salidas / Estudios | CUBIERTO | `src/app/api/productividad/route.ts` (5 tabs, carga solo el tab pedido); `src/app/(dashboard)/productividad/page.tsx` (`Tabs` + tablas por pestaña) |
| D2 "Entradas y salidas" = consultas, no inventario | CUBIERTO (API) | `src/app/api/productividad/route.ts` (tab `entradas_salidas` = joins `consultas`/`pacientes`/`doctores`, sin inventario) |
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
| Tests b12–b16 | CUBIERTO | `npm run test:b12` → 19 OK; `test:b13` → 5 OK; `test:b14` → 6 OK; `test:b15` → 7 OK; `test:b16` → 37 OK; anti-regresión `test:b1` → 18 OK, `test:b8` → 95 OK; `npx tsc --noEmit` → 0 |

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
