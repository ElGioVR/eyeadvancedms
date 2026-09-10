# Fase 1 — Plan de implementación de seguridad

## Estado y alcance

Este documento es un plan de implementación, no una implementación. La
inspección se realizó contra el código real de `src`, `package.json`,
`next.config.js` y las entidades TypeORM disponibles.

En esta ejecución no se modificó código. El único archivo que cambia en esta tarea es este documento.

La arquitectura real actual es:

```text
Browser Supabase client
        |
        v
Next middleware: refresca sesión y protege páginas, pero excluye /api
        |
        v
API route handler -> getSupabaseAdmin() -> Supabase con SERVICE_ROLE
```

El objetivo aprobado por `DEC-006` es:

```text
Request
  -> Authentication
  -> Authorization
  -> Validation
  -> Transform / allowlist
  -> Database
```

## Hallazgos que condicionan el plan

- `src/lib/supabase/middleware.ts`, líneas 44-66, llama `auth.getUser()` para navegación, pero excluye `/api` de la redirección de no autenticados.
- Los 10 route handlers de `src/app/api` llaman `getSupabaseAdmin()` antes de sus operaciones; no hay guard de autenticación o rol en los handlers.
- `src/lib/supabase/admin.ts`, líneas 5-10, crea un cliente con `SUPABASE_SERVICE_ROLE_KEY`.
- `src/hooks/useUser.ts`, líneas 37-45, carga el perfil con `select('*')` y obtiene el rol del perfil o metadata.
- `src/app/api/configuracion/usuarios/route.ts`, líneas 54-61 y 99-102, acepta `rol` desde el body para crear o actualizar usuarios.
- Las rutas de configuración, inventario y usuarios realizan operaciones por IDs recibidos en body o query string sin ownership ni autorización server-side.
- `src/app/api/pacientes/[id]/route.ts`, líneas 8-37, devuelve paciente, consultas y cobros asociados al ID recibido.
- No existen imports funcionales de Zod en `src`, aunque `zod` está declarado en `package.json`.
- Hay errores internos devueltos mediante `error.message` en varios handlers.
- La entidad `Usuario` contiene `password_hash`; el endpoint de usuarios lee el perfil con `select('*')` aunque no lo devuelve explícitamente.
- `src/config/data-source.ts`, líneas 13-18, usa `rejectUnauthorized: false`, pero TypeORM no participa actualmente en los handlers API según el baseline.
- `next.config.js`, líneas 15-29, tiene headers de seguridad, pero no CSP y define `camera=()`.
- El login usa `useState` para limitar intentos en `src/app/(auth)/login/page.tsx`, líneas 35-116; ese límite se pierde al recargar.
- No existe una dependencia ni un almacenamiento distribuido de rate limiting en `package.json`.

## Decisiones de diseño

### API pública

No hay webhooks, callbacks ni endpoints públicos confirmados en el repositorio.
Por tanto, la política propuesta es:

- `/login` y los recursos estáticos permanecen públicos.
- Los 10 route handlers API existentes requieren sesión válida.
- No se crea ningún endpoint nuevo.
- Si en el futuro aparece un webhook o callback, deberá añadirse explícitamente a una allowlist revisada, con autenticación propia y sin reutilizar automáticamente el guard de usuario.

### Respuesta para API no autenticada

Una request API sin sesión debe recibir `401` JSON, no un redirect HTML a `/login`.
Las páginas pueden continuar usando redirect a `/login`.

Esto implica que el middleware no debe convertir automáticamente una request `/api` en redirect. El guard dentro del route handler será la autoridad para la respuesta API; el middleware puede seguir refrescando cookies.

## Matriz real de permisos observados

### Alcance de la matriz

La matriz siguiente refleja el comportamiento efectivo del backend inspeccionado, no el comportamiento deseado. Los tres valores de rol existen en `src/entities/Usuario.entity.ts`, líneas 11-15, pero ningún route handler los consulta para autorizar.

Reglas generales:

- `AUTH` significa que basta una sesión válida.
- `NO EXISTE` significa que el handler HTTP no está definido.
- En la columna de roles, `AUTH` significa que los tres roles almacenados tienen el mismo acceso efectivo actual.
- No existe una autorización server-side por rol.
- La UI muestra roles, pero no los usa para ocultar navegación o controles.

| Endpoint / operación | admin | doctor | recepcionista |
|---|---:|---:|---:|
| `GET /api/pacientes` | AUTH | AUTH | AUTH |
| `POST /api/pacientes` | AUTH | AUTH | AUTH |
| `PATCH /api/pacientes` | NO EXISTE | NO EXISTE | NO EXISTE |
| `DELETE /api/pacientes` | NO EXISTE | NO EXISTE | NO EXISTE |
| `GET /api/pacientes/[id]` | AUTH | AUTH | AUTH |
| `POST /api/pacientes/[id]` | NO EXISTE | NO EXISTE | NO EXISTE |
| `PATCH /api/pacientes/[id]` | NO EXISTE | NO EXISTE | NO EXISTE |
| `DELETE /api/pacientes/[id]` | NO EXISTE | NO EXISTE | NO EXISTE |
| `GET /api/consultas` | AUTH | AUTH | AUTH |
| `POST /api/consultas` | AUTH | AUTH | AUTH |
| `PATCH /api/consultas` | NO EXISTE | NO EXISTE | NO EXISTE |
| `DELETE /api/consultas` | NO EXISTE | NO EXISTE | NO EXISTE |
| `GET /api/cobros` | AUTH | AUTH | AUTH |
| `POST /api/cobros` | AUTH | AUTH | AUTH |
| `PATCH /api/cobros` | NO EXISTE | NO EXISTE | NO EXISTE |
| `DELETE /api/cobros` | NO EXISTE | NO EXISTE | NO EXISTE |
| `GET /api/inventario` | AUTH | AUTH | AUTH |
| `POST /api/inventario` | AUTH | AUTH | AUTH |
| `PATCH /api/inventario` | AUTH | AUTH | AUTH |
| `DELETE /api/inventario` | AUTH | AUTH | AUTH |
| `GET /api/configuracion/usuarios` | AUTH | AUTH | AUTH |
| `POST /api/configuracion/usuarios` | AUTH | AUTH | AUTH |
| `PATCH /api/configuracion/usuarios` | AUTH | AUTH | AUTH |
| `DELETE /api/configuracion/usuarios` | AUTH | AUTH | AUTH |
| `GET /api/configuracion/doctores` | AUTH | AUTH | AUTH |
| `POST /api/configuracion/doctores` | AUTH | AUTH | AUTH |
| `PATCH /api/configuracion/doctores` | AUTH | AUTH | AUTH |
| `DELETE /api/configuracion/doctores` | AUTH | AUTH | AUTH |
| `GET /api/configuracion/aseguranzas` | AUTH | AUTH | AUTH |
| `POST /api/configuracion/aseguranzas` | AUTH | AUTH | AUTH |
| `PATCH /api/configuracion/aseguranzas` | AUTH | AUTH | AUTH |
| `DELETE /api/configuracion/aseguranzas` | AUTH | AUTH | AUTH |
| `GET /api/configuracion/categorias-lentes` | AUTH | AUTH | AUTH |
| `POST /api/configuracion/categorias-lentes` | AUTH | AUTH | AUTH |
| `PATCH /api/configuracion/categorias-lentes` | AUTH | AUTH | AUTH |
| `DELETE /api/configuracion/categorias-lentes` | AUTH | AUTH | AUTH |
| `GET /api/configuracion/proveedores` | AUTH | AUTH | AUTH |
| `POST /api/configuracion/proveedores` | AUTH | AUTH | AUTH |
| `PATCH /api/configuracion/proveedores` | AUTH | AUTH | AUTH |
| `DELETE /api/configuracion/proveedores` | AUTH | AUTH | AUTH |

