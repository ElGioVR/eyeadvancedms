# Plan de pruebas y evidencia de entrega — octubre 2026

Versión: master (commit de esta entrega) · Ambiente de prueba: `http://localhost:3000` (`npm run dev`) o el despliegue de Vercel de `master`.
Cada prueba: ejecutar los pasos, comparar con **Resultado esperado**, pegar la captura en **Evidencia** y marcar **OK / Falla**.

## 0. Preparación

| # | Paso | Estado |
|---|---|---|
| 0.1 | Aplicar en Supabase **en este orden**: `sql/conceptos-consultas-quirurgico.sql`, `sql/patch-cirugia-catalogo-quirurgico.sql`, `sql/patch-cirugia-quirofano.sql`, `sql/patch-cirugia-documentos-faltantes.sql`, `sql/patch-cirugia-procedimientos-qx.sql`, `sql/patch-lentes-logistica-supabase.sql`, `sql/patch-catalogo-quirurgico-precio.sql` | ☐ |
| 0.2 | Opcional (limpieza de honorarios previos a la regla «solo completadas»): `sql/patch-honorarios-solo-completadas.sql` | ☐ |
| 0.3 | Borrar `.next` y reiniciar `npm run dev` si aparece el error `reading 'call'` | ☐ |
| 0.4 | Usuarios de prueba: admin, recepción, doctor (con ficha de personal), enfermería (con ficha) | ☐ |
| 0.5 | Datos: 1 paciente con aseguradora (p. ej. Doctoralia), precio capturado en Configuración › Conceptos › Quirúrgico | ☐ |

---

## 1. Consultas

### 1.1 Crear consulta — `/consultas/nueva`
1. Buscar y elegir paciente, doctor, fecha y hora, estudios/procedimientos.
2. Observar la barra flotante inferior: dice «Falta: …» hasta completar y luego «✓ Todo listo para finalizar la consulta».
3. Pulsar **FINALIZAR CONSULTA**.

**Esperado:** no existe botón «Previsualizar»; la barra sigue visible al hacer scroll; al guardar vuelve a la pantalla de origen (ver 12). **Evidencia:** ☐ captura formulario · ☐ captura barra flotante

### 1.2 Editar consulta — `/consultas/{id}/editar`
1. Desde el detalle (`/consultas/{id}`) pulsar **Editar**.
2. Verificar título «Editar consulta», datos precargados, paciente no editable, **sin** campo «Costo total».
3. Cambiar un dato y **GUARDAR CAMBIOS**.

**Esperado:** guarda y regresa al detalle con el cambio. **Evidencia:** ☐ formulario precargado · ☐ detalle actualizado

### 1.3 Detalle de consulta — `/consultas/{id}`
**Esperado:** el nombre del paciente aparece **una sola vez** (tarjeta única con datos del expediente: expediente, edad, sexo, teléfono; «Mostrar más» muestra aseguradora, póliza, afiliación, email). Sin botones PDF/Excel/Word. **Evidencia:** ☐

### 1.4 Impresión membretada de consulta
1. En el detalle pulsar **Imprimir**.

**Esperado:** hoja carta con logo EyeAdvanced, «Consulta médica», folio y estado, recuadro del paciente, datos de la consulta, estudios/procedimientos, renglones «Indicaciones y receta», firma del médico y pie con fecha de emisión. Fondo blanco. **Evidencia:** ☐ vista previa de impresión (activar «Gráficos de fondo»)

---

## 2. Cirugías

### 2.1 Crear cirugía — `/cirugias/nueva`
1. Paciente → procedimiento quirúrgico (el precio sale del catálogo; **no** hay selector de «servicio de facturación») → ojo → fecha/hora → anestesia → participantes (cirujano obligatorio).
2. Pulsar **Validar y crear cirugía**.

**Esperado:** se crea con aseguradora Doctoralia sin error de «ningún procedimiento coincide». **Evidencia:** ☐

### 2.2 Archivos de apoyo
1. Sección 5: a la izquierda checklist de documentos requeridos, a la derecha zona de arrastrar y soltar; archivos cargados debajo.
2. El menú «Tipo de documento» solo ofrece: Consulta de medicina interna, Estudios de laboratorio, Consentimiento informado, Cálculo de lente (solo con lente) y «Otro…».

**Esperado:** layout de dos columnas en escritorio; apilado en móvil. **Evidencia:** ☐ escritorio · ☐ móvil

### 2.3 Flujo de creación completo
1. Adjuntar archivos y crear la cirugía.

**Esperado:** el botón muestra «Subiendo archivos (n/N)…» y luego «Cirugía creada · abriendo la agenda…» (nunca vuelve a «Validar y crear»); termina en `/agenda?fecha={fecha de la cirugía}`. **Evidencia:** ☐ progreso · ☐ agenda destino

### 2.4 Errores por campo
1. Dejar campos vacíos y pulsar crear → se marcan en rojo **solo** los campos faltantes con su motivo; resumen rojo arriba con enlaces; se desplaza al primero.
2. Provocar choque de horario (elegir una hora donde el médico tiene otra cita).

**Esperado:** se marcan hora de inicio, hora de fin y **únicamente** la persona ocupada, con el motivo («Ocupado: ya tiene una consulta de 10:00–10:15»). La fecha no se marca. **Evidencia:** ☐ campos faltantes · ☐ choque de horario

### 2.5 LIO — búsqueda por fabricante y modelo
1. En «Lente intraocular» elegir fabricante y modelo **sin** dioptría.

