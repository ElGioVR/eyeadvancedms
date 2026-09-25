# AUDIT_FINDINGS.md — Fase 1: Auditoría profunda
## Proyecto: EyeAdvanced Medical Solutions (eyeadvancedms)
**Fecha:** 2026-09-25 · **Alcance:** estado real del workspace (incluye cambios sin commitear).

Convención: cada hallazgo tiene **ID** (área.módulo.nº), severidad (Crítico/Alto/Medio/Bajo), evidencia `archivo:línea`, impacto de negocio y propuesta de corrección. Los severidades finales fueron consolidadas manualmente a partir de 3 exploraciones (seguridad, performance, errores/calidad) + hallazgos de las sesiones de trabajo previas.

---

## Resumen ejecutivo de hallazgos

| Severidad | Cantidad | Tema dominante |
|---|---|---|
| **Crítico** | 7 | N+1/loops secuenciales en productividad; errores de BD invisibles (~30 endpoints sin log); migración `doctores.alias` pendiente en BD con código ya dependiente |
| **Alto** | 18 | RBAC faltante en endpoints con PII; sin Error Boundary; fetch silenciosos; paginación en memoria; anti-patrón useState initializer |
| **Medio** | 21 | Validación de entrada ausente (search, preferencias, historial POST); rate-limit in-memory inútil en serverless; funciones duplicadas; `select *` con 6 joins; recharts estático |
| **Bajo** | 14 | Catálogos sin requireRole; mensajes mezclados ES/EN; console.error con detalles; índices compuestos faltantes |

---

## A. SEGURIDAD

### A.1 RBAC / exposición de datos (service-role sin ownership)

- **[Alto] SEC.PAC.1** `src/app/api/pacientes/[id]/resumen/route.ts:9-51` — GET solo `requireAuth()`, sin rol ni ownership; expone PII completa de **cualquier paciente por ID** (nombre, teléfono, email, póliza, afiliación). *Impacto:* cualquier cuenta (p.ej. recepcionista desvinculada o usuario comprometido) enumera pacientes. *Fix:* añadir `requireRole(['admin','doctor','recepcionista'])` + filtro por modo focus/doctor, y seleccionar solo columnas usadas por la UI.
- **[Alto] SEC.CIR.1** `src/app/api/cirugias/[id]/route.ts:9-13` — GET sin `requireRole()`, service-role con `id` arbitrario; expone cirugía + participantes + archivos + productividad + historial de cualquier cirugía. *Impacto:* cruce de información clínica entre doctores. *Fix:* requireRole + si rol doctor, filtrar por participación (`agenda_cirugia_doctores`) salvo modo focus.
- **[Alto] SEC.CIR.2** `src/app/api/cirugias/route.ts:17-21` — GET sin rol lista **todas** las cirugías (nombre_paciente) con paginación del cliente. *Fix:* mismo filtro que SEC.CIR.1 y limit server-side.
- **[Medio] SEC.CIR.3** `src/lib/permisos-archivo.ts:36-61` — `verificarPermisoArchivo` valida rol pero **no que el doctor tenga acceso a esa cirugía**; cualquier doctor con permiso "ver" descarga archivos de cualquier cirugía. *Fix:* tras validar rol, verificar participación en `agenda_cirugia_doctores` o rol admin/recepcionista.
- **[Medio] SEC.CIR.4** `api/cirugias/[id]/archivos/[archivoId]/route.ts:21-27` — `select('*')` devuelve `storage_path` (estructura interna del bucket) al cliente. *Fix:* proyectar columnas necesarias.
- **[Medio] SEC.CIR.5** `api/cirugias/[id]/archivos/[archivoId]/route.ts:67-73` — soft-delete **no elimina el objeto de Storage**; el binario queda accesible con URL firmada futura. *Fix:* eliminar objeto del bucket tras soft-delete (o job de purga).
- **[Medio] SEC.CON.1** `src/app/api/consultas/[id]/route.ts:82-88` — RBAC parcial: doctor ve solo las suyas ✓, pero el select incluye póliza/afiliación/teléfono/email del paciente para admin/recepcionista sin necesidad en todas las vistas. *Fix:* mover PII sensible a un endpoint dedicado o proyectar según rol.
- **[Medio] SEC.HIS.1** `api/consultas/[id]/historial/route.ts:15-20` — GET de historial de cualquier consulta sin verificación de acceso a esa consulta. *Fix:* reutilizar el RBAC de `consultas/[id]`.
- **[Bajo] SEC.ASE.1** `api/consultas/[id]/aseguradora/route.ts:13-14` — `consulta_id` arbitrario sin rol; expone solo datos de cobertura. *Fix:* añadir requireRole de catálogos.

