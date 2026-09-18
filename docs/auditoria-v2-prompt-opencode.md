# EyeAdvanced MS — Auditoría v2 + Prompt Maestro para OpenCode

Este documento **extiende** `analisis-y-prompt-eyeadvancedms.md` (fases 1–5 ya definidas: aseguradoras/tarifario, inventario dual + Kardex, LIO en agenda, estatus + honorarios, autoguardado). Aquí audito el listado nuevo de observaciones, lo reconcilio con el modelo anterior (hay ajustes finos, no contradicciones), y cierro con un **prompt maestro por fases para OpenCode** que primero limpia `docs/` y después inyecta el código, para que el agente nunca trabaje con documentación desactualizada.

---

## 1. Auditoría por módulo

### Roles y permisos
| Observación | Acción |
|---|---|
| Asociación usuario↔doctor | `doctores.usuario_id` ya existe en el ERD original (1:1) — falta **forzarlo** en UI/servicios: todo query de "mi info" para rol `doctor` filtra por `usuario_actual.doctor_id`. |
| Doctor solo lee/descarga lo suyo | Middleware de autorización a nivel de `service` (no solo UI): cualquier endpoint de consultas/honorarios/agenda valida `doctor_id === session.doctor_id` si `rol === 'doctor'`; acciones de escritura bloqueadas, solo `GET` y export. |
| Rol Doctor-Jefe con "modo focus" | `doctor_jefe` ve **todo** por defecto (como admin). Agregar un **select en el header** ("Ver como: Todos / Solo mi información"), persistido en `usuarios.preferencias.modo_focus` (o localStorage). En focus=ON, todos los queries se filtran como si fuera `doctor` normal (mismas reglas de lectura); focus=OFF, recupera permisos completos incl. pago de honorarios. |

### Consultas
| Observación | Acción |
|---|---|
| Quitar selección manual de aseguradora | Coherente con la Fase 1 anterior: la aseguradora ya viene de `paciente.aseguradora_id`; en consulta se **muestra** (read-only, con link a "cambiar en expediente del paciente") pero no se selecciona ahí. |
| Ver aseguradora en info del paciente dentro de consulta | Card fijo en el panel lateral/header de la consulta con nombre de aseguradora + póliza. |
| Estatus ampliado | Ajusta el enum de la Fase 4 a los nombres que diste: `PROCESADA, PENDIENTE_ESTUDIO, PENDIENTE_CIRUGIA, FINALIZADA` (+ `BORRADOR` interno). **`pagado` se separa como columna/flag independiente** (`consultas.estatus_pago: PENDIENTE_PAGO | PAGADO`), no como parte del enum principal — es la que dispara honorarios (Fase 4 previa se mantiene funcionalmente igual, solo cambia el modelado: dos columnas en vez de una). |
| Validación de horario | `hora_fin` default = `hora_inicio + 30min` al crear; validación de formulario: bloquear submit si `hora_fin < hora_inicio`. |
| Mostrar estudios/procedimientos de la aseguradora con precio y % cobertura | Ya cubierto en Fase 1 (`aseguradora_servicios`); aquí es específicamente **requisito de UI**: tabla con columnas Servicio · Costo · % Cobertura · Monto paciente, separada en dos secciones (Estudios / Procedimientos). |
| Guardado local | Cubierto en Fase 5 anterior. |
| Sync de tipo de cambio USD→MXN | Botón junto al selector de moneda que llama a un endpoint propio `GET /api/fx/usd-mxn` (cachear 1h, usar API pública tipo Banxico/exchangerate-api) y actualiza el campo de conversión sin recargar. |
| Botón imprimir roto | Bug — revisar el handler y el layout de impresión (`@media print` o generación de PDF si usan una lib tipo `react-to-print`/`puppeteer`). |
| Falta acción "Editar" | Agregar al menú de acciones de la fila/detalle de consulta. |
| Falta historial de consulta | Tabla `consulta_historial` (ya prevista como `consulta_historial_estatus` en Fase 4) — **se amplía** para registrar no solo cambios de estatus sino: edición, cancelación, re-agendado, pagado, finalizado. Renombrar a `consulta_historial` con `tipo_evento` ENUM en vez de limitarlo a estatus. |
| Detalle de consulta: de modal/form a página completa | Nueva ruta `app/consultas/[id]/page.tsx` con: cabecera (paciente + aseguradora + estatus + pago), línea de tiempo de estatus (usa `consulta_historial`), detalle de servicios/estudios, y bloque "Cirugía relacionada" si `consulta.tipo === PROCEDIMIENTO` (jala de `cirugia_lio` / agenda). |

