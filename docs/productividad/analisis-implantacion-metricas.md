# Análisis de implementación — Rediseño de Productividad (métricas gráficas, embudo, detalle por doctor, historial de pagos)

> Auditoría del estado actual + plan de implementación. IDs de requisitos: **RM-** (rediseño/métricas), **RH-** (honorarios embudo), **RD-** (detalle doctor), **RP-** (historial de pagos).
> Fuente de verdad de la UI hoy: `src/app/(dashboard)/productividad/page.tsx`.

## Estado de implementación

**F0–F6 COMPLETADOS.** Evidencia: `npx tsc --noEmit` → 0; `npm run test:b15` → 14 OK; `test:b16` → 39 OK; `test:b17` → 23 OK; `test:b18` → 15 OK; `test:b14` → 11 OK; anti-regresión `test:b1` → 18 OK, `test:b8` → 95 OK; `npx next build` → exit 0 (`/productividad` 15.4 kB, First Load 186 kB, recharts fuera del bundle inicial); lint solo con el warning preexistente de `useEffect` en `page.tsx`; `rg` de hidratación limpio en `page.tsx` y en los componentes nuevos.

Desviaciones menores del plan (mismo alcance): las gráficas viven en `src/components/productividad/charts.tsx` (no `src/components/ui/charts/`); el embudo es `Embudo.tsx` y el historial `PagosHistorial.tsx` (no `HonorariosSeccion.tsx`); el detalle de doctor no usa endpoint nuevo (3 fetchs sobre APIs existentes); hay **5** botones de sección (Sync se conserva como quinta). Filas de evidencia y decisiones en `docs/productividad/auditoria.md` (filas RM-1…RP-1 + sección "Decisiones y supuestos (B18 — …)").

---

## 1. Auditoría del estado actual (evidencia)

### 1.1 Lo que YA existe y se reutiliza (aditivo, sin reescribir)

| # | Evidencia | Aprovechamiento |
|---|-----------|-----------------|
| A1 | `src/app/api/productividad/route.ts:11-13` — tabs del endpoint: `honorarios, por_doctor, cirugias, entradas_salidas, estudios, pagos, tarifas, periodos, sync` | `por_doctor` ya calcula agregado por doctor (`route.ts:328` `agruparPorDoctor`) → alimenta la gráfica de barras sin query nueva |
| A2 | `src/app/api/productividad/route.ts:330-345` — `totales` (monto, eventos, por_pagar, pagado, pendiente_config, cirugias_monto, entradas_costo/pagado, estudios_total/cantidad) | KPIs de la sección Métricas |
| A3 | `src/lib/productividad/liga.ts:234-333` — `listarHonorariosLiga({ doctor_id, desde/hasta, page, pageSize≤200 })` con `resumen` (`por_pagar, pagado, sin_monto, cancelado, total_filtrado, total_eventos`) | Base del **embudo** y de la sección Honorarios |
| A4 | `src/lib/productividad/resumen.ts:166-218` — `listarResumenHonorarios({desde, hasta, doctor_id})` devuelve TODOS los eventos del rango en una pasada | Serie diaria / por fuente / por estado = agregación **en memoria**, sin consultas extra |
| A5 | `src/lib/productividad/liga.ts:502-523` — `panelDoctorHonorarios(doctorId)` → liga del doctor (hasta 200 filas) + `GET .../honorarios/doctor/[doctorId]` (`route.ts:5-29`, admin-only) | Sección **Detalle por doctor** (honorarios) |
| A6 | `src/app/api/agenda/route.ts:41-59` — `GET /api/agenda?fechaDesde&fechaHasta&doctorId&estado&tipo&page&pageSize≤500` | **Agenda del doctor** sin endpoint nuevo |
| A7 | `src/lib/productividad/liga.ts:424-500` — `pagarHonorarios` escribe `eventos_honorario.fecha_pago`, `pagado_por` y bitácora `accion:'PAGO'` (mig `1800000000260` crea `fecha_pago DATE`; mig `1800000000025` crea `bitacora_honorarios`) | **Historial de pagos** = `eventos_honorario WHERE estado='PAGADO' AND fecha_pago IS NOT NULL` (+ bitácora opcional para usuario) |
| A8 | `src/lib/productividad/liga.ts:370-376` y `488-495` — bitácora registra `MONTO` y `PAGO` con `valor_anterior/valor_nuevo/usuario_id` | Trazabilidad en historial |
| A9 | `src/app/api/productividad/route.ts:385-441` — CSV `entradas_salidas` con encabezados del CSV fuente | Botón "Entradas y salidas (CSV)" ya funcional (page.tsx:674) |
| A10 | `src/components/ui/*` — `StatCard`, `EmptyState`, `Skeleton`, `Pagination`, `PageHeader`, `Tabs` | Se reutilizan; `Tabs` se deja de usar (ver RM-1) |

