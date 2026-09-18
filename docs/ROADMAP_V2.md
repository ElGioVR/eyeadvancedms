# ROADMAP V2 — Checklist de Fases

> Generado por auditoría v2. Marcar [x] al completar cada fase.

---

## Fase 0 — Limpieza de documentación
- [x] Reescribir `docs/ERD.md` con modelo final (sin cobros, sin lentes viejo, sin matriz costos)
- [x] Actualizar `docs/ARCHITECTURE.md` con roles/permisos, notificaciones, detalle-como-página
- [x] Actualizar `docs/AI_CONTEXT.md` reflejando módulos actuales
- [x] Verificar `docs/CODE_STANDARDS.md` con convenciones de autorización y Kardex
- [x] Crear `docs/ROADMAP_V2.md` (este archivo)

---

## Fase 1 — Roles y permisos
- [x] Doctor solo lee/descarga su propia información (filtro por `session.doctor_id` en API)
- [x] `usuarios.preferencias` JSONB con `modo_focus`
- [x] Select en header para doctor-jefe: "Ver como: Todos / Solo mi información"
- [ ] Vinculación usuario-doctor en Configuración (buscar doctores sin `usuario_id`)

---

## Fase 2 — Consultas (ajuste sobre Fase 4 previa)
- [x] `consultas.estatus` → BORRADOR, PROCESADA, PENDIENTE_ESTUDIO, PENDIENTE_CIRUGIA, FINALIZADA
- [x] Columna independiente `estatus_pago` (PENDIENTE_PAGO, PAGADO)
- [ ] Quitar selector manual de aseguradora; mostrar read-only desde `paciente.aseguranza_id`
- [ ] Tabla estudios/procedimientos de aseguradora: Servicio · Costo · % Cobertura · Monto paciente
- [x] Validación horario: `hora_fin` default = `hora_inicio + 30min`; bloquear si `hora_fin < hora_inicio`
- [ ] Botón sync tipo de cambio USD→MXN (endpoint propio, caché 1h)
- [x] Arreglar botón imprimir (handler + layout `@media print`)
- [ ] Agregar acción "Editar" en menú de consulta
- [x] Renombrar `consulta_historial_estatus` → `consulta_historial` con `tipo_evento` ENUM
- [x] Detalle de consulta como página completa (`app/consultas/[id]/page.tsx`)
- [x] Eliminar módulo/pantalla de Cobros; pago desde `estatus_pago = PAGADO`

---

## Fase 3 — Honorarios (módulo completo)
- [x] Vista raíz: tabla doctores con métricas + botón CSV general
- [ ] Detalle doctor: doctor-jefe edita periodo y tarifas (tipo_calculo=PORCENTAJE); doctor ve solo lectura
- [x] Lista paginada de servicios del periodo, filtro por rango de fechas
- [x] Tabs métricas: pendientes, pagados, ganancias libres + gráfica tendencia (Recharts)
- [x] CSV del doctor: procedimientos, estudios, costos, paciente, consulta
- [x] Flujo automático intacto: servicio → honorario PENDIENTE → estatus_pago PAGADO → LISTO_PARA_PAGO → doctor-jefe paga

---

## Fase 4 — Inventario, Pacientes, Dashboard, Reportes
- [x] Inventario: alta en pasos (datos básicos → específicos por tipo → proveedor/categoría)
- [x] Autosugiere proveedor y categoría al detectar marca/modelo repetido
- [x] Pantallas CRUD de Proveedores y Categorías
- [x] Panel lateral (drawer) de Kardex al seleccionar ítem en la lista
- [x] Pacientes: botón "Agendar" con submenú Consulta/Cirugía
- [x] Filtro de pacientes por aseguradora
- [x] Dashboard: vista doctor (su info), selector doctor para admin/jefe
- [x] Dashboard: gráficas (consultas por estatus, honorarios por periodo, ocupación agenda, top procedimientos)
- [x] Reportes: rentabilidad por aseguradora, honorarios histórico, rotación LIO, Kardex consolidado, embudo consultas, ocupación agenda

---

## Fase 5 — Notificaciones
- [x] Tabla `notificacion_preferencias` + `notificaciones`
- [x] UI de configuración de preferencias en perfil de usuario
- [x] Eventos doctor: pago honorarios, recordatorio 10 min, asignación estudio/procedimiento
- [x] Eventos recepcionista: próxima cirugía, cancelación, posposición
- [x] Disparar desde capa de servicio (no triggers SQL)

---

## Fase 6 — Agenda y generales
- [x] Import CSV/XLSX: CSV de rechazados con motivo por fila + `agenda_import_log`
- [x] Validación de duplicados (paciente+fecha+hora o folio) antes de insertar
- [x] Detalle de cirugía como página estructurada (`app/agenda/[id]/page.tsx`)
- [ ] Filtro "mis operaciones" para doctor en agenda
- [ ] Vista móvil día/semana/mes con carrusel horizontal de fechas
- [ ] Homologar nombres: usar `cirugia` como entidad canónica interna
- [x] Auditoría: validación de formularios consistente (Zod), dark/light mode completo, experiencia móvil, "Recordarme" en login

---

## Estado actual

| Fase | Estado |
|------|--------|
| Fase 0 — Docs | ✅ Completada |
| Fase 1 — Roles | ⬜ Pendiente |
| Fase 2 — Consultas | ⬜ Pendiente |
| Fase 3 — Honorarios | ⬜ Pendiente |
| Fase 4 — Inventario/Pacientes/Dashboard | ⬜ Pendiente |
| Fase 5 — Notificaciones | ⬜ Pendiente |
| Fase 6 — Agenda/generales | ⬜ Pendiente |

---

*Última actualización: auditoría v2*