### Interpretación y límites de la matriz real

- La aplicación actual no tiene endpoints `PATCH`/`DELETE` para pacientes, consultas o cobros; el plan no los inventa.
- `src/lib/supabase/server.ts`, líneas 53-61, solo verifica que exista un usuario Auth; no consulta `usuarios.rol` ni `usuarios.activo`.
- La tabla muestra permisos efectivos actuales, no permisos de negocio aprobados.
- Las entidades definen `admin`, `doctor` y `recepcionista`, pero no existe enforcement backend para diferenciarlos.
- Las páginas de configuración e inventario renderizan controles para cualquier usuario autenticado; no hay condición por rol.
- El dashboard y reportes no tienen API propia y muestran contenido mock; no se asigna aquí una política de negocio que el código no implementa.
- No hay endpoints `PATCH`/`DELETE` para pacientes, consultas o cobros; no se inventan.

## Cambios planificados

### S1 — Protección de los route handlers API

**Archivos afectados**

- `src/lib/supabase/middleware.ts`.
- `src/app/api/pacientes/route.ts`.
- `src/app/api/pacientes/[id]/route.ts`.
- `src/app/api/consultas/route.ts`.
- `src/app/api/cobros/route.ts`.
- `src/app/api/inventario/route.ts`.
- Las cinco rutas de `src/app/api/configuracion`.

**Funciones afectadas**

- `updateSession`.
- `GET`, `POST`, `PATCH` y `DELETE` existentes en cada route handler.

**Plan**

- Mantener el refresco de sesión Supabase en middleware.
- No usar redirect para API.
- Hacer que cada handler protegido invoque el guard antes de `getSupabaseAdmin()`.
- Dejar una allowlist explícita de excepciones vacía mientras no exista un endpoint público confirmado.
- Responder `401` JSON sin revelar si el recurso existe.

**Comportamiento esperado**

- Request sin sesión a cualquier API existente: `401`.
- Request con sesión válida: pasa al guard de autorización correspondiente.
- Página sin sesión: mantiene redirect a `/login`.

**Riesgos**

- Los consumidores actuales esperan `err.error` como string; se debe conservar esa forma durante esta fase para evitar un cambio de contrato innecesario.
- Si alguna integración externa usa una API sin sesión, quedará bloqueada; no hay integración pública confirmada en el repositorio y debe revisarse antes.

**Dependencias**

- S2 guard reutilizable.
- Inventario de endpoints públicos aprobado.
- Pruebas de usuario sin sesión.

### S2 — Guard reutilizable de autenticación y contexto

**Archivo afectado**

- `src/lib/supabase/server.ts`, que ya contiene el cliente server-side basado en cookies.

No se propone crear un archivo nuevo. La implementación puede ampliar el módulo existente con funciones internas/exportadas de guard, sujeto a revisión de nombres y tipos antes de codificar.

**Funciones afectadas**

- `createClient` existente.
- Nueva función planificada `requireAuth`.
- Nuevas funciones planificadas `requireRole` y `requireAnyRole`, o una única variante equivalente si reduce duplicación.

**Plan**

- `requireAuth` obtiene el usuario con el cliente server-side y `auth.getUser()`.
- Si no existe usuario, produce la respuesta `401` definida para API.
- Consulta el perfil mínimo necesario (`id`, `rol`, `activo`) sin `select('*')`.
- Rechaza perfiles ausentes, roles desconocidos o `activo = false` con `403` o `401` según la política final aprobada; no aplica fallback silencioso a `recepcionista` en rutas protegidas.
- Devuelve un contexto tipado con `authUser.id`, email y rol validado.
- `requireRole`/`requireAnyRole` compara contra una enum cerrada de `admin`, `doctor`, `recepcionista`.
- El guard no lee el rol desde body, query, metadata editable por cliente o UI.

**Comportamiento esperado**

- Todas las operaciones sensibles siguen `requireAuth -> requireRole -> parse/validate -> database`.
- El guard es usable desde los route handlers existentes sin crear una segunda vía de autenticación.

**Riesgos**

- La política RLS del perfil `usuarios` no está disponible en el repositorio.
  Consultarlo con el cliente anon puede fallar si RLS no permite la lectura.
- Consultar el rol con SERVICE_ROLE dentro del guard conserva el riesgo de privilegio, pero la consulta ocurre después de autenticar; debe quedar limitada a campos mínimos.

**Dependencias**

- S3 matriz aprobada.
- S7 estrategia de `getSupabaseAdmin`.
- Confirmación del esquema real de `usuarios` y de `activo`.

### S3 — Autorización server-side por operación

**Resultado del análisis real**

- S3 no está implementada.
- S1 exige autenticación, pero `requireAuth()` no distingue roles.
- Las 31 operaciones HTTP existentes tienen como política efectiva `AUTH` para
  `admin`, `doctor` y `recepcionista`.
- No se encontró ningún `requireRole`, comparación de `usuarios.rol`, permiso por
  endpoint ni control de ownership en backend.
- `SERVICE_ROLE` aparece en los handlers después de `requireAuth()`, pero no se
  usa para decidir el rol o el permiso.

**Matriz real por endpoint**

