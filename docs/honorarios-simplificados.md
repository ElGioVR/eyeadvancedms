# Honorarios simplificados — Productividad como liga de honorarios

**Estado del run:** Fase 0 ✅ · GATE 1 aprobado · Fases 2–6 ✅ · **Mig 260 aplicada** · **Auditoría multi-doctor + flag deployed (mig 261, SQL pendiente en Supabase)** · **Modal Sync con preview progreso y resumen encontrados/ya en módulo** · **Fix moneda VARCHAR(3)→MXN (mig 262, SQL pendiente en Supabase)**  
**Fecha auditoría:** 2026-09-23 · **Actualización:** 2026-09-24  
**Fuente de verdad:** código + migraciones/`sql/` (docs solo como conflicto documentado).

---

## 1.1 Auditoría multi-doctor (2026-09-24) — por qué no aparecían honorarios

### Hallazgos (bug reales)

| # | Defecto | Evidencia | Efecto |
|---|---|---|---|
| **M1** | Cirugía **ligada** a consulta → `resolverFuenteHonorario` devuelve `crearLinea=false` y el motor **solo** incrementaba métricas; **no** creaba `OPERACION` para participantes | `MotorDevengoService.ts` (antes) early-return en `if (!fuente.crearLinea)` | **Multi-doctor en cirugía ligada: 0 líneas** |
| **M2** | Sync **skip** si existía **1** evento `OPERACION`/`CONSULTA` para la cirugía/consulta | `sync/route.ts` `if (eventos.length > 0)` | Doctores faltantes **nunca** se generaban al re-sincronizar |
| **M3** | Concepto de consulta con **doctor ≠ doctor consulta** no creaba línea (solo reporte, y el reporte no se mostraba) | `resolver-fuente.ts` `crearLinea=false` + `reportarDoctorDistinto` sin UI | Honorarios de doctor distinto **invisibles** |
| **M4** | Sin flag de despliegue | no existía columna | No se sabía qué consulta/cirugía ya estaba en productividad |

### Correcciones aplicadas

| Fix | Archivo | Comportamiento |
|---|---|---|
| **M1** | `MotorDevengoService.generarDesdeCirugia` | Cirugía ligada: métricas en consulta **+** línea `OPERACION` por **cada** participante (`agenda_cirugia_doctores` ∪ `cirugia_participantes` ∪ `doctor_id`) |
| **M2** | `sync/route.ts` | Chequeo **por doctor esperado**: solo skip si **todos** tienen evento vivo **y** `deployed_to_performance=true`; si falta alguno → `generarDesdeCirugia/Consulta` |
| **M3** | `resolver-fuente.ts` | Doctor distinto en concepto ligado → **`crearLinea=true`** + `reportarDoctorDistinto=true` (línea propia `ESTUDIO`/`PROCEDIMIENTO` con `origen_id=concepto.id`) |
| **M4** | mig **261** | `consultas.deployed_to_performance`, `consultas.deployed_at`, `agenda_cirugias.deployed_to_performance`, `agenda_cirugias.deployed_at` (+ índices parciales) |
| **M5** | Motor | `marcarDeployed(tabla,id)` al generar; `listarPendientesDespliegue()` para preview |
| **M6** | UI Sync | Modal `SyncModal` (preview por doctor → ejecutar → resumen *Encontrados* vs *Ya en módulo*) + pestaña Sync con `solo_pendientes=true` | `src/components/productividad/SyncModal.tsx`, pestaña `Sync` en `page.tsx` (el botón del header se retiró en B21; el modal quedó sin uso en la página) |
| **M7** | `eventos_honorario.moneda` era `VARCHAR(3)` con default `'PESOS'` (5) → Sync fallaba con *value too long for type character varying(3)* | `MotorDevengoService.crearEvento` insertaba `moneda: 'PESOS'` | Código normaliza a `MXN`/`USD` (`normalizarMoneda`); mig **262** ensancha a `VARCHAR(10)` en `eventos_honorario`, `tarifas_doctor`, `liquidaciones_doctor`, `reglas_productividad_cirugia` y homologa datos |
| **M8** | Roles de cirugía (`CIRUJANO_PRINCIPAL`, `INSTRUMENTISTA`, `CIRCULANTE` de enum `rol_cirugia`) no existen en enum `rol_doctor_concepto` → Sync fallaba *invalid input value for enum rol_doctor_concepto* | `crearEvento` pasaba `input.rol` crudo de `agenda_cirugia_doctores` | `normalizarRolEvento`: `CIRUJANO_PRINCIPAL→PRINCIPAL`, `INSTRUMENTISTA`/`CIRCULANTE→AYUDANTE`; válido=PRINCIPAL/AYUDANTE/ANESTESIOLOGO/INTERPRETACION/REFERIDOR |

### Flujo corregido (post-fix)

