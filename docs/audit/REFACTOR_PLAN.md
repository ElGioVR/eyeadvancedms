# REFACTOR_PLAN.md — Fase 2: Plan de corrección
## Proyecto: EyeAdvanced Medical Solutions (eyeadvancedms)
**Fecha:** 2026-09-25 · **Entrada:** `AUDIT_FINDINGS.md` (60 hallazgos) · **Salida:** orden de ejecución por dependencia técnica + mapeo hallazgo → cambio → tests.

---

## 0. Principios y decisiones de diseño

1. **Retrocompatibilidad de contratos por defecto.** Ningún cambio de respuesta API altera su forma; los únicos cambios de contrato visibles se listan en §4 con todos sus consumidores. Los checks de seguridad nuevos solo **reducen acceso** (403) donde ya debía existir restricción — se documentan como cambio de comportamiento visible.
2. **Runner de tests y cobertura (decisión):** se usará **`node:test` + `node:assert`** (incluidos en Node 22, cero dependencias nuevas — regla 4 del prompt) con **`node --experimental-test-coverage`** para el % de cobertura real. Los 22 tests estructurales `scripts/tests/b1..b22` se conservan como suite de regresión de negocio/integridad. Los tests unitarios nuevos viven en `src/**/__tests__/*.test.ts` y se ejecutan con `node --test` vía tsx/ts-node (ya presentes en devDependencies).
3. **BD remota:** ninguna migración se aplica a la BD remota desde aquí (regla AGENTS). Las migraciones/patches se entregan en `sql/` + `src/migrations/` y se aplican primero en **BD local desechable**; los patches marcados 🔴 requieren que el admin los aplique en producción para que el código dependiente funcione.
4. **Orden por dependencia técnica** (no por severidad): Wave 0 infraestructura transversal → Wave 1 base de datos/ERD → Waves 2-8 módulos de negocio en el orden del prompt (Pacientes → Consultas → Inventario → Cobros → Reportes → Configuración → Dashboard) — los hallazgos de Productividad se reparten entre Cobros (Wave 5) y Reportes (Wave 6), que son donde viven sus archivos.
5. **Regla no negociable (test primero):** antes de tocar cualquier función de negocio existe un test de regresión que reproduce el comportamiento actual. Para lógica nueva (PATCH pacientes, whitelist de preferencias) el test se escribe con la implementación.
6. **Cobertura objetivo:** 100% de líneas/branches en **lógica nueva o modificada** de `src/lib/**` y `src/services/**` (utils, validadores, devengo, festivos, parseo). UI presentacional: tests de comportamiento con `node:test` no aplican; se cubre con los tests estructurales b-series existentes + estados de error verificados manualmente por checklist.

---

## 1. Wave 0 — Infraestructura transversal (prerequisito de todo)

| Paso | Hallazgo | Cambio | Tests que lo protegen |
|---|---|---|---|
| 0.1 | ERR.1 (24 puntos) | Nuevo `src/lib/supabase/handle-error.ts`: `handleSupabaseError(error, contexto)` → `console.error` estructurado + retorno `{ mensaje }` vía `errorTranslations`. Se adopta gradualmente por módulo en su wave. | **Nuevo:** unit `handle-error.test.ts` (traduce conocidos, fallback genérico, log con message+code). Regresión: suite b2/b4/b7 verde. |
| 0.2 | CAL.DUP.1 | Nuevo `src/lib/text.ts`: `normalizeNombre`, `parseCsv`, `formatBytes`, `getInitials`. Se migran las 9 implementaciones duplicadas a imports de aquí. | **Nuevo:** unit `text.test.ts` (parse CSV comillas/` ;`/BOM — portado del test offline ya validado; normaliza acentos y espacios dobles). Regresión: b7, import offline verificado. |
| 0.3 | ERR.UI.1 | `src/app/error.tsx` global (español, botón Reintentar) + `src/app/(dashboard)/error.tsx`. | Verificación manual por checklist + test estructural nuevo b23 (presencia de error.tsx, igual patrón que b-series). |
| 0.4 | — (infra de cobertura) | Script npm `test:unit` (`node --import tsx --test src/**/__tests__`) + `test:cobertura` (`--experimental-test-coverage`). | Ejecución de la suite. |
| 0.5 | SEC.VAL.2 | `/api/usuarios/me` PATCH: zod whitelist `preferencias: { modo_focus?, theme?, festividad? }` (merge igual). | **Nuevo:** unit del schema + integración manual (PATCH con clave ajena → 400). |
| 0.6 | ERR.HIS.1, ERR.LOG.1, ERR.ES.1 | Try/catch estándar en `historial POST` y `usuarios/me PATCH`; `errorTranslations` en los 5 endpoints que filtran `error.message`; `'Missing user ID'` → `'Falta el ID del usuario'`. | Regresión: b2/b4 + manual. |