### Honorarios (módulo nuevo — especificación completa)
- **Vista raíz:** tabla de doctores con columnas `# Procedimientos · # Estudios · Honorarios pendientes ($) · Honorarios pagados ($)`, más botón **"Descargar CSV"** general (desglosado por doctor, procedimiento/estudio y total).
- **Detalle por doctor** (solo doctor-jefe edita, doctor ve el suyo en solo lectura):
  - Config: periodo de pago (semanal/quincenal/mensual/custom) y tarifas por estudio/procedimiento **en porcentaje**, editable solo por `doctor_jefe`.
  - Lista paginada de estudios/procedimientos realizados en el periodo activo, con filtro por rango de fechas o atajos (Hoy / Semana / Mes).
  - Tabs superiores con métricas: **Honorarios pendientes · Honorarios pagados · Ganancias libres de honorarios** (ingreso neto de la clínica sin la parte del doctor) + gráfica de tendencia (usa `chart_display_v0`-equivalente en frontend, ej. Recharts).
  - Botón **CSV del doctor**: procedimientos, estudios, costos, nombre del paciente, consulta asociada.
- Modelo: se mantiene `tarifario_honorarios` y `honorarios` de la Fase 4, agregando `tarifario_honorarios.tipo_calculo = PORCENTAJE` como default único (ya no monto fijo, según esta nota) y `doctores.periodo_pago_honorarios` (o tabla `doctor_periodo_pago` si va a tener histórico de cambios de periodo).

### Pacientes
- Botón "Agendar" abre selector: **Agendar consulta** / **Agendar cirugía** (cada una a su flujo correspondiente en Agenda).
- Detalle y listado general: mostrar aseguradora (ya definida en Fase 1).
- Filtro de lista de pacientes por aseguradora.

### Dashboard
- Rol `doctor`: muestra solo su propia información (próximas consultas, honorarios pendientes, etc.).
- Rol `doctor_jefe` / `admin` / `recepcionista`: selector de doctor para filtrar el dashboard completo.
- Agregar gráficas (consultas por estatus, honorarios por periodo, ocupación de agenda, top procedimientos).

### Reportes
Con el nuevo modelo de datos ya hay insumos para reportes de alto valor que antes no existían:
- **Rentabilidad por aseguradora** (costo cubierto vs. copago vs. honorarios pagados).
- **Honorarios por doctor y periodo** (ya cubierto en el módulo Honorarios, pero como reporte exportable histórico).
- **Rotación/uso de inventario LIO** (qué marcas/potencias se consumen más, quiebres de stock generados en cirugía — usa `inventario_movimientos` tipo `SALIDA_CIRUGIA`).
- **Kardex consolidado** por proveedor/categoría.
- **Embudo de consultas** (cuántas quedan en `PENDIENTE_ESTUDIO`/`PENDIENTE_CIRUGIA` sin avanzar, tiempo promedio a `FINALIZADA`).
- **Ocupación de agenda** por doctor/jornada.

### Inventario
- Eficientizar el alta de lentes: formulario dividido en pasos (datos básicos → específicos por tipo → proveedor/categoría) en vez de un formulario largo único; autocompletar campos repetidos (marca → sugiere proveedor y categoría si ya existe un ítem con esa marca/modelo, usando `LIKE`/trigram sobre `marca`+`modelo`).
- Pantallas propias de **Proveedores** y **Categorías** (ya existen como tablas en el ERD, faltaba UI de catálogo/CRUD visible).
- Panel de **historial al lado de la lista** (no solo tab en el detalle): al seleccionar un ítem en la tabla, un panel lateral (drawer) muestra su Kardex sin salir de la lista — mejor que la propuesta anterior de "tab" para flujos rápidos de bodega.

### Configuración
- Si existe un doctor sin usuario y se crea un usuario nuevo con rol `doctor`, mostrar un paso de **vinculación**: buscar doctores sin `usuario_id` y ofrecer ligarlo en vez de crear un doctor duplicado.
- **Eliminar** la pantalla "Matriz de costos/coberturas" de Configuración — es redundante porque la cobertura ahora vive en `aseguradora_servicios` (Fase 1). Cualquier dato existente ahí se migra a esa tabla y se borra la pantalla.
- **Eliminar** la sección "Honorarios" de Configuración — su función se mueve al detalle de doctor dentro del módulo Honorarios (tarifas y periodo de pago, editable solo por doctor-jefe).