```
Consulta POST → generarDesdeConsulta
  → 1 línea CONSULTA (doctor principal)
  → por cada concepto con doctor ≠ principal: línea ESTUDIO/PROCEDIMIENTO (doctor ejecutor)
  → marcar consultas.deployed_to_performance = true

Cirugía (ligada o indep.) → Sync o generarDesdeCirugia
  → si ligada: incrementar cirugias_ligadas en línea CONSULTA
  → por cada participante: línea OPERACION (origen_id = cirugia_id)
  → marcar agenda_cirugias.deployed_to_performance = true

Sync POST (rango o solo_pendientes)
  → listarPendientesDespliegue → preview en UI
  → por doctor esperado: si falta evento → generar
  → respuesta: consultas/cirugias_desplegadas + doctores_sin_evento
```

### SQL mig 261 (aplicar a mano en Supabase, aditivo)

```sql
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS deployed_to_performance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS deployed_to_performance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_consultas_deployed
  ON consultas (deployed_to_performance, fecha)
  WHERE deployed_to_performance = false;

CREATE INDEX IF NOT EXISTS idx_agenda_cirugias_deployed
  ON agenda_cirugias (deployed_to_performance, fecha)
  WHERE deployed_to_performance = false;
```

### SQL mig 262 (aplicar a mano en Supabase — fix moneda VARCHAR(3); idempotente)

> Si una tabla no existe (p. ej. `reglas_productividad_cirugia` sin la mig 200), omite ese bloque.

```sql
ALTER TABLE eventos_honorario
  ALTER COLUMN moneda TYPE VARCHAR(10),
  ALTER COLUMN moneda SET DEFAULT 'MXN';
UPDATE eventos_honorario SET moneda = 'USD' WHERE moneda IS NULL OR moneda = '' OR moneda ILIKE '%USD%' OR moneda ILIKE '%DOLAR%';
UPDATE eventos_honorario SET moneda = 'MXN' WHERE moneda IS NULL OR moneda = '' OR moneda NOT IN ('MXN', 'USD');

ALTER TABLE tarifas_doctor
  ALTER COLUMN moneda TYPE VARCHAR(10),
  ALTER COLUMN moneda SET DEFAULT 'MXN';
UPDATE tarifas_doctor SET moneda = 'USD' WHERE moneda IS NULL OR moneda = '' OR moneda ILIKE '%USD%' OR moneda ILIKE '%DOLAR%';
UPDATE tarifas_doctor SET moneda = 'MXN' WHERE moneda IS NULL OR moneda = '' OR moneda NOT IN ('MXN', 'USD');

ALTER TABLE liquidaciones_doctor
  ALTER COLUMN moneda TYPE VARCHAR(10),
  ALTER COLUMN moneda SET DEFAULT 'MXN';
UPDATE liquidaciones_doctor SET moneda = 'USD' WHERE moneda IS NULL OR moneda = '' OR moneda ILIKE '%USD%' OR moneda ILIKE '%DOLAR%';
UPDATE liquidaciones_doctor SET moneda = 'MXN' WHERE moneda IS NULL OR moneda = '' OR moneda NOT IN ('MXN', 'USD');

-- Solo si existe la tabla (mig 200 aplicada):
-- ALTER TABLE reglas_productividad_cirugia
--   ALTER COLUMN moneda TYPE VARCHAR(10),
--   ALTER COLUMN moneda SET DEFAULT 'MXN';
-- UPDATE reglas_productividad_cirugia SET moneda = 'MXN' WHERE moneda IS NULL OR moneda = '' OR moneda NOT IN ('MXN', 'USD');
```

> **Nota:** el código ya inserta `MXN` (≤3 chars), así que el Sync funciona **sin** 262; la migración solo ensancha la columna y homologa defaults/`PESOS` históricos.

---

## 1. Resumen ejecutivo

Hoy el módulo **Productividad** (admin) mezcla dos fuentes de honorarios:

1. **`eventos_honorario`** — generados por `MotorDevengoService` al **crear consulta** (por cada `consulta_conceptos`) o por **Sync** para cirugías (`OPERACION`).
2. **`cirugia_productividad`** — filas “Pendiente” creadas por el RPC `crear_cirugia` al **programar** la cirugía (monto `NULL`, sin regla).

La liga de UI (`listarResumenHonorarios`) une ambas. Hay un **P0 de filtro de doctor** (las filas de `cirugia_productividad` no se filtran por doctor), montos en $0 por diseño actual (`PENDIENTE_CONFIG` / sin tarifa o sin regla), y **no existe pago por línea** (solo liquidaciones por período, actualmente sin filas). El módulo `/honorarios` y `/api/honorarios/*` **ya fueron eliminados**; no hay duplicación de ruta de UI.