**Contratos que cambian en Wave 0:** ninguno visible salvo 400 nuevos por whitelist (consumidor afectado: solo `TopBar.tsx` y `DashboardContent.tsx`, que ya envían claves permitidas).

---

## 2. Wave 1 — Base de datos / ERD (decisión humana requerida aquí)

| Paso | Hallazgo | Cambio | Notas |
|---|---|---|---|
| 1.1 🔴 | SES.MIG.1 | **Admin aplica en BD:** `sql/patch-doctores-alias.sql`. Sin esto, el módulo Doctores (código actual) devuelve 500. | Bloqueante para Wave 7 (Configuración). Verificación: `SELECT alias FROM doctores LIMIT 1`. |
| 1.2 | SES.ESQ.1 | **Decisión de esquema canónico para `inventario_items`** (requiere decisión del admin): (a) migrar `manufacturer/model/sphere` → `marca/modelo/grado_esferico` (alinear con migraciones y ERD) o (b) adoptar el esquema nuevo en ERD y migrar datos legacy. Tras decidir: migración + **eliminación de las cascadas de fallback** en `inventario/disponible`, `cirugias/[id]`, `dashboard-data`. | Bloqueante para Wave 4 (Inventario). Mientras tanto los fallbacks se mantienen (no rompen). |
| 1.3 | PERF.IDX.1 | Migración nueva: `idx_inventario_items_stock`, `idx_consultas_fecha_deployed (fecha, deployed_to_performance)`, `idx_agenda_cirugias_fecha_deployed`. | Sin riesgo; additiva. Test b1-style nuevo. |
| 1.4 | SES.EST.1 | Data-migration opcional: `UPDATE consultas SET estatus='COMPLETADA' WHERE estatus='PROCESADA'` (o mantener mapa dual documentado en ERD). | Decisión del admin. |
| 1.5 | SES.RPC.1 | `DROP FUNCTION crear_consulta` (RPC muerto) o adoptarlo — recomendado: eliminar para evitar divergencia. | Migración. |
| 1.6 | §3 ERD | Actualizar `docs/ERD.md`: añadir las 11 tablas faltantes, corregir estado de `cobros`/`matriz_costos`/`cobro_detalles`, documentar `doctores.alias/nombre/apellido`. | Parte del cierre (Fase 4). |

---

## 3. Wave 2 — Pacientes