### 1.2 Lo que FALTA (gaps medidos contra el pedido)

| ID | Requisito pedido | Estado hoy | Gap |
|----|------------------|-----------|-----|
| **RM-1** | Quitar los tabs (Honorarios/Cirugías/Estudios/Sync) y poner **botones** de secciones | `page.tsx:38-46` define `TabId` + `TAB_LABELS`; `page.tsx:647-648` renderiza `<Tabs>` | Reemplazar por barra de botones/segmentos; mover `sync` de pestaña a modal (ya existe `SyncModal`, page.tsx:1081) |
| **RM-2** | **Métricas gráficas** de productividad (barras, pastel, etc.) con tamaño definido | No existe ninguna gráfica; **no hay librería de charts** en `package.json` (deps: supabase, date-fns, exceljs, jspdf, lucide-react, next, react, zod…) | Instalar librería + componente contenedor con tamaños + endpoint/agregación de series |
| **RM-3** | **Reportes de valor** (monto, por fuente, tendencia) | Solo tablas + cards numéricas | Series `serie_diaria`, `por_fuente`, `por_estado` a partir de `listarResumenHonorarios` (A4) |
| **RM-4** | **Entradas y salidas** como reporte | Listo (CSV, botón header) | Solo conservar el botón en la nueva barra |
| **RH-1** | Honorarios **como embudo** (filtro/funnel) | Liga con tabla y filtros de doctor/rango (`FiltrosReporte`), sin funnel ni filtros por fuente/estado | Agregar embudo visual (etapas) + chips de filtro (fuente, estado) + agrupación (día/doctor/fuente) |
| **RD-1** | **Detalle de cada doctor**: productividad por doctor **y su agenda** | Existe panel de honorarios por doctor (`panelDoctorHonorarios`, A5) pero sin métricas propias ni agenda | Componer 3 fetchs en paralelo: liga doctor (A5) + resumen con `doctor_id` (A4) + `GET /api/agenda?doctorId` (A6) |
| **RP-1** | **Historial de pagos de honorarios** | `eventos_honorario.fecha_pago/pagado_por` poblados (A7) pero **sin endpoint ni UI** de historial | Nuevo endpoint `GET /api/productividad/honorarios/pagos` + tabla + CSV |
| **RM-5** | Auditar cambios y mantener tests | `auditoria.md` filas D1…D14; tests b12–b17 | Filas nuevas RM/RH/RD/RP (PENDIENTE) + test `b18` + actualizar needles de `b15` (hoy exige `Tabs` y labels de pestañas) |

---

## 2. Arquitectura de UI propuesta (RM-1)

```
PageHeader: "Productividad"  [Entradas y salidas (CSV)] [Sync] [CSV]
FiltrosReporte (rango + doctor)                        ← se mantiene
────────────────────────────────────────────────────────
[ Métricas ] [ Honorarios ] [ Doctores ] [ Pagos ]     ← BOTONES (segmented), reemplazan <Tabs>
────────────────────────────────────────────────────────
  ├─ Métricas : KPIs + 4 gráficas (ver §3)
  ├─ Honorarios: embudo + chips de filtro + tabla con agrupación (ver §4)
  ├─ Doctores  : listado → detalle por doctor con pestañas internas (KPIs, gráficas, agenda) (ver §5)
  └─ Pagos     : historial de pagos paginado + CSV (ver §6)
```