### A.2 Validación de entrada

- **[Medio] SEC.VAL.1** `src/app/api/search/route.ts:41,49` — `q` usado en `ilike` sin escapar `%`/`_` ni longitud máxima (wildcards inyectables; `q=%` lista todo lo indexado). *Fix:* escapar `%`/`_`, longitud máx. 60, rate-limit.
- **[Medio] SEC.VAL.2** `src/app/api/usuarios/me/route.ts:65-81` — PATCH acepta `preferencias` sin whitelist de claves (merge con spread). Corrompe estructura de preferencias (no tabla). *Fix:* zod con claves permitidas (`modo_focus`, `theme`, `festividad`).
- **[Medio] SEC.VAL.3** `api/consultas/[id]/historial/route.ts:53-55` — POST sin zod: `tipo_evento` arbitrario y `payload` libre, sin verificar que la consulta exista. *Fix:* zod + validación de existencia + enum de tipos.
- **[Medio] SEC.VAL.4** `api/configuracion/aseguranzas/servicios/route.ts:44` — `search` en `ilike` sin escapar wildcards. *Fix:* ídem SEC.VAL.1.
- **[Medio] SEC.IMP.1** `api/agenda/import/route.ts:236-267` — sin límite de `file.size` ni de filas; `file.name` persistido sin sanitizar en `agenda_import_log`. *Fix:* máx 5MB (como el import de aseguranzas), máx ~2000 filas, sanitizar nombre.
- **[Bajo] SEC.LOG.1** `api/agenda/import/route.ts:244,485,736` — ídem `file.name`.

### A.3 Rate limiting / sesiones

- **[Medio] SEC.RL.1** `src/lib/rate-limit.ts:1-4` + `api/auth/login/route.ts:39-45` — rate-limit **in-memory** (Map por instancia): inútil en serverless (Vercel). Solo protege login; ningún otro endpoint. *Fix:* límite por IP vía middleware/edge o Upstash Redis; extender a imports y search.
- **[Medio] SEC.CSRF.1** `src/middleware.ts:24,33` — cookies `httpOnly:false` y sin token CSRF en mutaciones; mitigación parcial por `sameSite: lax`. *Fix:* mantener `lax` + validar `Origin`/`Sec-Fetch-Site` en mutaciones, o doble-submit token.
- **[Bajo] SEC.CSP.1** `next.config.js:36-46` — CSP en Report-Only y con `'unsafe-inline'` en script-src. *Fix:* mover a enforcing con nonces cuando no rompa.

### A.4 Secrets / logging
- ✅ Sin secretos hardcodeados; `SUPABASE_SERVICE_ROLE_KEY` solo server; `.env.example` correcto.
- **[Bajo] SEC.LOG.2** `api/consultas/route.ts:552` — `console.error('Error al generar honorarios:', err)` puede volcar stack completo con datos. *Fix:* log estructurado message+code.

---

## B. PERFORMANCE (backend)