| Archivo | Ruta | Método | Operación observada | Autenticación | Rol efectivo | Ownership | Riesgo actual | Fase |
|---|---|---|---|---|---|---|---|---|
| `src/app/api/pacientes/route.ts` | `/api/pacientes` | GET | Lista pacientes y métricas de consultas | Requerida | Cualquier rol | No | Exposición de datos clínicos a cualquier usuario autenticado | S3/S6 |
| `src/app/api/pacientes/route.ts` | `/api/pacientes` | POST | Crea paciente | Requerida | Cualquier rol | No | Cualquier rol puede crear registros | S3 |
| `src/app/api/pacientes/route.ts` | `/api/pacientes` | PATCH | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/pacientes/route.ts` | `/api/pacientes` | DELETE | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/pacientes/[id]/route.ts` | `/api/pacientes/[id]` | GET | Devuelve historial clínico y cobros de un paciente | Requerida | Cualquier rol | No | Un UUID conocido permite consultar información de otro paciente | S3/S6 |
| `src/app/api/pacientes/[id]/route.ts` | `/api/pacientes/[id]` | POST | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/pacientes/[id]/route.ts` | `/api/pacientes/[id]` | PATCH | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/pacientes/[id]/route.ts` | `/api/pacientes/[id]` | DELETE | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/consultas/route.ts` | `/api/consultas` | GET | Lista consultas, pacientes y doctores | Requerida | Cualquier rol | No | Cualquier rol puede leer datos clínicos completos | S3/S6 |
| `src/app/api/consultas/route.ts` | `/api/consultas` | POST | Crea consulta y opcionalmente cobro | Requerida | Cualquier rol | No | Cualquier rol puede crear consulta y asociar IDs enviados | S3/S6 |
| `src/app/api/consultas/route.ts` | `/api/consultas` | PATCH | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/consultas/route.ts` | `/api/consultas` | DELETE | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/cobros/route.ts` | `/api/cobros` | GET | Lista cobros y datos financieros | Requerida | Cualquier rol | No | Doctores y cualquier usuario autenticado pueden leer finanzas | S3/S6 |
| `src/app/api/cobros/route.ts` | `/api/cobros` | POST | Crea cobro con IDs del body | Requerida | Cualquier rol | No | Cualquier rol puede crear cobros con relaciones arbitrarias | S3/S6 |
| `src/app/api/cobros/route.ts` | `/api/cobros` | PATCH | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/cobros/route.ts` | `/api/cobros` | DELETE | No existe | N/A | N/A | N/A | No aplica | N/A |
| `src/app/api/inventario/route.ts` | `/api/inventario` | GET | Lista o busca lentes | Requerida | Cualquier rol | No | Cualquier rol puede leer inventario | S3 |
| `src/app/api/inventario/route.ts` | `/api/inventario` | POST | Crea lente | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo e inventario | S3 |
| `src/app/api/inventario/route.ts` | `/api/inventario` | PATCH | Actualiza lente por ID | Requerida | Cualquier rol | No | Cualquier rol puede modificar registros por UUID | S3/S6 |
| `src/app/api/inventario/route.ts` | `/api/inventario` | DELETE | Borra lente por query ID | Requerida | Cualquier rol | No | Cualquier rol puede borrar inventario | S3/S6 |
| `src/app/api/configuracion/usuarios/route.ts` | `/api/configuracion/usuarios` | GET | Lista usuarios Auth y perfiles | Requerida | Cualquier rol | No | Cualquier rol puede enumerar usuarios y metadatos | S3/S6 |
| `src/app/api/configuracion/usuarios/route.ts` | `/api/configuracion/usuarios` | POST | Crea usuario Auth y perfil | Requerida | Cualquier rol | No | Cualquier rol puede crear cuentas y asignar rol desde body | S3 |
| `src/app/api/configuracion/usuarios/route.ts` | `/api/configuracion/usuarios` | PATCH | Modifica usuario, rol, activo o password por body ID | Requerida | Cualquier rol | No | Escalamiento de privilegios y modificación de otra cuenta | S3/S6 |
| `src/app/api/configuracion/usuarios/route.ts` | `/api/configuracion/usuarios` | DELETE | Borra perfil y usuario Auth por query ID | Requerida | Cualquier rol | No | Cualquier rol puede borrar otra cuenta | S3/S6 |
| `src/app/api/configuracion/doctores/route.ts` | `/api/configuracion/doctores` | GET | Lista doctores | Requerida | Cualquier rol | No | Lectura sin política de rol explícita | S3 |
| `src/app/api/configuracion/doctores/route.ts` | `/api/configuracion/doctores` | POST | Crea doctor | Requerida | Cualquier rol | No | Cualquier rol puede modificar configuración clínica | S3 |
| `src/app/api/configuracion/doctores/route.ts` | `/api/configuracion/doctores` | PATCH | Actualiza doctor por body ID | Requerida | Cualquier rol | No | Cualquier rol puede modificar configuración por UUID | S3/S6 |
| `src/app/api/configuracion/doctores/route.ts` | `/api/configuracion/doctores` | DELETE | Borra doctor por query ID | Requerida | Cualquier rol | No | Cualquier rol puede borrar configuración | S3/S6 |
| `src/app/api/configuracion/aseguranzas/route.ts` | `/api/configuracion/aseguranzas` | GET | Lista aseguranzas | Requerida | Cualquier rol | No | Lectura sin política de rol explícita | S3 |
| `src/app/api/configuracion/aseguranzas/route.ts` | `/api/configuracion/aseguranzas` | POST | Crea aseguranza | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo | S3 |
| `src/app/api/configuracion/aseguranzas/route.ts` | `/api/configuracion/aseguranzas` | PATCH | Actualiza aseguranza por body ID | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo por UUID | S3/S6 |
| `src/app/api/configuracion/aseguranzas/route.ts` | `/api/configuracion/aseguranzas` | DELETE | Borra aseguranza por query ID | Requerida | Cualquier rol | No | Cualquier rol puede borrar catálogo | S3/S6 |
| `src/app/api/configuracion/categorias-lentes/route.ts` | `/api/configuracion/categorias-lentes` | GET | Lista categorías | Requerida | Cualquier rol | No | Lectura sin política de rol explícita | S3 |
| `src/app/api/configuracion/categorias-lentes/route.ts` | `/api/configuracion/categorias-lentes` | POST | Crea categoría | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo | S3 |
| `src/app/api/configuracion/categorias-lentes/route.ts` | `/api/configuracion/categorias-lentes` | PATCH | Actualiza categoría por body ID | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo por UUID | S3/S6 |
| `src/app/api/configuracion/categorias-lentes/route.ts` | `/api/configuracion/categorias-lentes` | DELETE | Borra categoría por query ID | Requerida | Cualquier rol | No | Cualquier rol puede borrar catálogo | S3/S6 |
| `src/app/api/configuracion/proveedores/route.ts` | `/api/configuracion/proveedores` | GET | Lista proveedores | Requerida | Cualquier rol | No | Lectura sin política de rol explícita | S3 |
| `src/app/api/configuracion/proveedores/route.ts` | `/api/configuracion/proveedores` | POST | Crea proveedor | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo | S3 |
| `src/app/api/configuracion/proveedores/route.ts` | `/api/configuracion/proveedores` | PATCH | Actualiza proveedor por body ID | Requerida | Cualquier rol | No | Cualquier rol puede modificar catálogo por UUID | S3/S6 |
| `src/app/api/configuracion/proveedores/route.ts` | `/api/configuracion/proveedores` | DELETE | Borra proveedor por query ID | Requerida | Cualquier rol | No | Cualquier rol puede borrar catálogo | S3/S6 |

## Ownership detectado

No existe ownership aplicado por los handlers actuales.

- `Paciente` no tiene `usuario_id`, `owner_id` ni organización propietaria.
- `Consulta` tiene `paciente_id` y `doctor_id`, pero son relaciones del registro,
  no una comprobación del usuario autenticado.
- `Cobro` tiene `consulta_id` y `paciente_id`, pero el POST acepta ambos desde el
  body y no compara su relación antes de persistir.
- `Lente`, aseguranzas, categorías y proveedores no tienen owner de usuario.
- `Doctor` tiene `usuario_id` en la entidad TypeORM, pero ningún handler lo usa
  para autorización; además el schema remoto no está versionado en el repositorio.
- `Usuario.id` coincide conceptualmente con el ID de Auth, pero PATCH y DELETE
  aceptan IDs enviados por body/query sin comprobar actor o ownership.

Por tanto, todas las operaciones por UUID que modifican, eliminan o devuelven
datos específicos podrían requerir protección IDOR en S6. Conocer un UUID no es
ownership.

## Uso real del rol y controles de frontend

- `src/entities/Usuario.entity.ts`, líneas 11-15, define únicamente `admin`,
  `doctor` y `recepcionista`.
- `src/hooks/useUser.ts`, líneas 31-55, obtiene el usuario Auth desde Supabase y
  el rol desde `usuarios.rol`, con fallback a metadata Auth y después a
  `recepcionista`.
- `src/components/layout/Sidebar.tsx`, líneas 27-35 y 136-157, muestra todos
  los enlaces para cualquier usuario; el rol solo se presenta visualmente en
  líneas 168-172.