### Notificaciones
- Nueva tabla `notificacion_preferencias` (usuario_id, tipo_evento, canal, activo) para que cada usuario elija qué recibe.
- Eventos por rol:
  - **Doctor:** pago de honorarios realizado; recordatorio 10 min antes de consulta/estudio/procedimiento; asignación de estudio/procedimiento (con nombre de paciente + deep link al detalle de consulta).
  - **Recepcionista:** próxima cirugía/estudio por iniciar y quién atiende; cancelación de consulta/cirugía; posposición/re-agendado.
- Implementación sugerida: tabla `notificaciones` (usuario_id, tipo, payload JSON, leida, created_at) + un job/cron ligero (o triggers de aplicación en los servicios de Consultas/Agenda) que inserta la notificación y, si aplica, push/email según `notificacion_preferencias`.

### Agenda
- **Import CSV/XLS:** al importar, generar automáticamente un **CSV de rechazados** con el mismo formato de inserción (para poder corregir y reinyectar) + motivo de rechazo por fila (fecha inválida, paciente no encontrado, duplicado, etc.).
- **Validación de duplicados:** antes de insertar, comparar por (paciente + fecha + hora) o folio; en el modal de importación, listar explícitamente qué cirugías del archivo ya existían y no se volvieron a insertar.
- **Detalle de cirugía:** vista estructurada completa para el doctor (paciente, diagnóstico, procedimiento, LIO usado por ojo, tiempos, notas) — reutiliza el patrón de "página" del detalle de consulta.
- **Filtro "mis operaciones"** cuando el usuario es doctor.
- **Móvil:** vista día/semana/mes + carrusel horizontal de fechas para navegar rápido (patrón típico de apps de calendario móvil).

### Homologación de términos
- Unificar en código y UI: "Agenda", "Procedimiento" y "Cirugía" deben referirse consistentemente a la misma entidad (`cirugia`/`agenda_cirugia`) — evitar que el mismo concepto tenga 3 nombres distintos en tablas, endpoints y componentes. Recomendación: usar **`cirugia`** como nombre canónico interno, y dejar "Agenda" solo como nombre del módulo/vista.

### Generales
- Auditar y completar validación de formularios en todos los módulos (mensajes de error consistentes, mismo patrón de validación — ideal centralizar con `zod` si no lo usan ya).
- Cobertura completa de dark/light mode en todos los componentes (auditoría visual módulo por módulo).
- Auditoría de experiencia móvil por módulo, modal y pantalla de creación.
- Login: agregar "Recordarme" (cookie/local de sesión extendida, no guardar contraseña en texto plano — usar refresh token de mayor duración si Supabase Auth lo soporta, o `remember_token`).

---

## 2. Ajustes al modelo de datos (delta sobre la Fase 1–5 previa)

| Tabla | Cambio |
|---|---|
| `consultas` | `estatus` se reduce a `BORRADOR, PROCESADA, PENDIENTE_ESTUDIO, PENDIENTE_CIRUGIA, FINALIZADA`; se agrega columna independiente `estatus_pago (PENDIENTE_PAGO, PAGADO)`. |
| `consulta_historial_estatus` | Se renombra `consulta_historial`, agrega `tipo_evento (CAMBIO_ESTATUS, EDICION, CANCELACION, REAGENDADO, PAGADO, FINALIZADO)`. |
| `tarifario_honorarios` | Se fija `tipo_calculo = PORCENTAJE` como único modo de esta fase. |
| `doctores` | + `periodo_pago_honorarios` (o tabla `doctor_periodo_pago` si necesitas histórico). |
| `usuarios` | + `preferencias JSONB` (incluye `modo_focus` para doctor-jefe). |
| `notificacion_preferencias` | **Nueva.** |
| `notificaciones` | **Nueva.** |
| `agenda_import_log` | **Nueva** — guarda cada intento de import (archivo, filas ok, filas rechazadas, usuario, fecha) para trazabilidad y para regenerar el CSV de rechazados. |
| Config "matriz de costos" | **Eliminar tabla/pantalla legacy** tras migrar datos a `aseguradora_servicios`. |
| Config "honorarios" | **Eliminar pantalla**, la data vive en `tarifario_honorarios` gestionada desde el módulo Honorarios. |

---