- **Botones**: `div role="tablist"` con `button` segmentados (mismo estilo que el botón actual del header), sin dependencia de `Tabs`. Cada botón dispara su fetch con `AbortController` (igual que hoy, `page.tsx:595`).
- **Estado**: `vista: 'metricas' | 'honorarios' | 'doctores' | 'pagos'` reemplaza a `tab`; `descargarReporte(tipo)` conserva `ReporteCsvTab = ... | 'entradas_salidas'`.
- **Sync** deja de ser pestaña: solo botón del header → `SyncModal` (ya existente). La sección `cards` de sync desaparece (ya no hay rama `sync`).
- **Cirugías/Estudios**: dejan de ser pestañas y pasan a ser **gráficas/filtros dentro de Métricas** (barras por fuente incluyen CONSULTA/ESTUDIO/PROCEDIMIENTO/CIRUGIA) y sigue disponible su CSV por `tab=cirugias|estudios` (el endpoint no cambia).

**Conservador (decisión):** no se borran `Cirugías`/`Estudios` del endpoint ni sus CSV; solo dejan de ser pestañas de UI. Nada de tablas existentes se elimina salvo la navegación por pestañas.

---

## 3. Librería de gráficas + tamaños (RM-2/RM-3)

### 3.1 Elección: **recharts** (instalar)

| Opción | Pros | Contras | Veredicto |
|--------|------|---------|-----------|
| **recharts** (`npm i recharts`) | React declarativo, SVG (sin canvas → sin problemas de SSR), composición `BarChart/PieChart/LineChart/AreaChart` + `Tooltip/Legend`, amplio soporte Tailwind | Bundle ~50–90 kB gzip según imports; `ResponsiveContainer` mide el DOM → requiere montaje en cliente | **Elegida** |
| chart.js + react-chartjs-2 | Más ligero en canvas | API imperativa, canvas + SSR = gating obligatorio, menos flexible con Tailwind/dark mode | Descartada |
| SVG a mano (sin lib) | 0 kB | Contradice el pedido explícito de "agregar una librería" | Descartada |

**Regla de hidratación (AGENTS):** las gráficas se cargan con `next/dynamic` → `ssr: false`, dentro de `MetricasSeccion` que renderiza un placeholder determinista (mismo HTML en servidor y cliente) mientras monta. `ResponsiveContainer` nunca corre en el servidor → cero riesgo de hidratación y **coste de bundle 0** en las otras secciones.

### 3.2 Tamaños de gráficos (especificación)

| Gráfica | Tipo | Contenedor | Altura | Notas |
|---------|------|-----------|--------|-------|
| **Monto por doctor** | Barras horizontales (`layout="vertical"`) | Card `min-w-[360px]`, `w-full` | **360 px** desktop / **280 px** móvil (`h-[360px] max-lg:h-[280px]`) | Máx. 12 doctores; el resto → barra "Otros". Barras 24 px, `Bar dataKey="monto"` |
| **Composición por fuente** | Donut/Pastel (`Pie innerRadius=60`) | Card | **320×320 px** desktop / **260×260** móvil | `Legend` vertical a la derecha (lg) / abajo (sm) |
| **Estado de pago** | Barras apiladas o pie | Card | **280 px** | Series: PAGADO / POR_PAGAR / PENDIENTE_CONFIG / CANCELADO |
| **Tendencia diaria** | `AreaChart` (línea+relleno) | Card, `col-span-full` | **300 px** desktop / **240 px** móvil | X = fecha (`dd/mm`), Y = monto; `tick` cada 3–7 días según nº de puntos |
| **KPIs** | `StatCard` (ya existente) | Grid 4 cols | alto fijo de card (h-28 ya usado) | 4–8 tarjetas arriba de las gráficas |
| **Embudo honorarios** | Barras horizontales proporcionales | Card full-width | **240 px** (5 etapas × 36 px + gaps) | Sin librería: divs con `width: %` (barato y accesible) o `BarChart` horizontal |