| Paso | Hallazgo | Cambio (antes → después) | Tests |
|---|---|---|---|
| 2.1 🔒 | SEC.PAC.1 | `GET /api/pacientes/[id]/resumen`: añade `requireRole(['admin','doctor','recepcionista'])` + proyección de columnas (deja de incluir póliza/afiliación si la UI no las usa — verificar `cirugias/nueva/page.tsx:802-811`). **Contrato:** forma de respuesta igual; 403 nuevo para usuarios sin rol clínico. Consumidores: `cirugias/nueva`, `consultas/nueva`. | Regresión: manual por checklist (cirugías/nueva precarga) + nuevo test estructural del RBAC (b-series: presencia de requireRole en el archivo). |
| 2.2 | ERR.PAC.1 | Nuevo `PATCH /api/pacientes/[id]` (zod: nombre_completo, telefono, email, direccion, sexo, fecha_nacimiento, contacto_emergencia) — **endpoint nuevo**, sin consumidores rotos. | **Nuevo:** unit del schema + test estructural; integración manual éxito/401/404/400. |
| 2.3 | PERF.PAC.1 | `GET /api/pacientes/[id]`: `.order('fecha', {ascending:false}).limit(100)` en consultas; cobros con `.limit(200)`. **Contrato:** mismas formas, menos filas para pacientes históricos (UI de historial ya pagina client-side → verificar `pacientes/[id]/historial/page.tsx` consume todo: si lista completo, subir límite a 500). | Regresión: manual historial; test estructural de límites presentes. |
| 2.4 | PERF.FE.3, PERF.FE.4 | `pacientes/page.tsx`: `AbortController` en useEffect; `window.location.reload()` → `refetch()`. | Manual. |

---

## 4. Wave 3 — Consultas

| Paso | Hallazgo | Cambio | Tests |
|---|---|---|---|
| 3.1 🔒 | SEC.CON.1 | `GET /api/consultas/[id]`: proyección explícita (sin `select('*')`); póliza/afiliación solo cuando la vista lo usa (verificar `consultas/[id]/page.tsx:146-148`). **Contrato:** mismos campos salvo PII removida del listado `GET /api/consultas` (consumidores: `consultas/page.tsx`, `search`). | Regresión: b2/b4 + manual. |
| 3.2 | PERF.CON.1 | Ídem: `select(...)` explícito en listado `api/consultas`. | Regresión: suite b-series. |
| 3.3 | PERF.CON.2 | `resolverServicio`: un query `in()` a `aseguranza_servicios` para estudios+procedimientos+consulta (antes: hasta 5 secuenciales). **Contrato interno** (función privada). | **Nuevo:** unit de resolución de servicios con mock del cliente. |
| 3.4 | SEC.VAL.3, ERR.HIS.1 | `historial POST`: zod (`tipo_evento` enum de tipos existentes, `payload` objeto ≤4KB), verificación de existencia de la consulta, try/catch en `request.json()`. **Contrato:** 400 nuevos en payloads inválidos (consumidor: `consultas/[id]/page.tsx`). | **Nuevo:** unit schema + manual. |
| 3.5 | SEC.VAL.1, SEC.VAL.4 | Sanitizar `%`/`_` y limitar `q`/`search` (search + aseguranzas/servicios). **Comportamiento visible:** búsquedas con `%` dejan de listar todo. | **Nuevo:** unit del sanitizador. |
| 3.6 | ERR.1 (consultas/[id]:310) | Adoptar `handleSupabaseError` en PATCH. | Regresión b4. |

---

## 5. Wave 4 — Inventario (depende de decisión 1.2)

| Paso | Hallazgo | Cambio | Tests |
|---|---|---|---|
| 4.1 | SES.ESQ.1 (post-decisión) | Eliminar cascadas de fallback en `inventario/disponible`, `cirugias/[id]`, `dashboard-data` → una sola proyección canónica. **Contrato:** respuestas iguales. | Regresión: **b7** (85 asserts) + **b20** + nuevo unit del mapeo. |
| 4.2 | SEC.CIR.4 | Archivos: proyección sin `storage_path` en GET. Consumidor: `cirugias/[id]/page.tsx` (visor usa URL firmada, no storage_path). | Manual + b5. |
| 4.3 | SEC.CIR.5 | DELETE archivo: borrar objeto del Storage tras soft-delete. | Manual (bucket) + b5/b6. |
| 4.4 | ERR.1 | `handleSupabaseError` en inventario/disponible y cirugias/roles/recursos/[id]. | b7 + b5/b6. |
| 4.5 | PERF.IDX.1 | (índices ya en 1.3) — verificar plan con EXPLAIN en BD local. | Manual. |

