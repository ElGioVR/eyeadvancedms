# Modificaciones agenda (sep 2026) — cambios, despliegue y supuestos

Fuente: documento «Modificaciones agenda.docx» (puntos I–IV).

## Orden de despliegue (obligatorio)
Aplicar las migraciones **antes** de subir el código, primero en BD local desechable y luego tras revisión:

| Migración | SQL espejo | Qué hace |
|---|---|---|
| `1800000000320-AgendaSinEmpalmesConsultas` | `sql/patch-agenda-sin-empalmes.sql` | Trigger anti-empalmes (advisory lock, 23P01) + `consultas.permite_empalme` |
| `1800000000330-CreateCatEspecialidades` | `sql/patch-cat-especialidades.sql` | `cat_especialidades` + `consultas.especialidad_id` |
| `1800000000340-AddAnestesiaToAgendaCirugias` | `sql/patch-cirugia-anestesia.sql` | `agenda_cirugias.anestesia` |
| `1800000000350-AddCamposClinicosCirugia` | `sql/patch-cirugia-campos-clinicos.sql` | motivo, especialidad, tipo de LIO, `cirugia_procedimientos`, `cirugia_personal` |
| `1800000000360-CreateCatModelosLio` | `sql/patch-cat-modelos-lio.sql` | `cat_modelos_lio` + función `sembrar_cat_modelos_lio()` + `agenda_cirugias.modelo_lio_id` |
| `1800000000370-EquipoQuirurgicoHorarios` | `sql/patch-equipo-quirurgico.sql` | `personal_clinico`, horario por persona en `cirugia_personal`/`cirugia_participantes`, varias personas por rol |
| `1800000000380-LimpiarNombresModelosLio` | `sql/patch-limpiar-nombres-modelos-lio.sql` | Nombres de modelo de LIO sin código repetido |
| `1800000000390-PersonalUnificado` | `sql/patch-personal-unificado.sql` | Médicos y enfermería en `doctores` (`tipo_personal`, `cobra_honorarios`), rol de participante y de usuario «enfermero», migra `personal_clinico`/`cirugia_personal`, guardias de honorarios en BD |

Para el SQL Editor de Supabase: `sql/patch-modificaciones-agenda-supabase.sql` (las 5 en una transacción, ASCII, idempotente), `…-verificar.sql` y `…-revertir.sql`.

Sin la 330, `GET /api/agenda` falla (join a especialidad). Sin la 320, la importación de consultas falla (envía `permite_empalme`). El detalle de cirugía tolera la ausencia de 340/350.

## Cobertura
| Punto | Implementación |
|---|---|
| I.1 Datos generales | Nombre, edad, sexo, expediente (ya existían) + procedencia, motivo de consulta, especialidad |
| I.2 Diagnóstico | Campo propio precargado de la consulta de origen / última consulta |
| I.2 Cirugía | Procedimiento principal del catálogo + procedimientos adicionales |
| I.2 Faco + LIO | Al detectar Faco/LIO/catarata se ofrece tipo de LIO (monofocal/trifocal × tórico/no tórico) y el modelo del catálogo filtrado por ese tipo; el lente físico sigue saliendo del inventario |
| I.2 Ojo | OD / OS / OU (se guarda `OI`) |
| I.2 Anestesia | Local con sedación / Local / General (obligatoria) |
| I.2 Equipo | Sección homologada Rol · Persona · Entrada · Salida. Roles por defecto: cirujano (obligatorio), anestesiólogo, instrumentista, enfermero, circulante; «Agregar participante» para más. Médicos desde `doctores`, apoyo desde `personal_clinico` (Configuración → Personal clínico o alta rápida en la fila). Se valida que nadie quede en dos cirugías que se empalmen. |
| I.3 Archivos | Tipos predefinidos (medicina interna, exámenes complementarios, …) + «Otro» |
| II | Especialidad (catálogo único) + tipo: Primera / Subsecuente / Estudios / Procedimientos |
| III | Citas cada 15 min, sin empalmes del mismo médico (API + BD) |
| IV | Aplazar / reagendar / cancelar / agendar desde la agenda (escritorio y móvil) |

## Decisiones y supuestos (conservadores, pendientes de confirmar con la clínica)
1. **Procedencia** = texto libre del lugar de origen del paciente (como la columna PROCEDENCIA del Excel de cirugías, p. ej. «ENSENADA»).
2. **Motivo de consulta** se captura en la cirugía (no existe en consultas).
3. **«Agregar procedimientos»** = varios procedimientos del catálogo en una cirugía. El principal define productividad/honorarios; los adicionales son informativos. Dar de alta un procedimiento nuevo sigue siendo en Configuración → Aseguranzas → Servicios.
4. **Faco + LIO** se detecta por nombre del procedimiento; el tipo de LIO se ofrece y resalta pero **no bloquea** el guardado (el LIO ya es opcional).
5. **Modelo de LIO / ESCRS**: la ESCRS no publica un catálogo descargable (su recurso es la calculadora iolcalculator.escrs.org) y las condiciones de uso de IOLCon (iolcon.org) prohíben copiar o integrar sus datos en otro software. Se creó `cat_modelos_lio`, sembrado con los LIO del inventario (marcados «por verificar») y administrado en Configuración → Modelos de LIO (alta manual o CSV). El formulario de cirugía filtra el modelo por el tipo elegido (diseño × tórico). Verificar cada alta contra la ficha del fabricante o consultando IOLCon.
6. **Enfermero / instrumentista / circulante** (decidido 1-oct): se eligen de `personal_clinico`, con horario propio en la cirugía; se valida que no se empalmen con otra cirugía (verificación previa, sin lock en BD). No generan honorarios. Los nombres capturados antes como texto se migran a `personal_clinico`.
7. **Medicina interna**: aviso, no obligatorio.
8. **Sobrecupo**: bloqueo estricto; `consultas.permite_empalme` permite habilitar un override de admin más adelante.
9. Diagnóstico, anestesia y demás campos nuevos se guardan con UPDATE/INSERT inmediatamente después del RPC `crear_cirugia` (no se alteró su firma). Si alguno falla, la API devuelve `advertencia` y la UI la muestra.