- **Grid**: `grid grid-cols-1 lg:grid-cols-2 gap-4` (2×2 en desktop, 1 col en móvil); la tendencia ocupa `lg:col-span-2`.
- **Ancho mínimo legible**: 360 px por card → en pantallas < 768 px todo es 1 columna.
- **ResponsiveContainer**: `width="100%" height="100%"` sobre un padre con altura fija por clase Tailwind (nunca altura numérica condicional dentro del render).
- **Tooltips**: `formatter` con `formatCurrency` (`src/lib/money.ts`); `XAxis tickFormatter={formatFechaCsv}` (fechas ya formateadas, sin `new Date()`).
- **Dark mode**: `className="fill-gray-400"` en ejes/legend (patrón del repo).

---

## 4. Honorarios como embudo (RH-1)

**Interpretación (decisión anotable):** "embudo" = (a) visualización en embudo de las etapas del dinero + (b) filtros encadenados (rango → doctor → fuente → estado).

**Etapas del embudo** (todas calculables con `resumen` de `listarHonorariosLiga`, A3):

| Etapa | Fuente | Valor |
|-------|--------|-------|
| 1. Eventos del rango | `resumen.total_eventos` | conteo |
| 2. Con tarifa configurada | `total_eventos - sin_monto` | conteo |
| 3. Monto devengado | `resumen.total_filtrado` | dinero |
| 4. Por pagar | `resumen.por_pagar` | dinero |
| 5. Pagado | `resumen.pagado` | dinero (con % de conversión 5/3) |

- **UI**: barras proporcionales (ancho %) + chips de filtro: `Fuente (CIRUGIA/CONSULTA/ESTUDIO/PROCEDIMIENTO)` y `Estatus (POR_PAGAR/PAGADO/PENDIENTE_CONFIG/CANCELADO)` → filtran el mismo `items` en cliente (ya vienen paginados 50/página; los chips operan sobre la página + total del server cuando hay filtros de servidor).
- **Agrupación conmutable** de la tabla: `Por día | Por doctor | Por fuente` (agregación en memoria sobre `items`).
- **Endpoint**: se reutiliza `GET /api/productividad/honorarios` (parámetros ya soportados: `desde, hasta, doctor_id, page, pageSize`). **Sin endpoint nuevo.**
- **CSV**: `GET /api/productividad?tab=honorarios&formato=csv` ya existe (`route.ts:456-468`).

---

## 5. Detalle por doctor (RD-1)

**Pantalla**: al hacer clic en un doctor (fila de la tabla o de la gráfica de barras) → vista `doctores` con panel del doctor.

**Composición (3 fetchs en paralelo, sin endpoint nuevo):**

```ts
const [liga, resumen, agenda] = await Promise.all([
  fetch(`/api/productividad/honorarios?desde&hasta&doctor_id=${id}&pageSize=200`),   // A5/A3
  fetch(`/api/productividad?desde&hasta&doctor_id=${id}&tab=honorarios`),            // A4 → totales + por_doctor
  fetch(`/api/agenda?fechaDesde&fechaHasta&doctorId=${id}&pageSize=100`),            // A6
]);
```