**Propuesta:** unificar en una sola línea por `(fuente, fuente_id, doctor_id)` con monto manual, período global calculado al leer, pagos atómicos por fila o por doctor; deprecar `tarifas_doctor` / `periodos_pago` en UI sin dropear tablas.

---

## 2. Auditoría del flujo actual (Fase 0)

### 2.1 Matriz F1–F8

| Flujo | ¿Genera honorario? | ¿Cuándo / quién? | Clave de dedupe | ¿Aparece en Productividad? | Editar / cancelar / reagendar / eliminar |
|---|---|---|---|---|---|
| **F1** Consulta simple con doctor | **Sí** (vía concepto CONSULTA si resuelve servicio) | `POST /api/consultas` → `MotorDevengoService.generarDesdeConsulta` si `devengo_automatico !== false` (`src/app/api/consultas/route.ts:534-548`) | `dedupe_key` + índice único `(origen_tipo,origen_id,doctor_id,rol)` (`MotorDevengoService.ts:290`, `1800000000022:36`, `1800000000230:44`) | **Sí** si `fecha_servicio` en rango (`resumen.ts:166-173`) | **PATCH** consulta no regenera ni revierte eventos (`consultas/[id]/route.ts:273-312`); **DELETE** solo `estatus=CANCELADA`, **no** marca eventos (`:337-340`) |
| **F2** Consulta con estudios | **Sí**: 1 evento por concepto (doctor del concepto o de la consulta) | Mismo POST; conceptos insertados antes del motor (`consultas/route.ts:407-464`, `547`) | Por `(concepto.id, doctor)` | **Sí** (`fuente=ESTUDIO`) | Re-POST no duplica (23505 → `crearEvento` false). Cancelar consulta **no** pone eventos en cancelado |
| **F3** Consulta → cirugía ligada (`PENDIENTE_CIRUGIA`) | **Parcial**: motor de cirugía **no** se invoca al crear cirugía vía `crear_cirugia`; solo `cirugia_productividad` NULL | RPC `crear_cirugia` inserta `cirugia_productividad` (`1800000000180:235-242`); **no** llama a `generarDesdeCirugia` | Única por participante en `cirugia_productividad`; eventos `OPERACION` solo vía Sync | **Sí** como `fuente=CIRUGIA` (monto NULL → PENDIENTE_CONFIG) | Sync puede crear `OPERACION` además de la fila CP → **doble representación** posible. Cancelación agenda: resumen excluye `estado=cancelada` (`resumen.ts:256`) pero **no** revierte eventos |
| **F4** Estudio independiente | **No** como tal; si es concepto de una consulta derivada, genera evento ESTUDIO en esa consulta | Solo al crear consulta con conceptos | — | Aparece como ESTUDIO de la consulta raíz | — |
| **F5** Cirugía indep. 1 o N doctores | **No automática al crear**; sí al **Sync** (1 evento `OPERACION` por doctor en `agenda_cirugia_doctores` o fallback `doctor_id`) | `POST /api/productividad/sync` → `generarDesdeCirugia` (`sync/route.ts:72-97`, `MotorDevengoService.ts:221-280`) | `(OPERACION, cirugia_id, doctor, rol)` | Sync: eventos; creación nueva: solo `CIRUGIA` desde CP | Re-sync idempotente. **Nuevas cirugías** con `cirugia_participantes` **no** alimentan `generarDesdeCirugia` (lee solo `agenda_cirugia_doctores`) → Sync puede no ver participantes nuevos |
| **F6** Import CSV/XLSX agenda | **No** (solo `agenda_cirugia_doctores`) | `POST /api/agenda/import` inserta cirugías + doctores (`import/route.ts:314-335`); **sin** MotorDevengo | — | No hasta que Sync las procese | — |
| **F7** `estatus_pago` → `PAGADO` | **No dispara** honorarios | PATCH solo historial PAGADO (`consultas/[id]/route.ts:273-280`); motor solo en POST creación | — | — | Docs `AI_CONTEXT.md:35` dicen que PAGADO “dispara honorarios” → **conflicto doc-vs-código** |
| **F8** Cancelar/eliminar consulta, estudio, cirugía | **No** cambia estado de eventos a cancelado | DELETE consulta → soft CANCELADA; agenda cancelada solo LIO; DELETE agenda → hard delete (`agenda/[id]/route.ts:248-270`) | — | Eventos **siguen vivos** salvo exclusiones D10c en resumen para PROCEDIMIENTO+cirugía | **R4 incompleto**: no hay `CANCELADO` en enum ni hook de cancelación |

### 2.2 Puntos que insertan/actualizan `eventos_honorario`