## Pruebas
`npm run test:unit`, `npm run test:b23`, `npm run test:b24`. b9, b10, b11 y b19 ya fallaban antes de estos cambios.

## Personal unificado (1-oct-2026, decidido con Gio)
- **Una sola ficha de personal** (`doctores`, Configuración → «Personal médico»): `tipo_personal` MEDICO | ENFERMERO y `cobra_honorarios`. Enfermería se crea sin honorarios por defecto. La pestaña «Personal clínico» se retiró (redirige con filtro Enfermería).
- **Cirugía**: todo el equipo va a `cirugia_participantes` (roles cirujano, ayudante, anestesiólogo, instrumentista, enfermero, circulante). Mismo motor de agenda, conflictos y honorarios para todos. `personal_clinico` / `cirugia_personal` quedan como histórico migrado.
- **Honorarios**: solo para quien tiene `cobra_honorarios`. Guardia en BD (triggers en `eventos_honorario` y `cirugia_productividad`) para todos los caminos. Enfermería con honorarios puede realizar **estudios** y ser responsable de consultas **tipo Estudios**; procedimientos y consultas normales, solo médicos (validado también en `POST /api/consultas`).
- **Rol de usuario «enfermero» (restringido)**: ve solo su agenda (cirugías donde participa y estudios asignados) y, si cobra honorarios, «Mis honorarios»; sin acciones de edición, sin pacientes/inventario/configuración; el dashboard lo lleva a la agenda. Entra solo a endpoints que lo listan (agenda) o por su vínculo propio (`/api/usuarios/me`, mis-honorarios). Se vincula a su ficha desde «Personal médico».
- **Agenda**: el filtro por persona muestra su ocupación completa (cirujano principal o participante y estudios asignados); enfermería aparece en el filtro.

## Auditoría funcional (1-oct-2026)

- **LIO, duplicados al re-ejecutar:** el script combinado sembraba con la función vieja (sin limpiar nombres) antes de redefinirla; re-ejecutarlo dejaba un duplicado «Tecnis ZCB00 ZCB00». Ahora siembra una sola vez con la función que limpia, y la 380 (y sus scripts) desactiva (`activo = false`, sin borrar) el duplicado sucio no verificado cuando ya existe su versión limpia. `sql/patch-cat-modelos-lio-sembrar-supabase.sql` ahora incluye la limpieza: correrlo después de la 380 ya no la revierte.
- **Rol enfermero en APIs que solo pedían sesión:** `/api/dashboard`, `/api/dashboard/charts`, `/api/cirugias/[id]/productividad` y `/api/catalogo-servicios` responden 403 a `enfermero` (métricas, montos y precios).

## Permisos de enfermería ampliados (1-oct-2026, pedido de Gio)

| Módulo | Enfermería sin honorarios | Enfermería con honorarios |
|---|---|---|
| Agenda | Su ocupación (sin cambios) | Igual |
| Pacientes | Solo lectura: listado e historial, sin cobros, sin alta/edición ni agendar | Igual |
| Inventario | Oculto; API 403 | Ver, alta, edición, baja y movimientos (`requireRoleInventario`) |
| Configuración | Solo Perfil y Sistema (otras pestañas redirigen) | Igual |
| Búsqueda global | Solo pacientes | Pacientes y lentes |

Supuesto conservador: «ver pacientes» = solo lectura y sin montos. Fix móvil: el visor de adjuntos de la cirugía respeta el notch (safe-area), tiene botón «Cerrar» inferior y se cierra con «atrás».

## Importación masiva sin duplicados (1-oct-2026, mig. 400)

- `src/lib/import-agenda.ts` (normalización/validación) + `src/app/api/agenda/import/route.ts`.
- Duplicados: consulta = paciente + fecha + hora; cirugía = paciente + fecha + hora; aplazada = paciente + procedimiento. Se comparan sin mayúsculas/acentos/espacios, contra la BD y dentro del archivo.
- Doctores: alias sin distinguir mayúsculas ni títulos («Luis» = «LUIS», «IRINA» = «DRA IRINA»); palabra completa única («BAYARDO» → «DR BAYARDO GARZA»); ambiguo/inactivo/inválido → fila rechazada. Nuevos en MAYÚSCULAS con `pendiente_completar`. Config de Personal médico también guarda el alias en MAYÚSCULAS y rechaza duplicados (409). Índice único `uq_doctores_alias_ci` (solo si no hay repetidos).
- Pacientes: se crean una vez por nombre; el teléfono solo desempata homónimos (antes un teléfono compartido unía a otro paciente). Validación: nombre y apellido, sin números/símbolos. `pendiente_completar` si faltan sexo, fecha de nacimiento o teléfono; se quita sola al completar la ficha (historial → «Completar datos»).
- Fechas DD/MM/AAAA (México), horas y ojo inválidos se rechazan con motivo (antes: fecha inválida → aplazada en silencio; «MUJER» → masculino).
- CSV descargable de no importadas (FILA, MOTIVO DEL RECHAZO + columnas originales; se puede corregir y volver a importar) y CSV de duplicadas omitidas.
- Prueba de integración: `npm run test:import` (BD en memoria).
- Supabase: `sql/patch-import-sin-duplicados-supabase.sql` (también incluido en el combinado).