## 3. Limpieza de `docs/` (debe ejecutarse ANTES del código)

| Archivo | Acción |
|---|---|
| `docs/ERD.md` | Reescribir completo con el modelo final (tablas de ambos documentos: este + el anterior). Eliminar `cobros`, `lentes` viejo, matriz de costos. |
| `docs/ARCHITECTURE.md` | Agregar sección de roles/permisos (incl. modo focus doctor-jefe), capa de notificaciones, y el patrón "detalle como página" para Consultas/Cirugía. |
| `docs/AI_CONTEXT.md` | Actualizar el resumen de módulos y flujos para que un agente nuevo entienda: Cobros ya no existe, Honorarios es automático, Inventario es dual. |
| `docs/CODE_STANDARDS.md` | Verificar/anotar convención de autorización por rol a nivel de servicio (no solo UI), y convención de Kardex ("nunca UPDATE directo de stock"). |
| `docs/ROADMAP_V2.md` | **Nuevo** — checklist de las 2 fases de este proyecto (v2 y v2.1) para que el agente marque avance entre sesiones. |

---

## 4. Prompt maestro para OpenCode (fases 0–6)

> Revisa `opencode.json` y confirma que el modelo/proveedor configurado (el free tier que estés usando) tenga suficiente contexto para leer `docs/` completo antes de generar código — si el modelo trabaja con ventana corta, pídele que lea `docs/` por archivo, no todo de golpe.