| Punto | Operación | Evidencia |
|---|---|---|
| `MotorDevengoService.crearEvento` | INSERT | `src/services/productividad/MotorDevengoService.ts:286-316` |
| `POST /api/consultas` | llama `generarDesdeConsulta` | `src/app/api/consultas/route.ts:546-547` |
| `POST /api/productividad/sync` | llama `generarDesdeConsulta` / `generarDesdeCirugia` | `src/app/api/productividad/sync/route.ts:58-96` |
| `POST .../periodos/[id]/cerrar` | UPDATE estado → `LIQUIDADO` | `periodos/[id]/cerrar/route.ts:41-45` |
| RPC `generar_liquidaciones` (invocado) | no definido en `src/migrations/**` | solo `cerrar/route.ts:47` → **RPC ausente en repo** |
| Migración seed piloto | INSERT/DELETE histórico | `1800000000130:45-51` (solo seed) |
| Migración 230 down | UPDATE PAGADO→DEVENGADO | `1800000000230:71` |

**¿Más de una ruta crea la misma línea?** INSERT solo en `crearEvento` (centralizado). Doble vía = **misma función** desde consulta y Sync → seguro por índices únicos. **Riesgo real:** cirugía puede tener **evento OPERACION (Sync)** + **fila cirugia_productividad (RPC)** = dos representaciones en el resumen.

### 2.3 Preguntas de la captura / defects

| # | Pregunta | Hallazgo | Severidad |
|---|---|---|---|
| D1 | Filtro doctor “DRA MARTHA” muestra otros doctores | **P0 confirmado en servidor:** `listarResumenHonorarios` filtra `doctor_id` solo en `eventos_honorario` (`resumen.ts:173`); el bloque `cirugia_productividad` **no aplica** `doctor_id` (`resumen.ts:209-257`). Filas CIRUGIA de DR PILOTO / Luis Jarquin saltan el filtro. | **P0** |
| D2 | ¿Por qué solo `CIRUGIA`? | Resumen = eventos + CP. En rango “mes actual” hay eventos (21 en 2026-09) **y** 5 CP. La captura con 4 filas CIRUGIA+$0+PENDIENTE_CONFIG encaja con CP (fechas 21–30/09). Eventos con tarifa no salían en esa vista si el filtro/doctor o el rango los excluía; **no** es que consultas/estudios no generen: generan 90 eventos (3 CONSULTA, 60 ESTUDIO, 27 PROCEDIMIENTO). | **P1** (comportamiento dual confuso) |
| D3 | ¿Por qué `ORIGEN` vacío? | 90/90 eventos **sin** `tarifa_snapshot.origen_nombre` (snapshots viejos solo `{valor,tipo_calculo}`). Fallback en `resolverOrigenEventos` (`resumen.ts:20-157`) debe resolver vía consulta/paciente → aseguranzas. CP usa `agenda.origen_id`→aseguranzas (ISSSTECALI presente). Si la captura es previa al fix de resumen o el join falla, sale `—`. **Requiere re-verificación post-fix en sesión.** | **P1** |
| D4 | Honorario nace al programar o completar cirugía | **Al programar** (RPC crea CP al instante) y **al Sync** (eventos). **No** al completar. Fecha futura 24/09 y 30/09 en CP: coherente con programación anticipada. | Info / asunción R-momento |
| D5 | Dos filas 21/09 doctores distintos | Sí: cirugía `6f8a84f3…` con DR PILOTO + Luis Jarquin en `agenda_cirugia_doctores` / CP. | Info |
| D6 | Dos “disparadores” de honorarios | **Real:** (1) creación de consulta + `devengo_automatico`; (2) Sync. **No** existe disparador por `estatus_pago=PAGADO`. Docs `AI_CONTEXT.md:35-56` desactualizados. | **P1** doc |
| D7 | Qué es **Sync** | `POST/GET /api/productividad/sync`: por rango de fechas, para consultas PROCESADA/… sin eventos `CONSULTA` llama motor; para cirugías no canceladas sin `OPERACION` llama `generarDesdeCirugia`; log en `sync_log`. **No eliminar** (única vía de backfill/creación de cirugías). Bug: chequeo de existencia de consulta usa `origen_id = consulta.id` pero los eventos de consulta usan `origen_id = concepto.id` → **siempre reintenta** (idempotente por índice, pero ineficiente y engañoso en contadores). | **P1** |
| D8 | Pestaña Sync | UI `page.tsx:940-943` → `SyncTab`; conservar. | — |

### 2.4 Consumidores de `tarifas_doctor` / `periodos_pago` / `liquidaciones_doctor`

| Tabla | Consumidores en `src/` | Fuera de Productividad |
|---|---|---|
| `tarifas_doctor` | `MotorDevengoService.resolverTarifa` (`:353,:368`); `GET/POST /api/productividad/tarifas` | **No** en Dashboard/`dashboard-data`/Reportes/`mis-honorarios` (usa `panelDoctorHonorarios`, solo lectura de `eventos_honorario`) |
| `periodos_pago` | `resolverPeriodo` (`:320`); API `periodos` + `cerrar` | FK desde `eventos_honorario.periodo_id` y `liquidaciones_doctor` |
| `liquidaciones_doctor` | API `pagos/*` (list, get, aprobar, pagar) | FK; RPC `generar_liquidaciones` **no está en el repo** |