- **[Crítico] PERF.PROD.1** `api/productividad/sync/route.ts:59-143` — sync admin: loop secuencial por consulta/cirugía con 3-5 queries por fila. 150 registros ≈ 450-750 round-trips (>5 s). *Impacto:* sync de un mes se agota (timeout) y bloquea devengo. *Fix:* precargar pendientes en batch (ya existe `listarPendientesDespliegue`), paralelizar por lotes (chunk de 10) y marcar `deployed_to_performance` en batch al final.
- **[Crítico] PERF.RES.1** `lib/productividad/resumen.ts:172-193` — N+1: por cada evento PROCEDIMIENTO hace 2 queries secuenciales (`consulta_conceptos`, `agenda_cirugias`) + query de `cirugia_productividad` sin filtro de fecha (filtra en memoria :220-269). *Fix:* batch por `origen_id` (`in()`), y filtro de fecha en SQL.
- **[Crítico] PERF.DEV.1** `services/productividad/MotorDevengoService.ts:138-177` — N+1 en generación por lote (1-3 queries por consulta/cirugía). *Fix:* mismos batches; mantener `generarDesdeConsulta` individual para el flujo de creación.
- **[Medio] PERF.CON.1** `api/consultas/route.ts:141-151` — `select('*, …')` con 6 joins (payload grande, incluye PII innecesaria en listado). *Fix:* proyección explícita (regla AGENTS: sin `SELECT *`).
- **[Medio] PERF.PAC.1** `api/pacientes/[id]/route.ts:29-44` — consultas del paciente y cobros sin límite (crece sin control con pacientes históricos). *Fix:* límite/orden descendente + paginación para historial.
- **[Medio] PERF.AGE.1** `api/agenda/route.ts:51,116-165` — paginación **post-filtro en memoria** (trae todas las filas del rango y hace slice); sin fecha por defecto si el cliente no envía rango. *Fix:* filter+count en SQL y default de rango (mes actual).
- **[Medio] PERF.IMP.1** `api/agenda/import/route.ts:601-614` — `findDoctor` recarga TODOS los doctores por cada fila (31 filas = 31 queries completas). *Fix:* cachear doctores activos una vez antes del loop (ya se hace en consultas: unificar).
- **[Medio] PERF.IMP.2** `api/agenda/import/route.ts:405-472` — import de consultas: 3-5 queries secuenciales por fila (paciente + consulta). *Fix:* precache pacientes existentes por teléfono/nombre en 2 queries y batch-insert consultas.
- **[Medio] PERF.CON.2** `api/consultas/route.ts:433-458` — `resolverServicio` secuencial por estudio/procedimiento (hasta 5 queries). *Fix:* un `in()` sobre `aseguranza_servicios` y resolver en memoria.
- **[Bajo] PERF.DASH.1** `dashboard/page.tsx:8-35` — waterfall 3 round-trips (auth → perfil → datos); idem `agenda/page.tsx:7-28`. *Fix:* `Promise.all` perfil+datos.
- **[Bajo] PERF.SRC.1** `api/search/route.ts:67-71` — query de cirugías por `paciente_id in (...)` sin limit cuando hay filtro de ojo. *Fix:* limit + índice.

### Índices (migraciones)
- ✅ Existen: `consultas(fecha)`, `consultas(paciente_id)`, `consultas(doctor_id, fecha)`, `agenda_cirugias(fecha/estado/doctor_id,fecha/consulta_id)`, `eventos_honorario(doctor_id,estado,fecha_servicio)` y `(fecha_pago) WHERE PAGADO`, `consulta_conceptos(consulta_id)`.
- **[Medio] PERF.IDX.1** Falta índice `inventario_items(stock)` (dashboard lo ordena) y compuestos `(fecha, deployed_to_performance)` en `consultas`/`agenda_cirugias` (sync los filtra así). *Fix:* migración de índices (junto con 290).

---

## C. PERFORMANCE (frontend) + hidratación

- **[Medio] PERF.FE.1** `DashboardContent.tsx:20-29` y `components/productividad/charts.tsx:17` — `recharts` import **estático** en client (~200 kB). *Fix:* `dynamic(..., { ssr:false })` como ya se hace en `productividad/page.tsx:45`.
- **[Medio] PERF.FE.2** `configuracion/aseguranzas/[id]/servicios/page.tsx:333-414` — tabla renderiza **todas** las filas filtradas sin paginación (aseguranzas con 500+ servicios). *Fix:* paginación client (ya existe componente `Pagination`).
- **[Medio] PERF.FE.3** `pacientes/page.tsx:74-79` y `servicios/page.tsx:79-105` — fetch en `useEffect` sin `AbortController` (setState tras unmount). *Fix:* `AbortController` o hook `useFetch`.
- **[Bajo] PERF.FE.4** `pacientes/page.tsx:420` — `window.location.reload()` tras crear paciente (full reload). *Fix:* `refetch()` del hook.
- ✅ positive: `cirugias/nueva` cumple reglas de hidratación; AgendaContent usa `useMemo` para stats/mini-mes; polling de notificaciones cada 30 s es un COUNT ligero.
- **[Bajo] PERF.BUN.1** `jspdf`/`jspdf-autotable` en `package.json` **sin ningún import en `src/`** — dependencia muerta. *Fix:* remover.

---

## D. MANEJO DE ERRORES