- `src/app/(dashboard)/configuracion/usuarios/page.tsx`, líneas 33-37 y
  398-400, ofrece los tres roles en el formulario y envía `rol` al API; no hay
  restricción por rol del usuario actual.
- Las páginas de configuración llaman POST/PATCH/DELETE directamente y no
  aplican controles de rol. La UI no es una frontera de autorización.

## Estado de autorización por tipo de operación

- Únicamente autenticación: todas las operaciones existentes en los 10 route
  handlers, según el código actual.
- Autorización por rol actualmente aplicada: ninguna.
- Ownership actualmente aplicado: ninguno.
- Operaciones que claramente requerirán privilegio elevado en S3: creación,
  modificación y eliminación de usuarios; creación/modificación/eliminación de
  doctores, aseguranzas, categorías y proveedores; mutaciones y DELETE de
  inventario; acceso a cobros según la política aprobada.
- Operaciones con política no clara de negocio: lectura de cobros por doctor,
  creación de pacientes por doctor, creación de consultas por recepcionista,
  edición de inventario por recepcionista y acceso de todos los roles a
  catálogos.

La documentación previa contenía una matriz propuesta distinta de esta realidad.
La matriz anterior no está implementada y no debe tratarse como permiso vigente.

### S4 — Protección de usuarios, roles y privilegios

**Archivo afectado**

- `src/app/api/configuracion/usuarios/route.ts`.

**Funciones afectadas**

- `GET`, `POST`, `PATCH`, `DELETE`.

**Plan**

- `GET`, `POST` y `DELETE`: solo `admin`.
- `PATCH` admin: permite únicamente campos administrativos aprobados y exige `id` UUID válido.
- `PATCH` self-service: el objetivo se deriva de `authUser.id`; el `id` enviado por el cliente no decide el objetivo. Solo permite nombre y password según la matriz; no permite cambiar rol, activo o privilegios.
- El rol nuevo debe salir de enum validada y nunca de una autorización basada en `body.rol`.
- Impedir que el último admin activo sea desactivado o eliminado requiere una regla de negocio explícita y prueba de concurrencia; no se debe inventar sin aprobación.

**Comportamiento esperado**

- Crear usuario, asignar roles, resetear passwords y eliminar cuentas requieren autorización de admin.
- Un usuario normal solo puede cambiar su propio nombre/password por el flujo limitado.
- Nunca se devuelve password, token ni `password_hash`.

**Riesgos**

- La operación actual crea Auth y perfil en pasos separados; puede quedar un usuario Auth sin perfil si falla el segundo paso.
- El borrado actual elimina primero el perfil y después Auth; una migración a desactivación debe preservar o documentar el comportamiento esperado.

**Dependencias**

- S2, S3, S5 y S8.
- Confirmación de política para el último admin.

### S5 — Schemas Zod y allowlists

**Archivo afectado**

- Cada route handler existente donde se consume `request.json()`.

No se propone crear un módulo de schemas nuevo en este plan porque no existe una carpeta de validación y el alcance debe ser incremental. Los schemas pueden vivir inicialmente junto a cada route handler; una extracción posterior requiere una segunda decisión de deduplicación.

**Schemas necesarios**

- `pacienteCreateSchema`: `nombre_completo`/`nombre`, `sexo`, `fecha_nacimiento`, `edad`, `telefono`, `email`, `direccion`, `contacto_emergencia` y `tel_emergencia`; no acepta columnas adicionales.
- `consultaCreateSchema`: `paciente_id`, `doctor_id`, `fecha`, `hora_inicio`, `hora_fin`, `tipo_consulta`, `tipo_visita`, `diagnostico`, `estudios`, `procedimiento`, `notas`, `aseguradora`, `metodo_pago`, `moneda` y `costo`.
- `cobroCreateSchema`: `consulta_id`, `paciente_id`, `aseguranza_id`, `metodo_pago`, `monto`, `moneda`, `pagado`, `folio` y `notas`.
- `lenteCreateSchema`: los campos actualmente construidos en líneas 86-105 de `inventario/route.ts`.
- `lentePatchSchema`: `id` más la allowlist actual de líneas 130-134.
- `usuarioCreateSchema`: email, password, nombre y rol enum; nunca `password_hash`, `activo` o un ID arbitrario.
- `usuarioAdminPatchSchema`: ID UUID, nombre, email, rol enum, activo y password solo donde la política de admin lo permita.
- `usuarioSelfPatchSchema`: únicamente nombre y/o password.
- `doctorCreateSchema` y `doctorPatchSchema`: los campos explícitos actualmente usados por esas operaciones.
- `aseguranzaCreateSchema` y `aseguranzaPatchSchema`: nombre, teléfono, dirección, contacto y, para admin, activo.
- `categoriaCreateSchema` y `categoriaPatchSchema`: nombre y descripción.
- `proveedorCreateSchema` y `proveedorPatchSchema`: nombre, teléfono, email, dirección, contacto y, para admin, activo.
- Query schemas para `id`, `barcode` y params dinámicos UUID donde corresponda.

**Reglas de validación**

- Parsear JSON como `unknown` y validar antes de cualquier acceso de propiedad.
- Usar `.strict()` o una estrategia equivalente que rechace campos no permitidos.
- Validar UUID, email, fecha, hora, enum, monto no negativo, límites de strings, arrays de estudios y tipos numéricos.
- Convertir exclusivamente después de validar, por ejemplo la representación de costo usada por la UI.
- Mantener las traducciones públicas existentes solo como mensajes seguros; no depender de comparar mensajes internos completos.

**Comportamiento esperado**

- Payload inválido: `400` con mensaje público estable.
- Campo adicional en payload: `400`, no se ignora silenciosamente para operaciones
- Ningún `body` se inserta directamente.

**Riesgos**

- Los schemas deben reflejar el contrato actual del frontend para no romper formularios; deben probarse contra los payloads de las páginas existentes.
- El esquema real de base de datos no está versionado en `src/migrations`; los límites exactos deben compararse con la base antes de fijarlos.

**Dependencias**

- La dependencia `zod` ya está declarada en `package.json`; no requiere añadir una dependencia nueva.
- S2/S3 antes de persistir datos.

### S6 — Auditoría IDOR y consistencia entre recursos

**Alcance auditado**

- Se inspeccionaron los 10 route handlers bajo `src/app/api`.
- No existen otros handlers con segmento dinámico `[id]` aparte de
  `src/app/api/pacientes/[id]/route.ts`.
- No se encontraron UUIDs en headers usados para identidad o ownership.
- Se encontraron IDs en params, query string y request bodies.
- Todos los handlers llaman `requireAuth()`; S2 solo verifica la sesión Auth en
  `src/lib/supabase/server.ts`, líneas 53-61.
- No se encontró `requireRole`, comparación backend de `usuarios.rol` ni una
  comprobación de ownership; S3 real sigue siendo `AUTH` para los tres roles y
  S4 administrativo no está aplicado en código.

**Resumen de resultado**

- Autenticación: presente en los handlers auditados.
- Autorización por rol: no aplicada.
- Ownership: no aplicado.
- IDOR: confirmado en lectura por ID, actualización por ID, eliminación por ID y
  asociaciones de recursos con IDs enviados por el cliente.