`dashboard-data.ts` lee **`cobros`** (eliminado/deprecated) → **OUT OF SCOPE**.

### 2.5 Datos existentes (solo lectura, 2026-09-23)

| Métrica | Valor |
|---|---|
| `eventos_honorario` | 90 (todas `DEVENGADO`; 0 PAGADO/LIQUIDADO/REVERSADO) |
| Fuentes | CONSULTA 3 · ESTUDIO 60 · PROCEDIMIENTO 27 · **OPERACION 0** · CITA 0 |
| Duplicados `(origen,doctor)` / `dedupe_key` | **0** |
| `sin_tarifa` en snapshot | 0 (pero snapshots **sin** `origen_nombre`: 90) |
| `cirugia_productividad` | 5 · todas `PENDIENTE` · `monto=NULL` · `regla_id=NULL` |
| `liquidaciones_doctor` | 0 |
| `tarifas_doctor` | 12 |
| `periodos_pago` | 3 (1 ABIERTO, 2 CERRADO) |
| Eventos con fecha futura (>2026-09-23) | **0** en eventos; **2** en CP (24/09 y 30/09) |

### 2.6 Defectos (severidad)

| ID | Defecto | Sev |
|---|---|---|
| D1 | Filtro doctor no aplica a `cirugia_productividad` en `resumen.ts` | **P0** |
| D2 | Doble fuente (eventos + CP) sin unificación; Sync no usa `cirugia_participantes` | **P1** |
| D3 | Cancelación/eliminar no marca honorarios `CANCELADO` | **P1** |
| D4 | Sync chequea eventos de consulta con `origen_id=consulta.id` (incorrecto) | **P1** |
| D5 | RPC `generar_liquidaciones` invocado pero no definido en repo | **P1** |
| D6 | Docs: `AI_CONTEXT`, `ERD` (enum sin `PAGADO`, `cobros`, módulo honorarios) | **P2** |
| D7 | `dashboard-data`/`search`/`pacientes` usan `cobros` | **OUT OF SCOPE** |
| D8 | `/mis-honorarios` referenciada en nav y docs pero **no existe** | **RESUELTO** (página + `GET /api/productividad/mis-honorarios`, ver B22 de `auditoria.md`) |
| D9 | Sin pago por línea; monto solo por tarifa o liquidación | Requisito nuevo (R3/R7) |

---

## 3. Conflictos doc-vs-código

| Doc | Dice | Código real | Acción |
|---|---|---|---|
| `docs/ERD.md` | `eventos_honorario.estado` sin `PAGADO`; `cirugia_id` en tabla | Enum incluye `PAGADO` (`1800000000230`); **no** hay columna `cirugia_id` en creación (`1800000000022`) | Registrar; fuente = migraciones |
| `docs/ERD.md` | `cobros` eliminada | `dashboard-data` aún la lee | OUT OF SCOPE |
| `docs/AI_CONTEXT.md:35` | Pago de consulta dispara honorarios | Solo POST creación + Sync | Registrar |
| `docs/AI_CONTEXT.md:54-57,90,100` | Módulo `/honorarios`, liquidación doctor-jefe, períodos CUSTOM | Módulo y API **borrados**; Productividad admin; sin CUSTOM | Registrar |
| `docs/HONORARIOS.md` | Diseño completo con liquidaciones | Parcialmente implementado; Sync/CP divergen | Registrar |

Ningún conflicto doc-vs-código **cambia** el diseño de este trabajo sin STOP: el diseño se basa en código/migraciones.

---

## 4. Decisiones de negocio asumidas y preguntas abiertas