---

## 6. Wave 5 — Cobros / Productividad (críticos de performance)

| Paso | Hallazgo | Cambio | Tests |
|---|---|---|---|
| 5.1 🔴 | PERF.PROD.1 | `sync/route.ts`: (a) batch-load de eventos existentes por `origen_id in (...)`; (b) procesamiento por chunks paralelos de 10; (c) update `deployed_to_performance` en batch al final. **Contrato:** respuesta JSON igual; `sync_log` igual. Consumidores: `SyncModal.tsx`, `productividad/page.tsx`. | **Antes del refactor:** capturar snapshot de salida con datos de BD local (script de integración nuevo `b24-sync-snapshot`). Después: mismo snapshot + unit del chunker. |
| 5.2 🔴 | PERF.RES.1 | `resumen.ts`: `resolverOrigenEventos` por batch (`in()`) y filtro de fecha de `cirugia_productividad` en SQL. **Contrato:** `listarResumenHonorarios` misma forma. | **Nuevo:** unit de `resolverOrigenEventos` con mock; snapshot b17 ampliado. |
| 5.3 🔴 | PERF.DEV.1 | `MotorDevengoService`: métodos batch (`generarPendientes` usa precarga con `in()`), conservando `generarDesdeConsulta/Cirugia` individuales (los usa la creación). **Contrato:** métodos públicos iguales. | **Nuevo:** unit de la parte pura (cálculos de monto/cantidad/ojo — ya parcial en b13) + snapshot b13 ampliado. |
| 5.4 | CAL.DUP.1 (crearNotificacion) | `api/inventario` y `api/consultas` usan `services/notificaciones` en lugar de copia local. **Contrato:** mismos inserts. | Regresión: b2/b4 + b20. |
| 5.5 | SEC.RL.1 | Rate-limit: documentar límite in-memory como mejor esfuerzo + añadir límite por IP a imports/search si se decide infra externa (Upstash) — **requiere decisión de dependencia**; default: mantener in-memory y limitar tamaño de archivos (SEC.IMP.1). | Manual. |
| 5.6 | SEC.IMP.1 | `agenda/import`: máx 5MB + máx 2000 filas + sanitizar `file.name` en `agenda_import_log`. **Contrato:** 400 nuevos en archivos enormes. | **Nuevo:** unit del validador de archivo. |

---

## 7. Wave 6 — Reportes

| Paso | Hallazgo | Cambio | Tests |
|---|---|---|---|
| 6.1 | CAL.SEL.1 | Constante compartida `SELECT_CIRUGIA_LISTA` en `src/lib/queries.ts` para los 3 SELECT duplicados. **Contrato:** mismas columnas. | b14/b15 + nuevo unit de contraste de columnas. |
| 6.2 | PERF.AGE.1 | `api/agenda`: default de rango (mes actual) si no hay params + count en SQL. **Comportamiento visible:** cliente siempre envía fechas → sin cambio observado. | b11 + manual. |
| 6.3 | PERF.SRC.1 | `search`: limit en query de cirugías por filtro ojo. | Manual. |
| 6.4 | PERF.FE.1 | `recharts` a dynamic import en `DashboardContent` y `charts.tsx` (mismo patrón que productividad/page). | Manual + build. |

---

## 8. Wave 7 — Configuración

| Paso | Hallazgo | Cambio | Tests |
|---|---|---|---|
| 7.1 🔒 | — (post 1.1) | Verificar módulo doctores completo contra BD con `alias` (crear/editar/vincular doctor+admin). | b-series + manual. |
| 7.2 | PERF.FE.2 | Paginación client en tabla de servicios de aseguranza (componente `Pagination` existente). | Manual. |
| 7.3 | ERR.1 (configuración ×15) | `handleSupabaseError` en los 15 catch sin log (Anexo A). **Contrato:** mismos mensajes al cliente, logs completos en server. | b-series + verificación de logs. |
| 7.4 | CAL.DUP.1 (getInitials) | Migrar 4 implementaciones a `lib/text.ts`. | Unit. |
| 7.5 | ERR.ES.1 | `'Missing user ID'` → español. | Regresión b2. |