- Conocer un UUID sí basta actualmente en los casos marcados `HIGH` o
  `CRITICAL`; una sesión válida no aporta ownership.

## Endpoints auditados

| Archivo y líneas | Método y ruta | Parámetro | Query actual | Autenticación/rol | Ownership actual | Resultado IDOR |
|---|---|---|---|---|---|---|
| `src/app/api/pacientes/[id]/route.ts:5-20` | GET `/api/pacientes/[id]` | `params.id` | `pacientes.select('*').eq('id', id).single()` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, acceso directo por UUID |
| `src/app/api/pacientes/[id]/route.ts:27-41` | GET `/api/pacientes/[id]` | `params.id` | Consultas `.eq('paciente_id', id)` y cobros `.in('consulta_id', consultaIds)` | Hereda la misma sesión | Ninguno | Expone historial y cobros del paciente |
| `src/app/api/consultas/route.ts:125-169` | POST `/api/consultas` | `body.paciente_id`, `body.doctor_id` | Inserta consulta con ambos IDs; luego puede insertar cobro | Sesión requerida; cualquier rol efectivo | No se comprueba relación ni actor | Asociación arbitraria por IDs |
| `src/app/api/consultas/route.ts:180-207` | POST `/api/consultas` | `data.paciente_id` | Inserta cobro con `consultaData.id` y paciente enviado | Sesión requerida; cualquier rol efectivo | No se comprueba que paciente corresponda a consulta | Puede crear relación inconsistente |
| `src/app/api/cobros/route.ts:85-122` | POST `/api/cobros` | `data.consulta_id`, `data.paciente_id`, `data.aseguranza_id` | Inserta cobro con IDs del body | Sesión requerida; cualquier rol efectivo | Ninguno | Puede asociar cobro a recursos ajenos o incompatibles |
| `src/app/api/inventario/route.ts:159-203` | PATCH `/api/inventario` | `body.id` validado por Zod | `lentes.update(cleanUpdates).eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, modifica cualquier lente por UUID |
| `src/app/api/inventario/route.ts:206-224` | DELETE `/api/inventario?id=...` | query `id` | `lentes.delete().eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, elimina cualquier lente por ID |
| `src/app/api/configuracion/usuarios/route.ts:125-181` | PATCH `/api/configuracion/usuarios` | `body.id` validado por Zod | Auth Admin `updateUserById(id)` y `usuarios.update(...).eq('id', id)` | Sesión requerida; cualquier rol efectivo | No se deriva del usuario Auth | Sí, modifica otra cuenta, rol o password |
| `src/app/api/configuracion/usuarios/route.ts:184-212` | DELETE `/api/configuracion/usuarios?id=...` | query `id` | `usuarios.delete().eq('id', id)` y Auth Admin `deleteUser(id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, elimina otra cuenta por ID |
| `src/app/api/configuracion/doctores/route.ts:91-128` | PATCH `/api/configuracion/doctores` | `body.id` validado por Zod | `doctores.update(profileUpdates).eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, modifica cualquier doctor |
| `src/app/api/configuracion/doctores/route.ts:131-152` | DELETE `/api/configuracion/doctores?id=...` | query `id` | `doctores.delete().eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, elimina cualquier doctor |
| `src/app/api/configuracion/aseguranzas/route.ts:76-112` | PATCH `/api/configuracion/aseguranzas` | `body.id` validado por Zod | `aseguranzas.update(profileUpdates).eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, modifica cualquier aseguranza |
| `src/app/api/configuracion/aseguranzas/route.ts:115-136` | DELETE `/api/configuracion/aseguranzas?id=...` | query `id` | `aseguranzas.delete().eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, elimina cualquier aseguranza |
| `src/app/api/configuracion/categorias-lentes/route.ts:70-102` | PATCH `/api/configuracion/categorias-lentes` | `body.id` validado por Zod | `categorias_lentes.update(profileUpdates).eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, modifica cualquier categoría |
| `src/app/api/configuracion/categorias-lentes/route.ts:105-126` | DELETE `/api/configuracion/categorias-lentes?id=...` | query `id` | `categorias_lentes.delete().eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, elimina cualquier categoría |
| `src/app/api/configuracion/proveedores/route.ts:80-116` | PATCH `/api/configuracion/proveedores` | `body.id` validado por Zod | `proveedores.update(profileUpdates).eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, modifica cualquier proveedor |
| `src/app/api/configuracion/proveedores/route.ts:119-140` | DELETE `/api/configuracion/proveedores?id=...` | query `id` | `proveedores.delete().eq('id', id)` | Sesión requerida; cualquier rol efectivo | Ninguno | Sí, elimina cualquier proveedor |

## Vulnerabilidades confirmadas

### CRITICAL — Gestión de otra cuenta y privilegios

- Endpoint: PATCH `/api/configuracion/usuarios`.
- Archivo/líneas: `src/app/api/configuracion/usuarios/route.ts:125-181`.
- Recurso: usuario Auth y perfil `usuarios`.
- Escenario: Usuario A obtiene el UUID de Usuario B y envía `{ id: B, rol: "admin" }` o
  `{ id: B, password: "..." }`.
- Impacto: puede modificar el rol, credenciales, email, estado o metadata de otra
  cuenta. El mismo endpoint permite elevar privilegios si A puede modificar su
  propio ID.
- Autorización actual: solo `requireAuth()`; ningún rol efectivo restringe la operación.
- Ownership actual: ninguno; el `id` viene del body y se usa directamente.
- Query/operación actual: `auth.admin.updateUserById(id, ...)` y
  `usuarios.update(...).eq('id', id)`.
- Control requerido: autorización administrativa server-side y objetivo derivado
  del contexto Auth para cualquier self-service; no aceptar el body ID como
  identidad del actor.
- Prioridad: `CRITICAL`.
- Dependencia/bloqueo: matriz S3 administrativa y S4 deben estar implementadas y
  aprobadas; la política de self-service del último admin requiere decisión.

### CRITICAL — Eliminación arbitraria de cuentas

- Endpoint: DELETE `/api/configuracion/usuarios?id=B`.
- Archivo/líneas: `src/app/api/configuracion/usuarios/route.ts:184-212`.
- Recurso: perfil `usuarios` y usuario Auth.
- Escenario: Usuario A autenticado envía el UUID de Usuario B en query string.
- Impacto: borra el perfil y después la cuenta Auth de B.
- Autorización actual: solo autenticación.
- Ownership actual: ninguno.
- Query/operación actual: `usuarios.delete().eq('id', id)` y
  `auth.admin.deleteUser(id)`.
- Control requerido: permiso administrativo, protección contra auto-borrado y
  reglas aprobadas para último administrador; soft-delete/auditabilidad queda
  fuera de esta auditoría.
- Prioridad: `CRITICAL`.
- Dependencia/bloqueo: S3, S4 y decisión DEC-011.

### HIGH — Lectura de historial clínico por UUID

- Endpoint: GET `/api/pacientes/[id]`.
- Archivo/líneas: `src/app/api/pacientes/[id]/route.ts:5-41`.
- Recurso: paciente, consultas, diagnósticos y cobros relacionados.
- Escenario: Usuario A obtiene el UUID del paciente B y solicita
  `/api/pacientes/B` directamente, sin pasar por una página.
- Impacto: acceso horizontal a PHI e información financiera.
- Autorización actual: sesión válida; no hay rol backend ni ownership.
- Ownership actual: el modelo `Paciente` no tiene owner/organización; `Consulta`
  relaciona paciente y doctor, pero no con el usuario autenticado.