| ID | Decisión / asunción | Estado |
|---|---|---|
| **R1** | Línea única `(fuente, fuente_id, doctor_id)` — **sin `rol`** en la unicidad de negocio; el `rol` se guarda como atributo. Índice parcial `idx_eventos_honorario_liga` (mig 260). | **APROBADO** |
| **R2** | Estudio/cirugía **ligada** a consulta no genera línea propia; métricas en la línea de la consulta. Solo independientes generan línea. Doctor ejecutor ≠ doctor consulta → **reportar, no resolver**. | **APROBADO** |
| **R3** | Monto manual; 0 = “sin monto”; no pagar con 0. Usa `monto_devengado` (`DECIMAL(10,2) NOT NULL DEFAULT 0`). | Asumido |
| **R4** | UI: `PENDIENTE`/`PAGADO`/`CANCELADO`. Mapa: `DEVENGADO`→ visible `PENDIENTE`/`POR_PAGAR`; `PENDIENTE_CONFIG` es **badge** (monto 0); `CANCELADO` **nuevo** en enum (mig 260). | Implementado (código + mig archivo) |
| **R5** | Período global en `configuracion_sistema` clave **`honorarios`** → `periodo_pago` (`SEMANAL\|QUINCENAL\|MENSUAL\|TRIMESTRAL`, default `MENSUAL`). Calculado al leer con `getPeriodRange`. | Implementado |
| **R6/R8** | Orden y totales en servidor sobre todo el filtro (`liga.ts` → `ordenarFilas` / `calcularResumen`). | Implementado |
| **R7** | Pago por fila y por doctor; atómico; **sin** `liquidaciones_doctor`. Pago directo en `eventos_honorario` (`fecha_pago`, `pagado_por`) + `bitacora_honorarios`. | **APROBADO** |
| Momento honorario cirugía | Nace al programar/conocer participantes; monto se captura después. | Asumido |
| Tabs | Quitas Tarifas/Períodos/Pagos/Por doctor. Conservadas Sync, Cirugías, Entradas y salidas, Estudios. `Por doctor` → panel del doctor (click en nombre). | **APROBADO** |
| Roles pago | Solo `admin` en endpoints productividad (`requireRole(['admin'])`). | Asumido |

**Decisiones del usuario (GATE 1):** 1 SQL aprobado · 2 unicidad sin `rol` · 3 pago directo en eventos (no liquidaciones) · 4 pestaña Por doctor absorbida por panel doctor.

---

## 5. Diseño de datos (aditivo) — SQL para GATE 1

> **Impacto producción:** altera enum `estado_evento_honorario`, añade columnas de pago, índice/trigger de unicidad R1, métricas de ligados y backfill de visibilidad. **No** dropea tablas. Ejecutar solo en BD identificada y aprobada.

```sql
-- ============================================================
-- GATE 1 — Honorarios simplificados (ADITIVO)
-- ============================================================

-- 1) Enum: + CANCELADO (patrón tipo-reemplazo transaccional, como mig 230)
CREATE TYPE estado_evento_honorario_g1 AS ENUM (
  'PENDIENTE', 'DEVENGADO', 'REVERSADO', 'LIQUIDADO', 'PAGADO', 'CANCELADO'
);
ALTER TABLE eventos_honorario
  ALTER COLUMN estado DROP DEFAULT,
  ALTER COLUMN estado TYPE estado_evento_honorario_g1
    USING estado::text::estado_evento_honorario_g1,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE';
DROP TYPE estado_evento_honorario;
ALTER TYPE estado_evento_honorario_g1 RENAME TO estado_evento_honorario;

-- 2) Pago por línea
ALTER TABLE eventos_honorario
  ADD COLUMN IF NOT EXISTS fecha_pago DATE,
  ADD COLUMN IF NOT EXISTS pagado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monto_manual DECIMAL(10,2)
    CHECK (monto_manual IS NULL OR monto_manual >= 0);

-- 3) Unicidad R1 (fuente, fuente_id, doctor_id) sobre filas vivas
--    Si el usuario aprueba SIN rol: sustituye al unique con rol para lógica de liga.
--    Mantener idx_eventos_honorario_unique (con rol) para no romper datos multi-rol existentes
--    hasta decidir R1. Se añade índice único parcial de liga:
CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_honorario_liga
  ON eventos_honorario (origen_tipo, origen_id, doctor_id)
  WHERE estado NOT IN ('REVERSADO', 'CANCELADO');

-- 4) Métricas de ligados (R2) — en la línea de la consulta
ALTER TABLE eventos_honorario
  ADD COLUMN IF NOT EXISTS metricas_ligados JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Ejemplo: {"estudios_ligados": 2, "cirugias_ligadas": 1}

-- 5) Período global R5: no requiere DDL (clave 'honorarios' ya existe).
--    Valor por defecto se garantiza en código al leer:
--    valor.periodo_pago ?? 'MENSUAL'

-- 6) Backfill de visibilidad (no cambia montos)
--    DEVENGADO sigue siendo el estado de devengo; la UI lo muestra como PENDIENTE de pago.
--    Solo se alinea lo que hoy se marca PENDIENTE_CONFIG por sin_tarifa: se deja monto 0.
--    NO se reescribe monto_devengado histórico.

-- 7) Opcional (solo si R1 aprueba colapsar multi-rol):
--    UPDATE/merge requeriría decisión; NO incluido hasta aprobación explícita.

-- Rollback (sketch):
-- DROP INDEX IF EXISTS idx_eventos_honorario_liga;
-- ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS metricas_ligados;
-- ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS pagado_por;
-- ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS fecha_pago;
-- ALTER TABLE eventos_honorario DROP COLUMN IF EXISTS monto_manual;
-- (+ reversión de tipo enum sin CANCELADO)
```

**Mapeo estatus (aplicación, no solo SQL):**

