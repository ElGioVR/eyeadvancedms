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
- [ ] `consultas.estatus` → BORRADOR, PROCESADA, PENDIENTE_ESTUDIO, PENDIENTE_CIRUGIA, FINALIZADA
- [ ] Columna independiente `estatus_pago` (PENDIENTE_PAGO, PAGADO)
- [ ] Quitar selector manual de aseguradora; mostrar read-only desde `paciente.aseguranza_id`
- [ ] Tabla estudios/procedimientos de aseguradora: Servicio · Costo · % Cobertura · Monto paciente
- [ ] Validación horario: `hora_fin` default = `hora_inicio + 30min`; bloquear si `hora_fin < hora_inicio`
- [ ] Botón sync tipo de cambio USD→MXN (endpoint propio, caché 1h)
- [ ] Arreglar botón imprimir (handler + layout `@media print`)
- [ ] Agregar acción "Editar" en menú de consulta
- [ ] Renombrar `consulta_historial_estatus` → `consulta_historial` con `tipo_evento` ENUM
- [ ] Detalle de consulta como página completa (`app/consultas/[id]/page.tsx`)
- [ ] Eliminar módulo/pantalla de Cobros; pago desde `estatus_pago = PAGADO`

---

## Fase 3 — Honorarios (módulo completo)
- [ ] Vista raíz: tabla doctores con métricas + botón CSV general
- [ ] Detalle doctor: doctor-jefe edita periodo y tarifas (tipo_calculo=PORCENTAJE); doctor ve solo lectura
- [ ] Lista paginada de servicios del periodo, filtro por rango de fechas
- [ ] Tabs métricas: pendientes, pagados, ganancias libres + gráfica tendencia (Recharts)
- [ ] CSV del doctor: procedimientos, estudios, costos, paciente, consulta
- [ ] Flujo automático intacto: servicio → honorario PENDIENTE → estatus_pago PAGADO → LISTO_PARA_PAGO → doctor-jefe paga

---

## Fase 4 — Inventario, Pacientes, Dashboard, Reportes
- [ ] Inventario: alta en pasos (datos básicos → específicos por tipo → proveedor/categoría)
- [ ] Autosugiere proveedor y categoría al detectar marca/modelo repetido
- [ ] Pantallas CRUD de Proveedores y Categorías
- [ ] Panel lateral (drawer) de Kardex al seleccionar ítem en la lista
- [ ] Pacientes: botón "Agendar" con submenú Consulta/Cirugía
- [ ] Filtro de pacientes por aseguradora
- [ ] Dashboard: vista doctor (su info), selector doctor para admin/jefe
- [ ] Dashboard: gráficas (consultas por estatus, honorarios por periodo, ocupación agenda, top procedimientos)
- [ ] Reportes: rentabilidad por aseguradora, honorarios histórico, rotación LIO, Kardex consolidado, embudo consultas, ocupación agenda

---

## Fase 5 — Notificaciones
- [ ] Tabla `notificacion_preferencias` + `notificaciones`
- [ ] UI de configuración de preferencias en perfil de usuario
- [ ] Eventos doctor: pago honorarios, recordatorio 10 min, asignación estudio/procedimiento
- [ ] Eventos recepcionista: próxima cirugía, cancelación, posposición
- [ ] Disparar desde capa de servicio (no triggers SQL)

---

## Fase 6 — Agenda y generales
- [ ] Import CSV/XLSX: CSV de rechazados con motivo por fila + `agenda_import_log`
- [ ] Validación de duplicados (paciente+fecha+hora o folio) antes de insertar
- [ ] Detalle de cirugía como página estructurada (`app/agenda/[id]/page.tsx`)
- [ ] Filtro "mis operaciones" para doctor en agenda
- [ ] Vista móvil día/semana/mes con carrusel horizontal de fechas
- [ ] Homologar nombres: usar `cirugia` como entidad canónica interna
- [ ] Auditoría: validación de formularios consistente (Zod), dark/light mode completo, experiencia móvil, "Recordarme" en login

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