- Query actual: paciente por `.eq('id', id)`, consultas por `.eq('paciente_id', id)`
  y cobros por los IDs de consulta.
- Control requerido: rol aprobado y, si el negocio lo exige, ownership/tenant
  verificable antes de cada lectura; no basta validar que el UUID tenga formato.
- Prioridad: `HIGH`.
- Dependencia/bloqueo: decisión de ownership clínico; la entidad
  `Doctor.usuario_id` no demuestra por sí sola el schema desplegado.

### HIGH — Mutación y eliminación arbitraria de inventario

- Endpoints: PATCH `/api/inventario` y DELETE `/api/inventario?id=...`.
- Archivo/líneas: `src/app/api/inventario/route.ts:159-224`.
- Recurso: lente/inventario.
- Escenario: Usuario A obtiene el UUID de un lente B y actualiza cualquier campo
  o lo elimina mediante PATCH/DELETE.
- Impacto: modificación o pérdida de inventario y catálogo.
- Autorización actual: sesión válida; cualquier rol efectivo.
- Ownership actual: `Lente` se relaciona con categoría, proveedor y consultas,
  pero no con el usuario autenticado.
- Query actual: `.update(...).eq('id', id)` y `.delete().eq('id', id)`.
- Control requerido: rol administrativo aprobado antes de la operación y
  comprobación de existencia/relaciones; ownership no está definido.
- Prioridad: `HIGH`.
- Dependencia/bloqueo: S3/S4 y DEC-011; la corrección de relaciones es OUT OF
  SCOPE de S6.

### HIGH — Mutación y eliminación arbitraria de configuración

- Endpoints: PATCH/DELETE de doctores, aseguranzas, categorías y proveedores.
- Archivos/líneas: doctores `91-152`, aseguranzas `76-136`, categorías `70-126`,
  proveedores `80-140`.
- Recursos: catálogos y configuración relacionados con consultas, cobros e inventario.
- Escenario: Usuario A obtiene un UUID de configuración B y envía PATCH con ese
  ID o DELETE con `?id=B`.
- Impacto: alteración o pérdida de catálogos compartidos y relaciones existentes.
- Autorización actual: sesión válida; ningún rol backend aplicado.
- Ownership actual: estas entidades no tienen owner de usuario; sus relaciones
  son de dominio (`Doctor.usuario_id`, cobros o lentes), no autorización.
- Query actual: cada handler usa `.update(...).eq('id', id)` o
  `.delete().eq('id', id)`.
- Control requerido: autorización administrativa por recurso y verificación de
  dependencias antes de mutar/eliminar; no inventar ownership personal.
- Prioridad: `HIGH`.
- Dependencia/bloqueo: S3/S4 y decisión de soft-delete/relaciones.

### HIGH — Asociaciones arbitrarias en consultas y cobros

- Endpoints: POST `/api/consultas` y POST `/api/cobros`.
- Archivos/líneas: consultas `125-207`; cobros `85-122`.
- Recursos: pacientes, doctores, consultas, cobros y aseguranzas.
- Escenario: Usuario A envía UUIDs válidos pertenecientes a B en
  `paciente_id`, `doctor_id`, `consulta_id` o `aseguranza_id`.
- Impacto: crea consultas/cobros con relaciones que A no está autorizado a usar;
  puede producir corrupción de datos y exposición indirecta de recursos.
- Autorización actual: sesión válida; no se verifica rol ni relación con el actor.
- Ownership actual: ninguno. Las implementaciones Zod solo verifican forma/UUID;
  no verifican identidad, existencia contextual ni ownership.
- Query actual: inserts explícitos con IDs validados por Zod; las foreign keys
  solo verifican existencia, no autorización.
- Control requerido: autorización de operación y comprobación de consistencia
  entre paciente, doctor, consulta y cobro; la regla de ownership debe aprobarse.
- Prioridad: `HIGH`.
- Dependencia/bloqueo: decisión de roles y ownership; validación Zod existente no
  sustituye autorización.

## Casos no clasificados como IDOR directo

- GET `/api/pacientes`, `/api/consultas`, `/api/cobros` y los GET de configuración
  devuelven colecciones o reciben filtros no identificadores. Son riesgos de
  autorización amplia y exposición de datos, pero no requieren conocer un UUID
  individual; quedan documentados como S3/S10.
- GET `/api/inventario?barcode=...` identifica por código de barras, no por UUID.
  Puede permitir enumeración si el barcode es conocido, pero no se clasifica como
  IDOR UUID en esta auditoría.
- Los IDs internos calculados desde resultados de base de datos en pacientes y
  cobros no son entrada del cliente; no son por sí mismos un bypass separado.

## Zod y límites de S6

- Las validaciones UUID de pacientes, consultas, cobros, inventario y configuración
  reducen entradas malformadas, pero no autorizan el recurso.
- `zod` no se usa para decidir actor, rol u ownership.
- DELETE de inventario y configuración recibe IDs por query string sin Zod; aunque
  se añadiera validación de formato, seguiría siendo vulnerable sin autorización.

## Correcciones requeridas, no implementadas

- Derivar la identidad del actor exclusivamente de `requireAuth()`.
- Obtener rol confiable del perfil server-side y aplicar la matriz S3 antes de la
  query privilegiada.
- No usar el `id` de body/query para decidir quién ejecuta la operación.
- Definir ownership clínico o confirmar que el modelo es global por rol; el código
  actual no permite decidirlo.
- Añadir comprobaciones de consistencia entre IDs relacionados en consultas/cobros.
- Definir respuesta segura `403` frente a recurso no autorizado y `404` frente a
  recurso inexistente sin permitir enumeración.

No se implementó ninguna de estas correcciones.

### S7 — Estrategia de `getSupabaseAdmin()`

**Archivo afectado**

- `src/lib/supabase/admin.ts`.

**Funciones afectadas**

- `getSupabaseAdmin`.
- Todos sus consumidores en `src/app/api`.

**Plan**

- Mantener el módulo server-only y no importarlo desde componentes de navegador.
- Validar presencia de URL y service key al inicializar de forma fail-closed; no usar valores por defecto ni imprimir variables de entorno.
- Configurar el cliente admin sin persistencia de sesión de usuario; el cliente admin no debe representar la sesión del request.
- No usar SERVICE_ROLE como guard. El guard autentica primero con el cliente server-side basado en cookies.
- En la primera implementación de seguridad, permitir admin client solo después de `requireAuth` y autorización. Limitar las columnas seleccionadas.
- En una fase posterior, revisar si las lecturas/escrituras normales pueden usar el cliente anon con RLS; no hacerlo ahora porque las políticas RLS reales no están en el repositorio.
- Mantener Auth Admin para crear/actualizar/eliminar usuarios únicamente en rutas autorizadas de administración.

**Comportamiento esperado**

- Nunca llega `SUPABASE_SERVICE_ROLE_KEY` al bundle del navegador.
- Ninguna operación sensible llama admin antes de autenticar/autorizzar.
- Fallo de configuración: error interno controlado, sin exponer nombres o valores

**Riesgos**

- El uso temporal de SERVICE_ROLE después del guard sigue saltándose RLS; por eso la revisión de políticas RLS queda como dependencia explícita y no como garantía.

**Dependencias**