- **[Crítico] PERF—ERR.1** (~24 puntos) — Endpoints que retornan `'Error interno del servidor'` **sin `console.error` del error real**; el fallo es ind diagnosable en producción. Lista completa en Anexo A (incluye: `configuracion/coberturas-aseguranza` ×4, `catalogo-procedimientos` ×4, `catalogo-estudios` ×4, `matriz-costos` POST/PUT/DELETE, `notificaciones` GET/PATCH, `unread-count`, `cirugias/roles`, `cirugias/recursos`, `cirugias/[id]` GET, `inventario/disponible`, `cirugias` GET, `consultas/[id]` PATCH). *Fix:* helper compartido `handleSupabaseError(error, contexto)` que loguea y traduce (ya existe `errorTranslations`).
- **[Alto] ERR.HIS.1** `api/consultas/[id]/historial/route.ts:54` — `request.json()` sin try/catch (body inválido → 500 sin mensaje). *Fix:* patrón try/catch estándar (igual que otras rutas).
- **[Alto] ERR.UI.1** — **No existe ningún Error Boundary** en `src/app` (sin `error.tsx`): un throw en render de cualquier página client tumba toda la app. *Impacto directo en módulos críticos (Cobros/Consultas/Inventario).* *Fix:* `src/app/error.tsx` global + `error.tsx` por segmento crítico, en español, con botón reintentar.
- **[Alto] ERR.UI.2** — `catch(() => {})` silenciosos en cargas de datos visibles: `consultas/nueva/page.tsx:232-243` (matriz de costos, tipo de cambio, aseguranzas), `pacientes/page.tsx:77-78`, `productividad/page.tsx:185`, `mi-perfil/page.tsx:45,48`. *Impacto:* formularios que cargan vacíos sin aviso (el usuario cree que no hay aseguradoras). *Fix:* estado de aviso "algunos catálogos no cargaron" + reintentar.
- **[Alto] ERR.PAC.1** `api/pacientes/[id]/route.ts` — **no existe PATCH/PUT para editar un paciente**: la edición desde UI no tiene endpoint (verificar si la ficha es solo lectura — hallazgo de gap funcional). *Fix:* implementar PATCH con zod si el flujo de edición existe en UI.
- **[Alto] ERR.HOOK.1** `AgendaContent.tsx:1707-1724` — `useState(() => { …fetch… })`: side-effect dentro del inicializador de estado (anti-patrón; fuera del ciclo de vida, no re-entrante). *Fix:* mover a `useEffect`.
- **[Medio] ERR.LOG.1** — 5 endpoints devuelven `error.message` de Supabase **sin traducir ni sanitizar** al cliente (`notificaciones/preferencias:26`, `catalogo-servicios:55`, `aseguranzas/servicios:47,84,117`, `consultas/[id]/historial:24,71`, `usuarios/me:94`). *Fix:* pasar por `errorTranslations`.
- **[Bajo] ERR.ES.1** `api/configuracion/usuarios/route.ts:283` — `'Missing user ID'` en inglés (resto en español). *Fix:* `'Falta el ID del usuario'`.

---

## E. CALIDAD DE CÓDIGO / CONSISTENCIA

- **[Medio] CAL.DUP.1** — Duplicados consolidables: `normalize` ×3 (`aseguranzas/servicios/route.ts:22`, `aseguranzas/servicios/import:5`, `agenda/import:124`), `parseCsv` ×2 (`agenda/import:9`, `aseguranzas/servicios/import:10`), `getInitials` ×4 con firmas distintas (`consultas/nueva:129`, `configuracion/usuarios:40`, `configuracion/doctores:52`, `useUser:19`), `formatBytes` ×2, `crearNotificacion` ×2 (`api/inventario:7-24`, `api/consultas:10-27` — ignorando el servicio existente `services/notificaciones`). *Fix:* `src/lib/text.ts` + usar `services/notificaciones`.
- **[Medio] CAL.SEL.1** — SELECT de `agenda_cirugias` duplicado en 3 módulos con columnas distintas (`productividad/reportes/cirugias:35-40`, `api/agenda:80-85`, `api/cirugias:19-22`) — añadir una columna obliga a tocar 3 puntos. *Fix:* constante compartida `SELECT_CIRUGIA_LISTA`.
- **[Medio] CAL.API.1** — **4 formatos de listado** distintos: `{data,total,page,pageSize}` (pacientes/consultas/inventario/agenda), array directo (todos los GET de configuración), `{data}` wrapper (notificaciones, cirugias, historial), `{results}` (search). *Fix (retrocompatible):* documentar contrato actual por módulo en el ERD; no unificar de golpe sin actualizar consumidores.
- **[Medio] CAL.TIP.1** — `as any`/`: any`: 10 archivos, top: `api/consultas/route.ts` (8), `consultas/[id]` (4), `agenda/route.ts` (4). Cero `@ts-ignore` ✓. *Fix:* tipar joins con interfaces locales (ya iniciado en `consultas/[id]`).
- **[Bajo] CAL.IMP.1** — `tsconfig` excluye `src/migrations` del compilado → los cambios en migraciones no se validan con `tsc`. *Fix:* check de sintaxis vía `ts-node --transpile-only` en el test b1 (ya parcial en b12/b17).
- ✅ Sin TODO/FIXME/HACK; sin `@ts-ignore`.