| DB `estado` | UI liga |
|---|---|
| `PENDIENTE` / `DEVENGADO` / `LIQUIDADO` | `PENDIENTE` (o `PENDIENTE`+badge sin monto si `monto=0`) |
| `PAGADO` | `PAGADO` |
| `CANCELADO` | `CANCELADO` (fuera de totales por pagar) |
| `REVERSADO` | excluido (como hoy) |

---

## 6. Contratos de API (diseño Fase 3 — bajo `/api/productividad`, no `/api/honorarios`)

> **Decisión:** el prompt pide `/api/honorarios`, pero esas rutas **no existen** (borradas). Se implementan bajo **`/api/productividad/honorarios/*`** para no inventar namespace muerto ni romper consumidores. Alternativa: recrear `/api/honorarios` solo si el usuario lo exige.

| Método | Ruta | Body / query | Respuesta | Errores |
|---|---|---|---|---|
| GET | `/api/productividad/honorarios` | `desde,hasta,doctorId?,estatus?,page,pageSize` | `{items,total_count,resumen:{por_pagar,pagado,sin_monto,total_filtrado},periodo_tipo}` items con `periodo_inicio/fin` | 400 rango; 401/403 |
| PATCH | `/api/productividad/honorarios/[id]` | `{monto: number ≥0, 2 dec}` | item actualizado | 400 monto; 409 si PAGADO/CANCELADO |
| POST | `/api/productividad/honorarios/pagar` | `{ids: uuid[]}` | `{pagados, omitidos:[{id,motivo}]}` | 400 ids vacíos/monto 0 |
| GET | `/api/productividad/honorarios/doctor/[doctorId]` | `referencia?: YYYY-MM-DD`, `desde,hasta?`, `page,pageSize` | `{items, total, periodo}` (con `desde`/`hasta` el rango manda sobre `referencia`) | 400 rango; 404 doctor |
| GET/PUT | `/api/productividad/config-periodo` | `{tipo}` | `{tipo}` | 400 tipo inválido |
| GET | `/api/productividad/reportes/cirugias` | `desde,hasta,doctor_id?` | CSV de cirugías (columnas del CSV fuente: `FECHA … NOTAS`) | 400 rango; 401/403 |

Utilidad pura: `src/lib/productividad/periodo.ts` → `getPeriodRange(fecha, tipo)` (lunes, trimestres, quincenas, TZ solo fechas `YYYY-MM-DD`).

---

## 7. Diseño de UI (Fase 4)

- Tab principal **Honorarios**: chips de fecha + selector doctor (corregido D1).
- KPIs: **Por pagar**, **Pagado**, **Sin monto** (count), **Total del filtro**.
- Tabla: Fecha · Doctor (click → panel) · Fuente · Origen · Métricas · Monto · Estatus · Acciones (**Editar monto**, **Realizar pago**). Fila **Total** al pie.
- Popover: período global (SEMANAL/QUINCENAL/MENSUAL/TRIMESTRAL).
- Panel doctor: período actual ◀▶, edit por línea, total, multi-selección, **Pagar seleccionados**.
- Quitar pestañas **Tarifas**, **Períodos**, **Pagos** (funcionalidad absorbida). **Conservar Sync**, Cirugías, Entradas y salidas, Estudios (salvo aprobación).
- CSV: filtro completo + monto + estatus + período.
- Reutilizar `components/ui`, `formatCurrency`, `formatFechaCsv`, sin `any`, sin comentarios.

---

## 8. Fases de implementación

| Fase | Objetivo | Archivos (previstos) | Criterio | Rollback |
|---|---|---|---|---|
| **0** | Auditoría solo lectura | este md | Matriz + defectos | n/a |
| **1** | Diseño + Gate 1 | este md §5 SQL | SQL escrito; **STOP** | n/a |
| **2** | Servicio único idempotente R1–R2, cancelación | `src/lib/productividad/devengo.ts` (o refactor `MotorDevengoService`), hooks en consultas/sync/agenda/cirugias | F1–F8 sin duplicar; ligados sin línea propia | revert diffs |
| **3** | API liga + periodo + pagar | `api/productividad/honorarios/**`, `lib/productividad/periodo.ts` + tests | tsc/lint; bug D1 corregido | quitar rutas |
| **4** | UI liga | `productividad/page.tsx` + componentes | UI sin Tarifas/Períodos/Pagos | git checkout UI |
| **5** | Limpieza código muerto (no tablas) | componentes/hooks endpoints tarifas/periodos/pagos si grep limpio | typecheck/lint/test/build | reintroducir archivos |
| **6** | e2e | `scripts/` o checklist si prod | Tabla E1–E18 | — |

---

## 9. Plan de auditoría e2e y resultados

`.env.local` apunta a Supabase con datos reales (URL + service role). **Regla:** producción → **NO ejecutar escrituras E2E**; solo funciones puras + lecturas + checklist manual.