- S2 y S3.
- Variables de entorno válidas en cada entorno.
- Auditoría de RLS antes de retirar SERVICE_ROLE de operaciones normales.

### S8 — DELETE, soft-delete y auditabilidad

**Archivos afectados**

- `src/app/api/configuracion/usuarios/route.ts`.
- `src/app/api/configuracion/doctores/route.ts`.
- `src/app/api/configuracion/aseguranzas/route.ts`.
- `src/app/api/configuracion/categorias-lentes/route.ts`.
- `src/app/api/configuracion/proveedores/route.ts`.
- `src/app/api/inventario/route.ts`.

**Plan por entidad**

- Usuarios: preferir desactivación del perfil (`activo=false`) sobre borrar Auth; confirmar primero cómo se bloquea el acceso Auth sin inventar una operación no presente en el proyecto.
- Doctores, aseguranzas y proveedores: tienen `activo` en las entidades; evaluar usar desactivación administrativa y conservar relaciones.
- Categorías: no tienen `activo` confirmado; no convertir automáticamente su DELETE en soft-delete ni añadir una columna en esta fase.
- Lentes: no tienen `activo`; `estado` existe, pero no se debe reinterpretar como borrado sin decisión de negocio. El DELETE queda restringido a admin hasta esa decisión.
- Pacientes, consultas y cobros: no tienen DELETE API actual; no crear endpoints.
- Antes de cualquier borrado físico, comprobar relaciones y devolver un error público seguro si existe dependencia.
- Auditoría: no existe tabla, endpoint o servicio de auditoría confirmado. Esto es `MISSING DEPENDENCY` para una trazabilidad completa y requiere decisión de schema antes de implementarse.

**Comportamiento esperado**

- Solo admin puede ejecutar los DELETE existentes mientras DEC-011 siga
- No se borra información clínica o financiera automáticamente.
- La estrategia final por entidad se documenta antes de cambiar el contrato.

**Riesgos**

- Cambiar de DELETE físico a soft-delete modifica respuesta, relaciones y comportamiento de UI; requiere pruebas y aprobación explícita.

**Dependencias**

- DEC-011.
- Schema real, constraints y reglas de negocio.
- S3 autorización.

### S9 — Errores seguros y consistentes

**Archivos afectados**

- Los 10 route handlers API existentes.
- `src/lib/supabase/admin.ts` para no propagar errores de configuración.

**Funciones afectadas**

- Todos los bloques `if (error)` y `catch` de los handlers.

**Plan**

- Mantener temporalmente la forma `{ error: string }` porque los consumidores actuales leen `err.error`; no introducir un contrato nuevo sin actualizar todos los consumidores.
- Mapear errores conocidos a mensajes públicos y estados `400`, `401`, `403`, `404`, `409` o `500`.
- Nunca devolver `error.message` de Supabase, PostgreSQL, Auth o filesystem.
- Registrar solo código interno, ruta, método, request ID y contexto mínimo; no incluir PHI, payloads, passwords, tokens ni secrets.
- Capturar JSON inválido y devolver `400`.
- Para errores inesperados devolver mensaje genérico y `500`.
- Revisar operaciones parciales de consulta+cobro y Auth+perfil como problema de integridad separado; no ocultar una inconsistencia devolviendo `201`.

**Comportamiento esperado**

- El cliente recibe mensajes estables y no detalles de schema.
- Los logs internos permiten correlacionar el fallo sin almacenar PHI.

**Riesgos**

- Cambiar códigos HTTP puede afectar mensajes de formularios; probar cada consumidor actual.

**Dependencias**

- S5 para distinguir input inválido.
- S2/S3 para 401/403.
- Decisión posterior sobre transacciones o compensación.

### S10 — Protección de `password_hash`

**Archivos afectados**

- `src/hooks/useUser.ts`.
- `src/app/api/configuracion/usuarios/route.ts`.
- Cualquier select de `usuarios` añadido durante la implementación.
- `src/entities/Usuario.entity.ts` solo como referencia de campo; no eliminarlo hasta resolver DEC-004 y la compatibilidad de datos.

**Plan**

- Sustituir `select('*')` del perfil por `id,nombre,rol,activo` y solo otros campos estrictamente necesarios para el cliente.
- Mantener la selección pública del endpoint de usuarios limitada a los campos que ya proyecta: id, email, nombre, rol, activo y timestamps de Auth.
- Nunca incluir `password_hash` en response, DTO, log ni schema de request.
- No usar `usuarios.password_hash` para autenticar; la autenticación existente es Supabase Auth.
- `password` solo viaja al endpoint autorizado de Auth Admin y nunca se guarda o devuelve como campo de perfil.
- Investigar la función del valor fijo `managed_by_supabase_auth` antes de modificarla; no borrar la columna en esta fase.

**Comportamiento esperado**

- El navegador no recibe `password_hash` ni campos de perfil no necesarios.
- El cambio de password mantiene el flujo Supabase Auth autorizado.

**Riesgos**

- El schema remoto puede tener campos adicionales no visibles en las entidades; los selects explícitos deben probarse contra el entorno real.

**Dependencias**

- S5 allowlists.
- Verificación de datos existentes y DEC-004.

### S11 — Rate limiting del login

**Archivos afectados**

- `src/app/(auth)/login/page.tsx`.
- Configuración externa de Supabase Auth o plataforma de despliegue, fuera de `src`, si está disponible.

**Funciones afectadas**

- `handleSubmit` solo conservará el estado local como UX, no como control de seguridad.
- El mecanismo real será la protección del proveedor/edge que recibe `signInWithPassword`.

**Plan**

- Mantener mensajes genéricos de credenciales inválidas.
- Configurar límites de intentos y protección contra abuso en Supabase Auth y/o la plataforma de despliegue, sin revelar si un email existe.
- No crear un endpoint de login nuevo: el login actual llama directamente al cliente Supabase en líneas 86-89.
- No implementar un contador en memoria del servidor como solución distribuida.
- Si se exige rate limit propio por IP/email, falta un almacén distribuido y una política de privacidad; marcarlo como `MISSING DEPENDENCY` y aprobar proveedor antes de añadir una dependencia.

**Comportamiento esperado**

- Recargar la página no reinicia el límite efectivo del proveedor.
- El usuario recibe una respuesta genérica y no detalles de Supabase.

**Riesgos**

- No se puede confirmar desde este repositorio qué límites están activos en Supabase; requiere revisión del proyecto desplegado.

**Dependencias**

- Acceso administrativo a Supabase/hosting.
- No añadir dependencia hasta que exista una decisión.

### S12 — CSP

**Archivo afectado**

- `next.config.js`, función `headers` en líneas 15-29.

**Plan**

- Añadir CSP en modo report-only primero en staging para obtener violaciones sin romper login, Supabase ni scanners.
- La política debe cubrir solo recursos confirmados: `self`; conexión al proyecto Supabase; imágenes locales y dominios Supabase ya permitidos en `images`; y workers `blob:`/orígenes reales de Tesseract tras inspección de red.
- `script-src` no debe incluir `unsafe-eval` en producción. `unsafe-inline` solo puede mantenerse si Next 14 y los componentes actuales lo requieren; la eliminación requiere nonces y es una tarea separada.
- `connect-src` debe incluir el origen HTTPS de Supabase y `wss` solo si el runtime usa Realtime; no se añade un dominio no observado.
- `img-src` debe permitir imágenes locales y `https://*.supabase.co` si se mantienen esos recursos.
- `worker-src` debe probarse con Tesseract; no se autoriza `*`.
- Pasar a enforcement solo después de probar login, API, cámara y OCR.