```
Eres el agente de desarrollo del repo eyeadvancedms (Next.js 14 App Router,
TypeORM, PostgreSQL/Supabase). Este es un proyecto en producción real
(clínica oftalmológica), así que cada fase debe dejar el sistema funcional,
sin romper lo anterior. NO avances de fase sin confirmar conmigo.

FASE 0 — Limpieza de documentación (hazlo primero, siempre)
- Lee docs/ARCHITECTURE.md, docs/ERD.md, docs/AI_CONTEXT.md,
  docs/CODE_STANDARDS.md y el código actual en src/entities y src/repositories
  para confirmar el estado real (puede haber divergido de los docs).
- Reescribe docs/ERD.md con el modelo de datos final (ver "Ajustes al modelo
  de datos" de este documento + las fases 1-5 del análisis previo). Elimina
  del ERD: cobros, lentes (viejo esquema plano), matriz de costos/coberturas.
- Actualiza docs/ARCHITECTURE.md con: roles y permisos (doctor solo lee/
  descarga lo suyo; doctor-jefe con modo focus), capa de notificaciones,
  patrón de "detalle como página" para consultas y cirugías.
- Actualiza docs/AI_CONTEXT.md reflejando que Cobros no existe más,
  Honorarios es automático, Inventario es dual (visión + intraocular).
- Crea docs/ROADMAP_V2.md con checklist de las fases 1-6 de este prompt
  (marca [ ] pendiente / [x] hecho) — actualízalo al cerrar cada fase.
- Entrégame un resumen de qué cambiaste en docs/ antes de tocar código.

FASE 1 — Roles y permisos
- Fuerza en capa de servicio (no solo UI) que doctor solo lea/descargue
  su propia información (consultas, honorarios, agenda) vía
  session.doctor_id, comparando contra doctores.usuario_id.
- Agrega usuarios.preferencias JSONB con modo_focus. Implementa el select
  en el header para doctor_jefe: "Ver como: Todos / Solo mi información".
  En focus=ON aplica las mismas reglas de lectura que un doctor normal;
  focus=OFF restaura permisos completos (incl. pagar honorarios).
- En Configuración: si se crea un usuario rol=doctor y existen doctores sin
  usuario_id, ofrece vincular en vez de crear doctor duplicado.

FASE 2 — Consultas (ajusta lo ya construido en fases previas, no repitas)
- Ajusta consultas.estatus a: BORRADOR, PROCESADA, PENDIENTE_ESTUDIO,
  PENDIENTE_CIRUGIA, FINALIZADA. Agrega columna independiente
  estatus_pago (PENDIENTE_PAGO, PAGADO) que es la que dispara honorarios.
- Quita el selector manual de aseguradora en consulta; muéstrala read-only
  desde paciente.aseguradora_id, con link a editarla en el expediente.
- Tabla de estudios/procedimientos de la aseguradora del paciente con
  columnas Servicio · Costo · % Cobertura · Monto paciente.
- Validación de horario: hora_fin default = hora_inicio + 30min; bloquear
  si hora_fin < hora_inicio.
- Botón de sync de tipo de cambio USD→MXN junto al selector de moneda
  (endpoint propio con caché de 1h).
- Arregla el botón de imprimir (revisa handler y layout de impresión).
- Agrega acción "Editar" al menú de consulta.
- Renombra consulta_historial_estatus a consulta_historial y agrega
  tipo_evento (CAMBIO_ESTATUS, EDICION, CANCELACION, REAGENDADO, PAGADO,
  FINALIZADO); regístralo automáticamente desde la capa de servicio en
  cada acción correspondiente.
- Convierte el detalle de consulta de modal/formulario a página completa
  (app/consultas/[id]/page.tsx): cabecera con paciente+aseguradora+estatus,
  línea de tiempo con consulta_historial, detalle de servicios, y bloque de
  cirugía relacionada si aplica.
- Elimina definitivamente el módulo/pantalla de Cobros; verifica que el
  registro de pago (estatus_pago = PAGADO) se haga desde esta página.

FASE 3 — Honorarios (módulo completo)
- Vista raíz: tabla de doctores con # procedimientos, # estudios,
  honorarios pendientes, honorarios pagados; botón de descarga CSV general
  desglosado por doctor/servicio.
- Detalle de doctor: doctor_jefe puede editar periodo de pago y tarifas por
  estudio/procedimiento en porcentaje (tarifario_honorarios,
  tipo_calculo=PORCENTAJE); doctor ve su propio detalle en solo lectura.
  Lista paginada de estudios/procedimientos del periodo, filtro por rango
  de fechas o atajos (hoy/semana/mes).
- Tabs de métricas: honorarios pendientes, pagados, ganancias libres de
  honorarios + gráfica de tendencia.
- Botón CSV del doctor: procedimientos, estudios, costos, paciente,
  consulta asociada.
- Confirma que el flujo automático siga intacto: al agregar un servicio con
  doctor ejecutor se genera el honorario en PENDIENTE; al pasar
  estatus_pago a PAGADO se pasan a LISTO_PARA_PAGO; doctor_jefe los paga
  (individual o lote) generando recibo.

FASE 4 — Inventario, Pacientes, Dashboard, Reportes
- Inventario: divide el alta de ítems en pasos; autosugiere proveedor y
  categoría al detectar marca/modelo repetido; crea pantallas CRUD de
  Proveedores y Categorías; agrega panel lateral (drawer) de historial al
  seleccionar un ítem en la lista.
- Pacientes: botón "Agendar" con submenú Consulta/Cirugía; muestra
  aseguradora en detalle y listado; filtro de lista por aseguradora.
- Dashboard: vista propia para doctor (su info), selector de doctor para
  doctor_jefe/admin/recepcionista, agrega gráficas (consultas por estatus,
  honorarios por periodo, ocupación de agenda, top procedimientos).
- Reportes: agrega rentabilidad por aseguradora, honorarios por doctor y
  periodo, rotación de inventario LIO, Kardex consolidado, embudo de
  consultas, ocupación de agenda.

FASE 5 — Notificaciones
- Crea notificacion_preferencias y notificaciones. UI de configuración de
  preferencias en el perfil del usuario.
- Implementa los eventos: doctor (pago de honorarios, recordatorio 10 min
  antes, asignación de estudio/procedimiento con deep link); recepcionista
  (próxima cirugía/estudio y quién atiende, cancelación, posposición/
  reagendado). Dispáralos desde la capa de servicio de Consultas/Agenda,
  no desde triggers SQL.

FASE 6 — Agenda y generales
- Import CSV/XLS: genera CSV de rechazados con el mismo formato de
  inserción + motivo por fila; valida duplicados (paciente+fecha+hora o
  folio) y lístalos en el modal antes de insertar. Crea agenda_import_log.
- Detalle de cirugía como página estructurada; filtro "mis operaciones"
  para doctor; vista móvil día/semana/mes con carrusel de fechas.
- Homologa nombres: usa "cirugia" como entidad canónica interna en vez de
  mezclar agenda/procedimiento/cirugía en tablas y endpoints.
- Auditoría general: validación de formularios consistente (zod si aplica),
  cobertura completa de dark/light mode, revisión de experiencia móvil por
  módulo/modal, y "recordarme" en login.

Al cerrar cada fase: actualiza docs/ROADMAP_V2.md, corre lo que exista de
lint/typecheck/tests, y dame un resumen de archivos tocados antes de seguir.
```