| ID | Escenario | Resultado |
|---|---|---|
| E1 | `getPeriodRange` SEMANAL/QUINCENAL/MENSUAL/TRIMESTRAL | **OK** — `npm run test:b17` (22 OK) |
| E2 | Resolución fuente (consulta/estudio ligado/cirugía ligada/indep.) | **OK** — `test:b17` |
| E3 | Parse monto manual / `montoValidoParaPago` | **OK** — `test:b17` |
| E4 | Migración 260 contiene CANCELADO, pago, métricas, índice liga | **OK** — `test:b17` + **aplicada en Supabase** (enum + 3 columnas + `idx_eventos_honorario_liga`) |
| E5 | `tsc --noEmit` | **OK** — 0 errores |
| E6 | `npm run lint` | **OK** — solo warnings preexistentes (img/hooks) |
| E7 | `test:b12`–`b16` + `b1`/`b8` | **OK** — b12:22, b13:5, b14:11, b15:8, b16:37, b1:18, b8:95 |
| E8 | UI sin pestañas Tarifas/Períodos/Pagos/Por doctor | **OK** — `test:b15` |
| E9 | Endpoints liga (GET/PATCH/pagar/doctor/config-periodo) presentes + admin | **OK** — `test:b14` |
| E10 | D1 filtro doctor en `cirugia_productividad` | **OK código** — `resumen.ts` filtra `part?.medico_id === doctor_id` (pendiente verificación con datos post-mig) |
| E11 | D4 Sync `origen_id = consulta.id` | **OK código** — `sync/route.ts` consulta eventos `CONSULTA` con `origen_id=consulta.id` |
| E12 | Cancelación consulta → `CANCELADO` (no si `PAGADO`) | **OK código** — hooks en `consultas/[id]` DELETE + acciones; **no E2E escritura** (prod) |
| E13 | Cancelación cirugía/agenda → eventos + `cirugia_productividad` ANULADO | **OK código** — `agenda/[id]` PATCH/DELETE + Sync cancelada |
| E14 | Pago por fila / doctor atómico + bitácora | **OK código** — `pagarHonorarios` + `bitacora_honorarios`; **no E2E escritura** (prod) |
| E15 | R2 métricas en línea consulta (`metricas_ligados`) | **OK código** — `generarDesdeConsulta` / `incrementarMetricaConsulta` |
| E16 | UI liga: editar monto, pagar, panel doctor, período global | **OK código/UI** — `page.tsx` + rutas honorarios |
| E17 | CSV + Server-Timing + admin-only | **OK** — rutas `productividad` e `honorarios` |
| E18 | Doble request de pago (idempotencia) | **Código** — `estado=PAGADO` omitido en segundo pago (`omitidos: ya_pagado`); **no E2E escritura** |

**Checklist manual post-aplicar mig 260 en staging:** E10–E14, E18 con harness de períodos + doble request de pago.

---

## 10. Riesgos y OUT OF SCOPE

**Riesgos**

- ~~Migración 260 (enum + columnas + índice)~~ **aplicada** en BD (2026-09-24).
- Unificar CP vs eventos puede “ocultar” filas CIRUGIA que hoy ven los usuarios → comunicar.
- Endpoints viejos `tarifas`/`periodos`/`pagos` **eliminados del código** (sin consumidores); si algo externo los llamaba, reintroducir.
- Pago sin `liquidaciones_doctor` rompe expectativa de auditoría vieja (decidido).

**OUT OF SCOPE**

- `dashboard-data.ts` / `search` / `pacientes` → tabla `cobros`.
- ~~Crear `/mis-honorarios` (link roto en `DoctorBottomNav` / dashboard)~~ **hecho**: página `src/app/(dashboard)/mis-honorarios/page.tsx` + `GET /api/productividad/mis-honorarios` (B22).
- RLS/roles (se replica admin actual).
- Borrar tablas `tarifas_doctor`, `periodos_pago`, `liquidaciones_doctor`.
- `generar_liquidaciones` (RPC no existe en repo): documentado, no inventado.

---

## Control de fases

| Fase | Estado |
|---|---|
| 0 Auditoría | ✅ |
| 1 Diseño + SQL Gate 1 | ✅ + **aprobado por usuario** |
| 2 Generación confiable | ✅ `MotorDevengoService` R1–R2 + cancelación + Sync D4 |
| 3 API | ✅ `/api/productividad/honorarios/*` + `config-periodo` + `periodo.ts` |
| 4 UI | ✅ `page.tsx` liga (sin Tarifas/Períodos/Pagos/Por doctor) |
| 5 Limpieza | ✅ rutas tarifas/periodos/pagos borradas; sin refs en `src/` |
| 6 e2e + reporte | ✅ puras/lectura + `test:b17`; escrituras E2E omitidas (prod); **mig 260 aplicada a mano** |