**Comportamiento esperado**

- Recursos legítimos funcionan en staging/producción.
- Scripts, frames, conexiones e imágenes de orígenes no autorizados quedan bloqueados o reportados.

**Riesgos**

- Una CSP demasiado estricta puede romper Next, Tesseract o Supabase.
- Una CSP con `unsafe-eval`, `unsafe-inline` o wildcard excesivos reduce el beneficio de seguridad.

**Dependencias**

- Inventario real de orígenes usado por workers y Supabase.
- S13 Permissions-Policy.
- Pruebas en staging.

### S13 — Permissions-Policy y cámara

**Archivo afectado**

- `next.config.js`, header `Permissions-Policy` de la línea 27.

**Plan**

- La política actual `camera=()` puede bloquear `BarcodeScanner`.
- Cambiarla únicamente a `camera=(self)` si el scanner se ejecuta en el mismo origen; no habilitar micrófono o geolocation porque no hay uso confirmado.
- Si el scanner se sirve embebido desde otro origen, detenerse y confirmar el origen antes de ampliar la política.
- Probar permisos en HTTPS de staging/producción y denegación fuera del origen.

**Comportamiento esperado**

- Cámara permitida solo para la aplicación en su propio origen.
- Micrófono y geolocation permanecen deshabilitados.

**Riesgos**

- Habilitar `camera` globalmente o con wildcard aumenta superficie de permisos.

**Dependencias**

- Confirmación de origen real del componente `src/components/inventario/BarcodeScanner.tsx`.
- Pruebas manuales de cámara.

### S14 — TLS y `rejectUnauthorized`

**Archivo afectado**

- `src/config/data-source.ts`, líneas 13-18.

**Plan**

- Mantener `synchronize: false`.
- En producción, exigir validación de certificado (`rejectUnauthorized: true`).
- Antes de cambiarlo, probar la conexión TypeORM en el entorno que realmente usa este DataSource; el build no prueba conexión.
- No eliminar TypeORM ni sus entidades por esta tarea, porque `DEC-004` sigue pendiente.
- Para desarrollo local, cualquier excepción temporal debe estar aislada por entorno, documentada y no llegar a producción; no debe ser el valor por defecto de una conexión productiva.
- No inventar una variable de certificado: si el proveedor exige CA custom, debe aprobarse el nombre, origen y gestión de esa configuración antes de codificarla.

**Comportamiento esperado**

- Certificados inválidos bloquean conexiones productivas.
- La conexión no imprime URL, certificados ni credenciales en logs.

**Riesgos**

- Activar validación puede revelar una configuración de CA incompleta y romper procesos CLI TypeORM; eso debe detectarse en staging, no relajarse en producción.

**Dependencias**

- Uso real de `AppDataSource` fuera de los handlers.
- Certificados soportados por el proveedor PostgreSQL.
- DEC-004.

## Orden de implementación propuesto

1. Aprobar la matriz de permisos y confirmar endpoints públicos.
2. Implementar S2 guard reutilizable y pruebas de `401/403` sin cambiar todavía
   schemas de datos.
3. Aplicar S1/S3 a todos los handlers y bloquear `SERVICE_ROLE` antes de auth.
4. Proteger específicamente usuarios y self-service con S4.
5. Añadir S5 schemas y allowlists route por route, empezando por usuarios,
   cobros, consultas y pacientes.
6. Revisar IDs y consistencia de relaciones con S6.
7. Reducir selects y eliminar `password_hash` del flujo con S10.
8. Resolver DELETE/soft-delete con DEC-011 y S8 antes de modificar contratos.
9. Configurar rate limiting real con S11.
10. Aplicar CSP y Permissions-Policy en report-only, probar scanners y pasar a
    enforcement con S12/S13.
11. Corregir TLS de TypeORM en un cambio separado y verificable con S14.
12. Ejecutar auditoría independiente de seguridad y pruebas manuales.

Cada paso debe ser pequeño, reversible y terminar con revisión de diff, typecheck, tests y build cuando existan los comandos.

## Pruebas de aceptación

### Autenticación

- GET/POST/PATCH/DELETE API sin sesión devuelve `401` JSON.
- Sesión inválida o expirada no obtiene datos.
- Las páginas sin sesión redirigen a `/login`.

### Autorización

- Cada combinación de la matriz se prueba con admin, doctor y recepcionista.
- Un rol enviado en body no eleva permisos.
- Un doctor no puede leer cobros directos ni modificar catálogos.
- Un recepcionista no puede administrar usuarios ni borrar inventario.
- Un usuario solo puede modificar su propio nombre/password en self-service.

### IDOR

- UUID ajeno no permite acceso no autorizado.
- UUID inválido devuelve `400`.
- Recurso inexistente autorizado devuelve `404`.
- Relaciones cruzadas de cobro/consulta/paciente no pueden falsificarse.

### Validación y errores

- JSON malformado devuelve `400`.
- Campos desconocidos son rechazados.
- Passwords, tokens, `password_hash`, PHI y mensajes internos no aparecen en responses ni logs.
- Errores de base producen mensajes públicos seguros y códigos consistentes.

### Plataforma

- Rate limit persiste tras recargar la página.
- CSP no rompe login, Supabase, imágenes, scanner ni OCR.
- Permissions-Policy habilita solo cámara del mismo origen.
- TLS inválido falla en el entorno productivo configurado.

## MISSING DEPENDENCY

- Matriz de permisos de negocio aprobada.
- Políticas RLS y schema real de Supabase disponibles para revisión.
- Mecanismo de auditoría/tabla de eventos si se exige trazabilidad de cambios.
- Almacén distribuido o servicio de rate limiting si Supabase/hosting no cubre el requisito.
- Criterio de bloqueo/desactivación de usuarios Auth cuando se adopte soft-delete.
- Configuración de certificados CA si PostgreSQL no usa una cadena pública estándar.

## OUT OF SCOPE

- No se implementan cambios en `src`.
- No se modifica middleware, roles, API, schemas, `getSupabaseAdmin`, CSP, Permissions-Policy, TypeORM ni rate limiting en esta ejecución.
- No se rota ningún secret.
- No se crean endpoints, tablas, columnas, migraciones, repositorios o servicios.
- No se decide eliminar TypeORM; `DEC-004` sigue pendiente.
- No se cambia `docs/refactor/decisions.md` porque este documento solo registra el plan y no introduce una decisión arquitectónica aprobada.

## Criterios de salida de Fase 1

- APIs protegidas con respuesta `401` sin redirect.
- Guard reutilizable aplicado antes de `getSupabaseAdmin()`.
- Matriz de permisos aprobada e implementada server-side.
- Zod y allowlists aplicados a todos los POST/PATCH existentes.
- IDOR revisado para todos los IDs actuales.
- `password_hash` fuera de selects y responses del cliente.
- DELETE y soft-delete decididos por entidad.
- Errores internos no expuestos.
- Rate limiting real verificado o dependencia explícitamente aprobada.
- CSP y Permissions-Policy probadas.
- `rejectUnauthorized` validado en el entorno TypeORM aplicable.
- `npm run typecheck`, `npm test`, `npm run build` y `npm run lint` ejecutados cuando existan y sus resultados documentados.