**Contenido del panel:**
1. **KPIs doctor**: devengado, pagado, por pagar, sin monto, eventos, ticket promedio.
2. **Gráficas doctor**: barras por fuente + área de tendencia (mismas specs de §3, alturas 280 px).
3. **Agenda del doctor** (rango activo): `AgendaCalendario.tsx` — vista de mes (Lun–Dom) con puntos por tipo (cirugía/consulta/estudio), navegación limitada al rango activo y detalle del día seleccionado; `agenda` rows con `pageSize=100`; sin paginación en tabla.
4. **Honorarios del doctor**: tabla existente (`panelDoctorHonorarios`) con pagar/editar (ya implementado, `page.tsx:806-836`); en `DoctorDetalle.tsx` consume `GET /api/productividad/honorarios?doctor_id&page&pageSize=10` con `Pagination`, edita monto inline vía `PATCH /api/productividad/honorarios/{id}` (solo si no está PAGADO/CANCELADO) y paga vía `POST /api/productividad/honorarios/pagar` (por fila o selección múltiple), refrescando métricas y lista.
5. **Historial de pagos del doctor**: mismo endpoint de §6 con `doctor_id`.

---

## 6. Historial de pagos de honorarios (RP-1)

### 6.1 Nuevo endpoint

`GET /api/productividad/honorarios/pagos?desde=&hasta=&doctor_id=&page=&pageSize=`
- **Fuente**: `eventos_honorario` → `select('id, doctor_id, origen_tipo, fecha_servicio, monto_devengado, fecha_pago, pagado_por, estado')`, `eq('estado','PAGADO')`, `not('fecha_pago','is',null)`, `gte/lte('fecha_pago', …)`, `order('fecha_pago', desc)`, `range(from, to)` (pageSize ≤ 100).
- **En paralelo**: `doctores (id, nombre_completo).limit(500)` para el nombre; opcional `bitacora_honorarios` (`accion='PAGO'`) por `registro_id in (ids)` para `usuario_id`/`created_at` (1 query por página).
- **Select explícito** (nunca `*`), `Server-Timing`, admin-only (`requireRole(['admin'])`), rango válido vía `rangoPersonalizado`.
- **Presupuesto**: lectura ≤ 500 ms p95 (índice parcial + 2–3 queries en paralelo).

### 6.2 Migración (aditiva, NO ejecutar contra BD remota)

`src/migrations/1800000000270-AddIndiceHistorialPagos.ts`
```sql
CREATE INDEX IF NOT EXISTS idx_eventos_honorario_fecha_pago
  ON eventos_honorario (fecha_pago DESC) WHERE estado = 'PAGADO';
```
+ registro en `scripts/run-migrations.js` → `MIGRATION_ORDER` (270). `down`: `DROP INDEX`.

### 6.3 UI

Tabla: Fecha pago · Doctor · Fecha servicio · Fuente · Monto · Pagado por (usuario de bitácora si está) + filtros rango/doctor + paginación + botón CSV (mismo endpoint con `formato=csv`, cabecera `FECHA PAGO, DOCTOR, ...`).

---

## 7. Datos para las gráficas (RM-3) — sin queries extra

Nuevo agrupador en `src/lib/productividad/resumen.ts` (o `metricas.ts`) reutilizando `listarResumenHonorarios` (una sola query):

```ts
export function agregarMetricas(filas: ResumenFila[]) {
  return {
    kpis: { monto, eventos, pagado, por_pagar, sin_monto, cancelado, ticket_promedio },
    por_doctor:   [{ doctor_id, nombre, monto, eventos, pagado }],   // ya existe agruparPorDoctor
    por_fuente:   [{ fuente, monto, eventos }],                      // CONSULTA/ESTUDIO/PROCEDIMIENTO/CIRUGIA
    por_estado:   [{ estado_pago, monto, eventos }],
    serie_diaria: [{ fecha, monto, eventos }],                       // sorted asc
  };
}
```

Exponerlo como `GET /api/productividad/metricas?desde&hasta&doctor_id` (admin-only, `Server-Timing`). 1 query + agregación en memoria ⇒ bien dentro de 500 ms.

---

## 8. Plan por fases (orden de ejecución)