---

## F. HALLAZGOS DE SESIÓN (contexto: cambios sin commitear)

- **[Crítico] SES.MIG.1** — Código ya selecciona `doctores.alias` en ~35 archivos; la migración 290/patch SQL **aún no está aplicada en la BD remota** → el módulo de doctores (y cualquier join) devolverá error 500 hasta aplicarla. *Fix:* correr `sql/patch-doctores-alias.sql` (dependencia dura para Fase 3 en módulo Configuración).
- **[Alto] SES.ESQ.1** — **Dualidad de esquema en `inventario_items`**: el código de inventario usa `manufacturer/model/sphere` mientras migraciones/otras rutas usan `marca/modelo/grado_esferico`; múltiples endpoints implementan cascadas de fallback ad-hoc (`inventario/disponible`, `cirugias/[id]`, `dashboard-data`). *Fix:* decidir el esquema canónico, migrar datos y eliminar los fallbacks (pasa por `docs/ERD.md`).
- **[Medio] SES.EST.1** — Ciclo de vida de `consultas.estatus` cambió (nacen `AGENDADA`); consultas históricas siguen `PROCESADA` → el mapa `PROCESADA→completada` en agenda mezcla semántica vieja/nueva en reportes. *Fix:* data-migration opcional `PROCESADA→COMPLETADA` o filtro documentado.
- **[Medio] SES.RPC.1** — RPC `crear_consulta` (mig 160) existe pero el código inserta directo; riesgo de divergencia. *Fix:* eliminar RPC o usarlo.
- **[Bajo] SES.SW.1** — `public/sw.js` cachea respuestas GET de `/api/*` no excluidas explícitamente (`EXCLUDE_PATHS` solo auth/notificaciones) → riesgo de stale data clínica en PWA offline. *Fix:* network-first ya está; añadir `Cache-Control: no-store` a APIs con PII.

---

## Matriz por módulo de negocio (top hallazgos)

| Módulo | Críticos | Altos | Medios |
|---|---|---|---|
| Productividad/Honorarios | PERF.PROD.1, PERF.RES.1, PERF.DEV.1, ERR.1 (logs) | ERR.UI.1 (Error Boundary) | CAL.DUP.1, índices compuestos |
| Cirugías/Agenda | SES.MIG.1 (afecta joins doctor) | SEC.CIR.1/2/3, PERF.IMP.1/2, ERR.HOOK.1 | SEC.VAL.4, SEC.IMP.1 |
| Consultas | — | ERR.PAC.1 (pacientes PATCH), SEC.CON.1, PERF.CON.1 | SEC.VAL.3, PERF.CON.2 |
| Inventario | — | SES.ESQ.1 (dualidad) | PERF.IDX.1, SEC.CIR.5 |
| Pacientes | — | SEC.PAC.1, ERR.PAC.1 | PERF.PAC.1 |
| Configuración | SES.MIG.1 | SEC.VAL.2 | CAL.API.1, SEC.VAL.4 |
| Dashboard/Global | — | ERR.UI.1/2 | PERF.FE.1, SEC.RL.1, SEC.CSP.1 |

## Anexo A — Endpoints sin log de error (ERR.1, evidencia completa)
`configuracion/coberturas-aseguranza:38,86,121,146` · `catalogo-procedimientos:31,63,98,123` · `catalogo-estudios:31,63,98,123` · `matriz-costos:67,102,127` · `notificaciones:26,64` · `notificaciones/unread-count:17` · `cirugias/recursos:18` · `cirugias/roles:17` · `cirugias/[id]:86` · `inventario/disponible:124` · `cirugias:33` · `consultas/[id]:310` · `honorarios-settings:26,106` · `cirugias/[id]/productividad:18`.

---

**Fin de Fase 1.** Siguiente: Fase 2 — `REFACTOR_PLAN.md` (orden por dependencia técnica, mapeo hallazgo → cambio → tests de regresión). Pausa pendiente de confirmación.