**Esperado:** lista las piezas de inventario de ese modelo; la potencia es opcional para filtrar. **Evidencia:** ☐

### 2.6 Editar cirugía — `/cirugias/{id}/editar`
**Esperado:** mismos campos precargados; guarda y regresa al detalle. **Evidencia:** ☐

### 2.7 Detalle e impresión de cirugía — `/cirugias/{id}`
**Esperado:** sin botones PDF/Excel/Word; **Imprimir** genera la hoja «Programación quirúrgica» con equipo quirúrgico, LIO, notas y firma del cirujano. **Evidencia:** ☐ detalle · ☐ impresión

### 2.8 Barra flotante
**Esperado:** en crear/editar cirugía y consulta la barra de acciones permanece fija al hacer scroll y en móvil queda arriba de la barra de navegación. **Evidencia:** ☐ escritorio · ☐ móvil

---

## 3. Honorarios (regla «solo completadas»)
1. Crear una consulta y una cirugía (estado agendada) → `/productividad` › Honorarios: **no** hay devengos de esas citas.
2. Marcar ambas como **Completada** → aparecen los devengos.
3. Regresar una a otro estado o cancelarla → el devengo no pagado se cancela.
4. `/productividad` › Sync: solo toma consultas/cirugías completadas.

**Evidencia:** ☐ antes · ☐ después de completar · ☐ después de cancelar

## 4. Catálogo quirúrgico con precio — `/configuracion/conceptos` › Quirúrgico
**Esperado:** cada procedimiento quirúrgico tiene precio editable; se puede capturar al crear. **Evidencia:** ☐

## 5. Aseguradoras — eliminar protegido (`/configuracion/conceptos`)
1. Pulsar la basura de una aseguradora → ventana pide **escribir el nombre exacto**.
2. Probar con una aseguradora con pacientes/cirugías → mensaje de bloqueo con la cantidad.
3. «Particular» no tiene opción de eliminar. Con rol no admin → el servidor rechaza.

**Evidencia:** ☐ ventana · ☐ bloqueo · ☐ eliminación correcta (sin uso)

## 6. Pacientes — `/pacientes`
**Esperado:** cada fila muestra, además de teléfono, expediente, sexo y edad, una segunda línea con fecha de nacimiento, correo y aseguradora (solo los que existan). **Evidencia:** ☐ escritorio · ☐ móvil

---

## 7. Agenda — `/agenda`

### 7.1 Permisos
**Esperado:** admin, recepción, doctor y **enfermería** pueden ver todo y crear/editar/mover/cancelar. **Evidencia:** ☐ con usuario enfermería

### 7.2 Filtro «Solo lo mío»
1. Con doctor o enfermería con ficha: marcar **Solo lo mío** (panel de filtros y botón rápido en móvil).

**Esperado:** filtra por su ficha; desmarcar vuelve a todo; se recuerda al recargar; admin y recepción no lo ven. **Evidencia:** ☐ escritorio · ☐ móvil

### 7.3 Editar desde el popover
1. Abrir una cita en la agenda → **Editar**.

**Esperado:** consulta/estudio → `/consultas/{id}/editar`; cirugía → `/cirugias/{id}/editar`. **Evidencia:** ☐

---

## 8. Ruta de navegación (trazabilidad de pantallas)

| Caso | Pasos | Esperado |
|---|---|---|
| 8.1 | Pacientes → Agendar → Consulta → **Cancelar** | Regresa a **Pacientes** (no a Agenda) |
| 8.2 | Agenda → cita → Editar → Cancelar | Regresa al detalle de la consulta |
| 8.3 | Pacientes → Historial → Volver | Regresa a Pacientes |
| 8.4 | Cualquier pantalla con encabezado | Muestra la ruta recorrida (p. ej. `Pacientes › Agenda ›`), cada paso es clicable |
| 8.5 | Entrar desde el menú lateral | Reinicia la ruta |
| 8.6 | Abrir un detalle en pestaña nueva / recarga en frío | «Volver» usa el destino por defecto |

**Evidencia:** ☐ por caso

---

## 9. Productividad › Trazabilidad — `/productividad` (pestaña **Trazabilidad**, solo admin)
1. Elegir rango de fechas (y opcionalmente doctor).
2. Revisar tarjetas (consultas, estudios, cirugías con % cancelación).
3. Recorrer: **Canceladas**, **Por aseguradora**, **Por consulta**, **Por estudio**, **Por procedimiento**, **Por proc. quirúrgico**.
4. Descargar cada sección en CSV, Excel y PDF.

**Esperado:** totales coinciden con la agenda del rango; «Sin registrar» donde no se capturó motivo/quién canceló. **Evidencia:** ☐ por sección · ☐ archivos descargados

---

## 10. Regresión rápida
| Ruta | Comprobar |
|---|---|
| `/dashboard` | Carga sin errores |
| `/consultas` | Lista y abre detalle |
| `/cirugias/pendientes` | Encabezado con ruta |
| `/inventario` | Plan de resurtimiento y lentes comprometidos |
| `/configuracion/*` | Carga y permisos por rol |
| Móvil (≤ 640 px) | Sin desbordes horizontales en las pantallas anteriores |

---

## Registro de resultados

| Prueba | Resultado (OK/Falla) | Responsable | Fecha | Notas |
|---|---|---|---|---|
| 1.1 – 1.4 | | | | |
| 2.1 – 2.8 | | | | |
| 3 | | | | |
| 4 – 6 | | | | |
| 7.1 – 7.3 | | | | |
| 8.1 – 8.6 | | | | |
| 9 | | | | |
| 10 | | | | |