| Fase | Trabajo | Archivos | Evidencia de cierre |
|------|---------|----------|---------------------|
| **F0** | Instalar `recharts`; crear `src/components/ui/charts/*` (`ChartCard` con alturas §3, `ClientOnlyChart` con placeholder determinista) | `package.json`, `src/components/ui/charts/` | `npx tsc --noEmit` = 0 |
| **F1** | Endpoint `GET /api/productividad/metricas` + `agregarMetricas` + CSV opcional | `src/app/api/productividad/metricas/route.ts`, `src/lib/productividad/metricas.ts` | test con needles (admin 403, `Server-Timing`, claves de respuesta) |
| **F2** | UI: quitar `Tabs`, barra de botones de secciones, `vista` state; sección **Métricas** (KPIs + 4 gráficas con tamaños §3, `next/dynamic ssr:false`) | `page.tsx`, `src/components/productividad/MetricasSeccion.tsx` | `tsc` + lint + hidratación `rg` limpio |
| **F3** | **Honorarios embudo**: etapas + chips fuente/estado + agrupación día/doctor/fuente | `HonorariosSeccion.tsx` (o dentro de page) | screenshot/manual + test needles |
| **F4** | **Detalle doctor**: panel con KPIs + gráficas + agenda (3 fetchs) + honorarios | `src/components/productividad/DoctorDetalle.tsx` | needles + `tsc` |
| **F5** | **Historial de pagos**: endpoint + migración 270 + tabla + CSV | `honorarios/pagos/route.ts`, migración, UI | `test:b18` |
| **F6** | Tests y auditoría: `scripts/tests/b18-metricas-productividad.test.js`; actualizar `b15` (hoy exige `Tabs`, `'Honorarios'`, `'Cirugías'`, `'Estudios'`, `handleTab` → pasarán a needles de botones); filas RM/RH/RD/RP en `auditoria.md`; decisiones | `scripts/tests/*`, `docs/productividad/auditoria.md` | `npm run test:b14…b18` todos OK |

---

## 9. Riesgos y decisiones

1. **`Tabs` fuera**: `b15` y la matriz deben actualizarse en el mismo bloque (F6) para no dejar tests rotos. `b16` exige conservar las filas `D1, D2, D5, D10b, D11–D14, Endpoint /api/productividad, Hidratación SSR/CSR, Tests b12–b16` → **no se renombran**, solo se añaden filas nuevas.
2. **Hidratación**: gráficas solo con `dynamic(..., { ssr: false })` + placeholder determinista; prohibido `new Date()`/`window` en render (regla AGENTS). `rg` de auditoría al cerrar F2.
3. **Rendimiento**: métricas = 1 query; historial = 1 query paginada + 2 auxiliares en paralelo; agenda y liga ya existen. Todo con `Server-Timing` y select explícito; abort de fetchs obsoletos (patrón actual `AbortController`).
4. **Migración 270**: solo archivo + registro; **no ejecutar** contra BD remota/producción (regla dura).
5. **Sin reescritura**: se conservan `listarHonorariosLiga`, `listarResumenHonorarios`, `panelDoctorHonorarios`, `pagarHonorarios`, CSV de `entradas_salidas`/`cirugias`/`estudios`, `SyncModal` y `FiltrosReporte`.
6. **"Embudo"** interpretado como embudo de etapas + filtros encadenados (si se prefería otra acepción, ajustar en F3).
7. **Dependencia nueva**: `recharts` es la única; verificar tamaño real con `npx next build` tras F0 y revisar el warning de `lucide`/`next` si lo hubiera.

---

## 10. Criterios de aceptación (auditoría)

- RM-1: cero imports de `Tabs` en `page.tsx`; botones de 4 secciones + header con Sync/CSV/Entradas-salidas.
- RM-2/RM-3: 4 gráficas renderizando con las alturas de §3 (360/320/300/280) y datos reales del rango; sin errores de hidratación.
- RH-1: embudo con 5 etapas + chips de filtro + tabla agrupada.
- RD-1: detalle de doctor con KPIs, gráficas y agenda del rango activo.
- RP-1: historial paginado con fecha de pago y `Pagado por`, CSV, endpoint admin-only con `Server-Timing`.
- `npx tsc --noEmit` = 0; `next lint` sin errores; `test:b14…b18` OK; `rg` de hidratación limpio.
