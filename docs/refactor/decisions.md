Decisiones Arquitectónicas del Refactor

Este archivo contiene decisiones que deben considerarse permanentes
hasta que exista una nueva decisión explícita que las reemplace.

Los modelos deben leer este archivo antes de proponer cambios
arquitectónicos.

DEC-001 — Seguridad primero

Estado:

APROBADA

La seguridad tiene prioridad sobre:

performance;
deduplicación;
limpieza;
arquitectura.

No continuar con refactors grandes mientras existan vulnerabilidades
críticas conocidas.

DEC-002 — Cambios incrementales

Estado:

APROBADA

El refactor debe ejecutarse en pasos pequeños.

Cada paso debe:

modificar una responsabilidad concreta;
ejecutar typecheck;
ejecutar tests;
revisar diff;
documentar problemas.

Evitar cambios gigantes difíciles de revisar.

DEC-003 — No implementar documentación inexistente

Estado:

APROBADA

La documentación actual contiene arquitectura y endpoints que no
existen.

No implementar automáticamente una arquitectura únicamente porque
aparece en la documentación.

Primero determinar si aporta valor.

DEC-004 — TypeORM

Estado:

PENDIENTE

Decisión pendiente entre:

A — eliminar TypeORM
B — implementarlo realmente

No eliminar TypeORM antes de tomar esta decisión si existen procesos
que dependan de él.

DEC-005 — Supabase

Estado:

APROBADA PROVISIONALMENTE

La implementación actual utiliza Supabase como acceso principal a datos.

No crear Repository/Service/TypeORM únicamente por razones estéticas.

La arquitectura definitiva se decidirá en Fase 5.

DEC-006 — SERVICE_ROLE

Estado:

APROBADA

SERVICE_ROLE nunca debe considerarse un mecanismo de autorización.

Toda operación sensible debe pasar por:

Authentication
↓
Authorization
↓
Validation
↓
Database

DEC-007 — Validación

Estado:

APROBADA

Los datos provenientes de requests deben validarse antes de llegar
a la base de datos.

Zod será el mecanismo principal de validación de request bodies
cuando sea apropiado.

DEC-008 — Tipos

Estado:

APROBADA

Evitar múltiples interfaces que representen la misma entidad.

Preferir tipos compartidos y DTOs explícitos cuando las formas
realmente sean diferentes.

DEC-009 — Seguridad de datos sensibles

Estado:

APROBADA

Nunca enviar al cliente campos sensibles innecesarios.

Especialmente:

password hashes;
secrets;
tokens;
información interna de BD;
PHI innecesaria.
DEC-010 — Errores

Estado:

APROBADA

Los errores internos no deben exponerse directamente al cliente
en producción.

Las respuestas API deben ser seguras y consistentes.

DEC-011 — DELETE

Estado:

APROBADA PROVISIONALMENTE

Las entidades sensibles deben evaluarse para soft-delete y
auditabilidad.

No convertir todos los DELETE automáticamente.

La decisión debe considerar:

relaciones;
integridad;
requisitos del negocio;
auditoría.
DEC-012 — Performance

Estado:

APROBADA

Preferir:

server-side pagination
server-side search
server-side filtering

sobre descargar datasets completos al navegador.

DEC-013 — Duplicación

Estado:

APROBADA

No crear abstracciones únicamente para reducir cantidad de líneas.

Una abstracción debe:

reducir complejidad;
mejorar consistencia;
ser reutilizable;
mantener claridad.
DEC-014 — Server Components

Estado:

APROBADA PROVISIONALMENTE

Las páginas de solo lectura deben evaluarse para migración a
Server Components.

No eliminar use client automáticamente.

DEC-015 — Modelos de IA

Estado:

APROBADA

Usar modelos según la dificultad.

GPT 5.6 Luna:

arquitectura;
seguridad;
decisiones;
debugging difícil;
revisión;
auditoría.

Qwen3.7 Plus:

implementación compleja;
performance;
cambios que requieren comprensión del proyecto.

MiMo-V2.5:

limpieza;
deduplicación;
tareas mecánicas;
implementación claramente especificada.
DEC-016 — Flujo de trabajo con IA

Estado:

APROBADA

Usar:

GPT 5.6 Luna
↓
plan
↓
archivo docs/refactor/\*.md
↓
modelo de menor costo
↓
implementación
↓
tests
↓
GPT 5.6 Luna
↓
review

No enviar toda la auditoría original a cada modelo.

Cada modelo debe leer únicamente los documentos necesarios para
su tarea.

DEC-017 — No mezclar fases

Estado:

APROBADA

Durante una tarea:

no arreglar problemas no relacionados;
no hacer refactors oportunistas;
no modificar fases futuras;
no cambiar arquitectura sin autorización.

Si se descubre un problema nuevo:

documentarlo;
clasificarlo;
asignarlo a una fase;
continuar con la tarea actual si es seguro.
DEC-018 — Estado

Estado de ejecución:

Fase 0 — PENDIENTE
Fase 1 — PENDIENTE
Fase 2 — PENDIENTE
Fase 3 — PENDIENTE
Fase 4 — PENDIENTE
Fase 5 — PENDIENTE
Auditoría final — PENDIENTE

Actualizar este archivo cuando una fase cambie de estado.

Registro de nuevas decisiones

Cuando aparezca una decisión arquitectónica nueva:

DEC-XXX

Estado:
PROPUESTA / APROBADA / RECHAZADA / REEMPLAZADA

Decisión:
...

Motivo:
...

Consecuencias:
...

Fecha:
...

DEC-019 — Matriz S3 de autorización por roles

Estado:

APROBADA — lista para implementación en S3

Contexto:

La matriz original de `docs/refactor/01-security.md`, líneas 237-278,
marcaba `AUTH` genérico para `admin`, `doctor` y `recepcionista` en todas
las operaciones, sin diferenciar por rol ni por operación. Esta decisión
reemplaza esa matriz con autorización diferenciada por área y método.

Roles existentes:

- `admin`
- `doctor`
- `recepcionista`

No se crea ni se incorpora un rol `inventario`. Las tareas de inventario
corresponden al rol `recepcionista` según esta decisión.

Matriz:

| Área | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| Usuarios | `admin` | `admin` | `admin` | `admin` |
| Configuración: proveedores, aseguranzas, categorías-lentes y doctores | `admin`, `doctor`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` |
| Cobros | `admin`, `doctor`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` |
| Inventario | `admin`, `doctor`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` |

Reglas adicionales:

- En Configuración, Cobros e Inventario, `doctor` tiene solo lectura.
- En Usuarios, todas las operaciones están restringidas a `admin`.
- La autorización debe ejecutarse server-side usando el rol obtenido de una
  fuente confiable del servidor.
- Un rol enviado por el cliente no determina la autorización.
- Una sesión válida sin el rol requerido recibe `403`.
- La identidad del actor se obtiene de la sesión, no de `user_id` enviado por
  body, query string o headers.
- `SERVICE_ROLE` no es un mecanismo de autorización.

Consecuencias:

- S3 puede implementar guards por rol conforme a esta matriz.
- S4 debe mantener la administración de usuarios restringida a `admin`.
- Las operaciones de inventario no requieren crear un cuarto rol.
- `docs/refactor/01-security.md` se actualizará después de verificar la
  implementación S3 contra esta decisión.

Fecha:

2026-09-07

DEC-022 — Cierre de IDOR de recursos compartidos e integridad referencial

Estado:

APROBADA — IDOR-3 a IDOR-9 cerrados; IDOR-10/11/12 listos para implementación como validación referencial

Contexto:

La auditoría S6 documentó 12 hallazgos IDOR. Tras revisión de negocio se
determinó que el sistema es single-tenant y pertenece a una sola clínica
óptica, sin fronteras de ownership entre admin, doctor y recepcionista.

Hallazgos cerrados por decisión de negocio:

- IDOR-3 (GET de paciente por UUID): cerrado. Cualquier rol autenticado puede
  consultar cualquier paciente; es el comportamiento operativo deseado.
- IDOR-4 e IDOR-5 (PATCH/DELETE de inventario por ID): cerrados. `admin` y
  `recepcionista` pueden editar o eliminar cualquier lente.
- IDOR-6 (doctores), IDOR-7 (aseguranzas), IDOR-8 (categorías) e IDOR-9
  (proveedores): cerrados. Son recursos compartidos de catálogo sin ownership
  individual.

Estos hallazgos quedan registrados como evaluados y cerrados por decisión de
negocio, sin cambio de código.

Hallazgos redefinidos como integridad referencial:

- IDOR-10 (POST consultas): antes de crear la consulta, verificar server-side
  que `paciente_id` y `doctor_id` existan en sus tablas respectivas. Si alguno
  no existe, rechazar con `400` o `404`.
- IDOR-11 (creación de cobro dentro de POST consultas): verificar que el
  `paciente_id` usado para el cobro coincida con el `paciente_id` de la consulta
  recién creada, sin aceptar un valor arbitrario del body.
- IDOR-12 (POST cobros): verificar server-side que `consulta_id`,
  `paciente_id` y `aseguranza_id` si se envía existan en sus tablas respectivas,
  y que `paciente_id` corresponda al paciente de la `consulta_id` referenciada.

Estas reglas son de existencia y consistencia relacional, no de ownership.

Fecha:

2026-09-07

DEC-021 — Protecciones S4 para usuarios y administradores

Estado:

APROBADA — lista para implementación en S4

Contexto:

S4, documentado en `docs/refactor/01-security.md`, exige self-service y
protecciones para usuarios administradores que DEC-019 no contemplaba de
forma explícita. Esta decisión define la excepción y las protecciones
adicionales para el endpoint de usuarios.

Self-service:

- Cualquier usuario autenticado con rol `admin`, `doctor` o
  `recepcionista` puede ejecutar `PATCH /api/configuracion/usuarios` sobre
  su propio ID (`auth.user.id`).
- En self-service solo puede modificar `nombre` y `password`.
- `rol`, `activo` y cualquier otro campo no pueden modificarse mediante
  self-service. Si se envían, el servidor debe ignorarlos o rechazar la
  request.
- Un `id` enviado por el cliente no sustituye la identidad de la sesión.
- El `PATCH` administrativo sobre cualquier ID y cualquier campo aprobado,
  incluyendo `rol` y `activo`, permanece restringido a `admin`.

Protección de último admin:

- Un `DELETE` o un `PATCH` que establezca `activo = false` sobre el último
  usuario activo con `rol = 'admin'` debe rechazarse con `409 Conflict`.
- La comprobación debe ejecutarse server-side contando los usuarios activos
  con rol `admin` en el momento de la operación.
- Esta protección aplica incluso cuando la operación la realiza otro admin.

Protección de autorremoción de rol admin:

- Un usuario con rol `admin` no puede cambiar su propio rol a un valor
  distinto de `admin`, incluso mediante el PATCH administrativo.
- La restricción solo aplica a la auto-modificación del propio rol.
- Un admin puede cambiar el rol de otros usuarios, incluida la degradación
  de otro admin, sujeto a la protección de último admin.

Relación con DEC-019:

Esta decisión AMPLÍA DEC-019 en lo relativo a PATCH de usuarios; el resto de
DEC-019 permanece vigente sin cambios. La regla de solo `admin` para GET
general, POST y DELETE de usuarios se mantiene.

Fecha:

2026-09-07

DEC-020 — Matriz S3 para Pacientes y Consultas

Estado:

APROBADA — lista para implementación

Contexto:

DEC-019 cubrió Usuarios, Configuración, Cobros e Inventario, pero dejó
explícitamente fuera a Pacientes y Consultas, según la auditoría de S3.
Esta decisión completa la matriz de autorización para esas rutas.

Roles aplicables:

- `admin`
- `doctor`
- `recepcionista`

Matriz:

| Área | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| Pacientes (`src/app/api/pacientes/**`) | `admin`, `doctor`, `recepcionista` | `admin`, `doctor`, `recepcionista` | `admin`, `doctor`, `recepcionista` | `admin`, `doctor`, `recepcionista` |
| Consultas (`src/app/api/consultas/**`) | `admin`, `doctor`, `recepcionista` | `admin`, `doctor`, `recepcionista` | `admin`, `doctor`, `recepcionista` | `admin`, `doctor`, `recepcionista` |

Reglas adicionales:

- Los tres roles tienen el mismo nivel de acceso en Pacientes y Consultas.
- La autorización debe aplicar explícitamente `requireRole(user,
  ['admin', 'doctor', 'recepcionista'])` en cada handler existente.
- `requireRole` se usa aunque los tres roles estén permitidos para garantizar
  fail-closed.
- Un usuario con `activo = false`, sin perfil o con un rol fuera de los tres
  valores válidos recibe `403`.
- `requireAuth()` continúa siendo responsable de validar la sesión y devolver
  `401` cuando no existe.
- La autorización no depende de roles enviados por el cliente.

Consecuencias:

- S3 queda definido para las rutas de Pacientes y Consultas sin añadir un
  cuarto rol ni restricciones adicionales por rol.
- Ownership e IDOR permanecen fuera de esta decisión y corresponden a S6.

Fecha:

2026-09-07

DEC-024 — Estados independientes doctor.activo / usuario.activo

Estado:

APROBADA — sin acción de código requerida

Contexto:

La auditoría S8 de soft-delete de Doctores identificó que
`doctores.activo` y `usuarios.activo` son estados desacoplados sin
decisión documentada. Si un doctor se desactiva (`activo=false`), su
cuenta de usuario asociada (`usuario_id`) puede seguir activa, y
viceversa. Se requiere una decisión explícita sobre si son independientes
o si la desactivación de uno debe propagarse al otro.

Regla:

- `doctores.activo` y `usuarios.activo` son estados INDEPENDIENTES por
  diseño. No existe sincronización automática entre ellos.
- Desactivar a un doctor (soft-delete, `DELETE
  /api/configuracion/doctores`) NO desactiva automáticamente la cuenta
  de usuario asociada (`usuario_id`), y viceversa.
- Si se requiere desactivar ambos, un admin debe hacerlo explícitamente
  en dos operaciones separadas (PATCH/DELETE de doctores, y PATCH/DELETE
  de usuarios).
- La desactivación de un doctor sin desactivar su usuario es válida
  cuando un doctor deja de ejercer (pierde su estado "activo" como
  doctor en el catálogo clínico) sin que eso implique revocar su acceso
  al sistema.

Justificación:

Un doctor puede dejar de ejercer sin que eso implique necesariamente
revocar su acceso al sistema, o un admin puede querer gestionar ambos
estados por separado según el caso (ej. licencia temporal vs baja
definitiva).

Estado de implementación:

El código YA se comporta así (sin sincronización) y no requiere cambios.
Verificado en S8 DOCTORES AUDIT.

Fecha:

2026-09-07

DEC-023 — Auto-desactivación de admin por DELETE

Estado:

APROBADA — sin acción de código requerida

Contexto:

La auditoría S8 de soft-delete de Usuarios identificó un caso sin
decisión explícita: ¿puede un admin desactivarse a sí mismo vía DELETE
(soft-delete → `activo=false`)? DEC-021 cubre autorremoción de rol y
protección de último admin, pero no menciona explícitamente la
auto-desactivación.

Regla:

- Un usuario con `rol='admin'` PUEDE desactivar su propia cuenta
  (`DELETE`/soft-delete → `activo=false`), siempre que no sea el último
  admin activo.
- Esta operación queda sujeta a la misma protección `checkLastAdmin()`
  ya usada para PATCH y DELETE sobre cualquier usuario — no requiere
  ninguna verificación adicional.
- Esto es distinto de la autorremoción de ROL (DEC-021), que sigue
  prohibida sin excepción: un admin no puede cambiarse a sí mismo el
  `rol` a un valor distinto de `admin`, pero SÍ puede desactivarse
  (`activo=false`) a sí mismo si no es el último admin.

Relación con DEC-021:

Esta decisión AMPLÍA DEC-021 (que cubre autorremoción de rol) agregando
el caso de auto-desactivación; no reemplaza ninguna regla existente de
DEC-021. La protección de autorremoción de rol permanece intacta.

Estado de implementación:

El código YA cumple esta regla sin cambios necesarios. Verificado en
S8 USUARIOS AUDIT.

Fecha:

2026-09-07