---

## 9. Wave 8 — Dashboard / Global

| Paso | Hallazgo | Cambio | Tests |
|---|---|---|---|
| 8.1 | PERF.DASH.1, agenda waterfall | `Promise.all` perfil+datos en `dashboard/page.tsx` y `agenda/page.tsx`. | Manual (Lighthouse). |
| 8.2 | SEC.CSP.1 | CSP: evaluar enforcing (sin `unsafe-inline` para scripts si feasible con nonces) — puede romper `sw-register` inline; plan: mover scripts inline a archivos. | Build + smoke E2E. |
| 8.3 | SEC.LOG.2, CAL.TIP.1 (top 3) | Log estructurado en devengo; tipar `(c as any)` de agenda/consultas con interfaces. | Unit de tipos vía tsc. |
| 8.4 | PERF.BUN.1 | Remover `jspdf`/`jspdf-autotable` de package.json. | Build sin cambio de bundle crítico. |
| 8.5 | SEC.SW.1 | `Cache-Control: no-store` en headers de rutas `/api/(pacientes|consultas|agenda|cirugias)/*`. | Manual (DevTools). |

---

## 4. Cambios de contrato completos (consumidores)

| Endpoint | Antes | Después | Consumidores a verificar |
|---|---|---|---|
| `GET /api/pacientes/[id]/resumen` | Cualquier autenticado; columnas completas | 403 sin rol clínico; sin póliza/afiliación si no se usan | `cirugias/nueva/page.tsx` (resumen card), `consultas/nueva` |
| `GET /api/cirugias/[id]` y `GET /api/cirugias` | Cualquier autenticado | 403 para doctor no-participante (admin/recepcionista pasan) | `AgendaContent`, `cirugias/[id]`, `MobileCalendarView` |
| `GET /api/consultas` (listado) | Incluye PII completa por `select *` | Proyección sin PII extra | `consultas/page.tsx` |
| `PATCH /api/usuarios/me` | `preferencias` libre | 400 con claves no permitidas | `TopBar`, `DashboardContent` |
| `POST /api/consultas/[id]/historial` | body libre | 400 sin zod válido | `consultas/[id]/page.tsx` |
| `POST /api/agenda/import` | sin límites | 400 si >5MB o >2000 filas | `AgendaContent` (ImportExcel/ImportConsultas) |
| `GET /api/search` | wildcards `%` efectivos | wildcards escapados | `TopBar` (búsqueda global) |

## 5. Cobertura objetivo

- **Alcance de 100%:** `src/lib/text.ts`, `src/lib/festivos.ts`, `src/lib/supabase/handle-error.ts`, `src/lib/parseLabel.ts` (ya b21), `src/lib/productividad/{periodo,resolver-fuente,resumen,metricas}.ts` (partes puras), `src/services/productividad/MotorDevengoService.ts` (cálculos), `src/lib/agenda-conflictos.ts`, schemas zod nuevos.
- **Medición:** `npm run test:cobertura` → número real reportado al cierre (Fase 4). Los tests b-series no computan cobertura (integridad estructural).

## 6. Validación por wave (salida obligatoria)

1. `npx tsc --noEmit` sin errores · `npm run lint` sin errores nuevos.
2. Suite completa: `npm run test:b1..b22` + `npm run test:unit` — cero regresiones.
3. `CHANGELOG_AUDIT.md` actualizado (3-5 líneas por módulo).
4. En waves con 🔴: checklist de aplicación de SQL por el admin antes de considerar cerrado el módulo.

**Fin de Fase 2.** Siguiente: Fase 3 — implementación por módulos en el orden de waves (esperando confirmación, o "continúa sin pausas" para ejecutarlas encadenadas).
