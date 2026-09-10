# Fase 0 — Baseline técnico real

## Alcance y método

Este documento registra el estado observado del repositorio en la inspección de
Fase 0. Se contrastó la documentación con el código real. No se modificó código
de aplicación, configuración de runtime ni base de datos.

La fecha de referencia es la ejecución actual. Las líneas son aproximadas y
corresponden al estado inspeccionado.

## Resumen ejecutivo

- Stack real: Next.js 14 App Router, React 18, TypeScript estricto y Supabase.
- Hay 10 route handlers API reales bajo `src/app/api`.
- El flujo de datos de las API es principalmente `Route -> getSupabaseAdmin() -> Supabase`.
- No existen carpetas `src/services`, `src/repositories` ni `src/migrations` con archivos.
- TypeORM y sus entidades están configurados, pero no son importados por las rutas ni por componentes de aplicación; `src/config/data-source.ts` los mantiene para CLI/configuración.
- La autenticación de navegación se realiza en middleware, pero el middleware excluye expresamente las rutas `/api` de la redirección de usuarios no autenticados.
- Los route handlers no realizan comprobaciones propias de autenticación ni autorización.
- Las rutas administrativas y CRUD usan `SERVICE_ROLE` mediante el cliente admin.
- Hay listados sin paginación, filtrado en navegador y respuestas con `select('*')`.
- Hay datos mock/hardcodeados todavía visibles en dashboard y reportes.
- El build actual pasa; no hay scripts `typecheck` ni `test` definidos.

## 1. Estructura real de `src/`

Directorios confirmados:

- `src/app`: App Router, páginas, layouts, acciones y API routes.
- `src/components`: layout, UI e inventario.
- `src/config`: configuración de TypeORM.
- `src/data`: datasets estáticos/mock.
- `src/entities`: entidades TypeORM.
- `src/hooks`: hooks de cliente.
- `src/lib`: utilidades, parsing y clientes Supabase.
- `src/types`: tipos compartidos de los datasets.
- No hay archivos en `src/services`, `src/repositories` ni `src/migrations`.

Páginas reales: login; dashboard; reportes; pacientes; historial de paciente;
consultas y nueva consulta; cobros; inventario y alta/edición de lente; y
configuración de usuarios, doctores, aseguranzas, categorías, proveedores y
sistema.

## 2. API routes existentes

### `/api/pacientes` — `src/app/api/pacientes/route.ts`

- `GET` (líneas 9-64): lee todos los pacientes ordenados por `created_at`, luego lee consultas para todos los IDs y devuelve un array transformado con datos del paciente, conteo de consultas y última visita.
- `POST` (líneas 66-111): recibe JSON; exige `nombre_completo` o `nombre`; transforma campos y crea un paciente; devuelve un objeto reducido con `201`.
- No hay query params de paginación, búsqueda o filtrado.
- El `GET` y algunos errores del `POST` devuelven `error.message` de Supabase con `500` (líneas 16-18 y 95-97).

### `/api/pacientes/[id]` — `src/app/api/pacientes/[id]/route.ts`

- Es el único route handler API con segmento dinámico `[id]` confirmado.
- `GET` (líneas 4-86): recibe `params.id`, busca un paciente, todas sus consultas con datos del doctor y todos los cobros asociados; devuelve historial agregado.
- No hay `POST`, `PATCH` ni `DELETE` para este segmento.
- Usa `select('*')` para paciente, consultas relacionadas y cobros (líneas 12-16, 23-30 y 34-37).

### `/api/consultas` — `src/app/api/consultas/route.ts`

- `GET` (líneas 51-98): devuelve todas las consultas, pacientes y doctores relacionados, ordenadas por fecha.
- `POST` (líneas 100-193): recibe JSON; valida manualmente algunos campos obligatorios; genera folio mediante `count`; inserta consulta y, si hay datos de pago, intenta insertar cobro.
- El cobro se inserta como operación posterior independiente. Si falla, la consulta queda creada y solo se registra `console.error` (líneas 158-190).
- Devuelve errores internos de Supabase directamente (líneas 62-64 y 151-155).

### `/api/cobros` — `src/app/api/cobros/route.ts`

- `GET` (líneas 4-58): devuelve todos los cobros con paciente, consulta, aseguranza y una consulta adicional para resolver nombres de doctores.
- `POST` (líneas 60-85): inserta directamente varios campos recibidos del JSON y devuelve el registro creado con `201`.
- No hay `PATCH` ni `DELETE`.
- Devuelve `error.message` directamente con `500` (líneas 16-18 y 80-82).

### `/api/inventario` — `src/app/api/inventario/route.ts`

- `GET` (líneas 48-76): sin `barcode`, devuelve todos los lentes; con `barcode`, busca un registro único.
- `POST` (líneas 78-118): recibe JSON, exige marca y modelo, construye un objeto de inserción y devuelve el registro.
- `PATCH` (líneas 120-156): recibe `id` y actualizaciones; aplica una lista manual de campos permitidos y actualiza por ID.
- `DELETE` (líneas 158-174): recibe `id` por query string y ejecuta borrado físico.
- El `SELECT` constante empieza con `*` y añade relaciones (línea 46).
- `translateError` puede devolver el mensaje original cuando no encuentra traducción (líneas 12-17).

### `/api/configuracion/usuarios` — `src/app/api/configuracion/usuarios/route.ts`

- `GET` (líneas 13-47): lista usuarios de Supabase Auth con `listUsers`, lee perfiles de `usuarios` y los mezcla.
- `POST` (líneas 49-91): crea usuario Auth con email, password y metadata recibidos; después intenta insertar el perfil.
- `PATCH` (líneas 93-139): actualiza metadata, perfil y password según campos recibidos; opera sobre el `id` recibido.
- `DELETE` (líneas 141-167): borra primero el perfil y luego el usuario Auth usando el `id` de query string.
- El perfil se lee con `select('*')` (líneas 23-25).
- Si falla la inserción de perfil, el usuario Auth permanece creado; solo se registra `console.error` (líneas 68-82).

### `/api/configuracion/doctores` — `src/app/api/configuracion/doctores/route.ts`

- `GET` (líneas 9-32): lista todos los doctores con `select('*')` y devuelve una proyección.
- `POST` (líneas 34-59): recibe JSON, exige nombre e inserta un doctor.
- `PATCH` (líneas 61-92): recibe `id` y campos de perfil; actualiza por ID.
- `DELETE` (líneas 94-113): recibe `id` por query string y ejecuta borrado físico.

### `/api/configuracion/aseguranzas` — `src/app/api/configuracion/aseguranzas/route.ts`

- `GET` (líneas 8-20): lista todos los registros con `select('*')`.
- `POST` (líneas 22-46): recibe JSON, exige nombre e inserta.
- `PATCH` (líneas 48-78): recibe `id` y campos permitidos manualmente; actualiza por ID.
- `DELETE` (líneas 80-99): recibe `id` por query string y ejecuta borrado físico.

### `/api/configuracion/categorias-lentes` — `src/app/api/configuracion/categorias-lentes/route.ts`

- `GET` (líneas 8-20): lista todos los registros con `select('*')`.
- `POST` (líneas 22-44): recibe JSON, exige nombre e inserta.
- `PATCH` (líneas 46-73): recibe `id` y campos permitidos manualmente; actualiza por ID.
- `DELETE` (líneas 75-94): recibe `id` por query string y ejecuta borrado físico.

### `/api/configuracion/proveedores` — `src/app/api/configuracion/proveedores/route.ts`

- `GET` (líneas 8-20): lista todos los registros con `select('*')`.
- `POST` (líneas 22-47): recibe JSON, exige nombre e inserta.
- `PATCH` (líneas 49-80): recibe `id` y campos permitidos manualmente; actualiza por ID.
- `DELETE` (líneas 82-101): recibe `id` por query string y ejecuta borrado físico.

No se encontraron otros route handlers bajo `src/app/api`.

## 3. Autenticación actual

**MEDIUM — Autenticación de navegación no equivale a protección de API**

- Archivo: `src/lib/supabase/middleware.ts`, líneas 44-66.
- Evidencia: el middleware llama `supabase.auth.getUser()` y redirige usuarios no autenticados para rutas que no sean `/login` ni `/api`.
- Riesgo: la excepción `!request.nextUrl.pathname.startsWith('/api')` permite que una request no autenticada llegue a los route handlers. Los handlers no llaman a `getUser()` ni a otro guard.
- Fase: Fase 1 — seguridad/autenticación y autorización.

El login usa `createBrowserClient` y `signInWithPassword` en `src/app/(auth)/login/page.tsx`, líneas 38-116. El cliente Supabase de navegador usa la anon key en `src/lib/supabase/client.ts`, líneas 3-7. El hook `src/hooks/useUser.ts`, líneas 27-57, consulta el usuario Auth y su perfil para mostrar identidad y rol en el cliente.

## 4. Usos de `getSupabaseAdmin()` y SERVICE_ROLE

**HIGH — Todas las API operan con cliente admin**

- Archivo base: `src/lib/supabase/admin.ts`, líneas 3-12.
- Evidencia: `getSupabaseAdmin()` crea un cliente con `SUPABASE_SERVICE_ROLE_KEY`.
- Consumidores confirmados: las 10 rutas API enumeradas arriba; hay 31 llamadas desde handlers en total. La búsqueda arroja 32 coincidencias al incluir la propia definición de `getSupabaseAdmin()`.
- Riesgo: SERVICE_ROLE bypassa RLS; cualquier falta de autenticación/autorización en esos handlers permite operaciones privilegiadas.
- Fase: Fase 1 — seguridad.

Uso por ruta: pacientes `2` llamadas; paciente `[id]` `1`; consultas `2`; cobros `2`; inventario `4`; usuarios `4`; doctores `4`; aseguranzas `4`; categorías `4`; proveedores `4`.

No se confirmó uso de `SUPABASE_SERVICE_ROLE_KEY` en componentes de navegador.

## 5. Endpoints y páginas con `[id]`

**MEDIUM — El endpoint dinámico no valida ownership ni contexto**

- Archivo: `src/app/api/pacientes/[id]/route.ts`, líneas 8-16 y 23-37.
- Evidencia: acepta cualquier `id` de ruta y devuelve datos del paciente, historial de consultas y cobros usando el cliente admin; no hay autenticación, rol ni ownership en el handler.
- Riesgo: acceso horizontal a información clínica y financiera si el endpoint es invocado directamente.
- Fase: Fase 1 — seguridad/IDOR.

Páginas dinámicas adicionales confirmadas: `src/app/(dashboard)/pacientes/[id]/historial/page.tsx` e `src/app/(dashboard)/inventario/[id]/editar/page.tsx`. La primera consume `/api/pacientes/${id}`; la segunda obtiene el listado completo de inventario y busca localmente el ID.

## 6. POST/PATCH que usan `request.json()`

Se confirmaron 15 lecturas en 10 route handlers:

- `pacientes`: POST, líneas 66-68.
- `consultas`: POST, líneas 100-102.
- `cobros`: POST, líneas 60-62.
- `inventario`: POST/PATCH, líneas 78-80 y 120-123.
- `configuracion/usuarios`: POST/PATCH, líneas 49-52 y 93-96.
- `configuracion/doctores`: POST/PATCH, líneas 34-36 y 61-64.
- `configuracion/aseguranzas`: POST/PATCH, líneas 22-24 y 48-51.
- `configuracion/categorias-lentes`: POST/PATCH, líneas 22-24 y 46-49.
- `configuracion/proveedores`: POST/PATCH, líneas 22-24 y 49-52.

**HIGH — Validación de body incompleta y no basada en esquema**

- Evidencia: no hay imports de Zod ni esquemas de request en las API. La mayoría de campos se copian o transforman manualmente; `cobros` inserta directamente valores del body en líneas 64-78.
- Evidencia adicional: no hay `try/catch` alrededor de `request.json()`; un JSON malformado no tiene respuesta pública controlada en el handler.
- Riesgo: entradas con tipos, rangos o campos no esperados alcanzan la base de datos; respuestas y códigos pueden variar ante input inválido.
- Fase: Fase 1 — validación y seguridad.

## 7. DELETE confirmados

Todos son borrados físicos y reciben el ID por query string:

- `src/app/api/inventario/route.ts`, líneas 158-173, tabla `lentes`.
- `src/app/api/configuracion/usuarios/route.ts`, líneas 141-166, perfil y usuario Auth.
- `src/app/api/configuracion/doctores/route.ts`, líneas 94-112, tabla `doctores`.
- `src/app/api/configuracion/aseguranzas/route.ts`, líneas 80-98, tabla `aseguranzas`.
- `src/app/api/configuracion/categorias-lentes/route.ts`, líneas 75-93, tabla `categorias_lentes`.
- `src/app/api/configuracion/proveedores/route.ts`, líneas 82-100, tabla `proveedores`.

**HIGH — DELETE administrativo sin autorización en el handler**

- Evidencia: los seis handlers llaman `delete().eq('id', id)` o eliminan un usuario Auth sin comprobar actor, rol o permiso.
- Riesgo: borrado privilegiado y posible pérdida de datos mediante IDs arbitrarios.
- Fase: Fase 1 — autorización; la estrategia soft-delete queda pendiente de decisión de negocio.

## 8. Usos de `select('*')`

Usos confirmados:

- `src/app/api/pacientes/route.ts`, línea 13.
- `src/app/api/pacientes/[id]/route.ts`, líneas 14 y 36; además `*` dentro de la selección relacionada en línea 26.
- `src/app/api/configuracion/usuarios/route.ts`, línea 25.
- `src/app/api/configuracion/doctores/route.ts`, línea 13.
- `src/app/api/configuracion/aseguranzas/route.ts`, línea 12.
- `src/app/api/configuracion/categorias-lentes/route.ts`, línea 12.
- `src/app/api/configuracion/proveedores/route.ts`, línea 12.
- `src/hooks/useUser.ts`, línea 40.
- `src/app/api/inventario/route.ts`, línea 46, mediante `SELECT = '*, ...'`.

**HIGH — Proyección de columnas demasiado amplia en datos sensibles**

- Evidencia: el endpoint de usuarios carga todos los campos de `usuarios`; el hook de usuario también carga todos los campos del perfil. La documentación de entidades incluye `password_hash`, y el esquema real no se revisó desde migraciones porque no hay migraciones en el repositorio.
- Riesgo: exposición accidental de campos sensibles o internos al runtime y dificultad para garantizar que nunca lleguen al cliente.
- Fase: Fase 1 — seguridad de datos.

El código observado no devuelve explícitamente `password_hash` en el resultado del `GET` de usuarios, pero la consulta sí lo carga; la exposición efectiva del campo no queda confirmada por este baseline.

## 9. Dependencias realmente utilizadas

Uso confirmado por imports o imports dinámicos en `src`:

- `next`, `react`, `react-dom`.
- `@supabase/ssr`, `@supabase/supabase-js`.
- `lucide-react`.
- `clsx`, `tailwind-merge`.
- `html5-qrcode` en `src/components/inventario/BarcodeScanner.tsx`, líneas 35 y 91.
- `tesseract.js` en `src/components/inventario/LabelScanner.tsx`, línea 137.
- `typeorm` en entidades y `src/config/data-source.ts`.
- `pg` es dependencia de runtime de PostgreSQL/TypeORM, pero no tiene import directo confirmado en `src`.

Dependencias declaradas sin consumidor directo confirmado en `src`:

- `date-fns`.
- `react-hook-form`.
- `@tanstack/react-table`.
- `recharts`.
- `typescript-transform-paths`.
- `zod` no tiene import confirmado en `src`; la validación actual es manual.

No se eliminó ninguna dependencia. La presencia en configuración, lockfile o uso indirecto debe evaluarse antes de cualquier limpieza.

## 10. Código muerto confirmado por ausencia de consumidores

Estos elementos no tienen consumidor fuera de su propia exportación/barrel en la búsqueda del repositorio:

- `src/components/ui/DataTable.tsx`: no se encontró import ni uso JSX.
- `src/hooks/useFilteredData.ts`: solo se reexporta desde `src/hooks/index.ts`; no se encontró consumidor.
- `src/app/actions/auth.ts`: exporta `logout`, pero no se encontró import o llamada. Su dependencia `src/lib/supabase/server.ts` tampoco tiene otro consumidor confirmado.
- `src/entities/index.ts`: no se encontró consumidor de ese barrel. Las entidades individuales sí son importadas por `src/config/data-source.ts`.
- `src/data/index.ts`: no se encontró consumidor del barrel. Algunos datasets individuales sí se consumen directamente.

No se clasifica `src/types/index.ts` como muerto: sus tipos son importados por varios archivos de `src/data`.

**LOW — Código potencialmente muerto no eliminado**

- Riesgo: superficie de mantenimiento y dependencias sin uso aparente.
- Fase: Fase 2 — dead code, previa verificación de imports indirectos/build.

## 11. Datos mock todavía utilizados

**HIGH — Dashboard y reportes muestran datos no provenientes de API**

- Archivo: `src/app/(dashboard)/dashboard/page.tsx`, líneas 24-97 y 99-292.
- Evidencia: estadísticas, citas, inventario bajo, ingresos semanales y fecha están definidos como constantes; también importa `doctoresData` y `aseguranzasData` desde `src/data` en líneas 15-16.
- Riesgo: la interfaz puede mostrar información clínica/financiera que no corresponde a la base de datos.
- Fase: Fase 3 — datos y performance.

- Archivo: `src/app/(dashboard)/reportes/page.tsx`, líneas 29-149 y 167-336.
- Evidencia: todas las métricas, diagnósticos, actividad, ingresos, métodos de pago e inventario están definidos como constantes locales.
- Riesgo: reportes presentados como reales sin conexión con datos persistidos.
- Fase: Fase 3 — datos.

Los datasets de `src/data` también existen para pacientes, consultas, cobros, lentes, usuarios y sistema, pero no se confirmó consumidor directo para esos archivos individuales en la búsqueda realizada. No se eliminan por este baseline.

## 12. Páginas completamente client-side

Páginas con `'use client'` en la primera línea, confirmadas:

- Login.
- Dashboard, reportes, pacientes, historial, consultas, nueva consulta, cobros e inventario.
- Alta/edición de inventario.
- Configuración, layout de configuración, usuarios, doctores, aseguranzas, categorías, proveedores y sistema.

Además, `src/app/(dashboard)/layout.tsx`, líneas 1-42, es completamente client-side por estado del sidebar/toast. Las páginas de listados cargan datos desde el navegador mediante `useFetch` y `fetch`.

**MEDIUM — Lecturas y layouts de solo lectura quedan en el cliente**

- Riesgo: mayor JavaScript enviado, waterfalls de carga y pérdida de ventajas de Server Components.
- Fase: Fase 3 — performance; cualquier migración debe preservar interactividad y autenticación.

## 13. Principales problemas de performance confirmados

**HIGH — Listados sin paginación server-side**

- Archivos: todos los `GET` de listados API, especialmente `pacientes`, `consultas`, `cobros`, `inventario` y configuración.
- Evidencia: consultas `.select(...)` ordenadas sin `range`, `limit` ni parámetros de paginación.
- Riesgo: transferencia, memoria y tiempo de respuesta crecen con el tamaño de las tablas.
- Fase: Fase 3 — performance.

**HIGH — Filtrado y estadísticas en el navegador**

- Archivos: pacientes línea 54, consultas líneas 67-91, inventario líneas 92-122, cobros líneas 60-86 y páginas de configuración con `useMemo`/`.filter`.
- Evidencia: cada página obtiene el dataset completo y filtra/agrupa localmente.
- Riesgo: alto coste de red y CPU del navegador; resultados incompletos o lentos con crecimiento de datos.
- Fase: Fase 3 — performance.

**HIGH — Waterfalls y lecturas amplias**

- `pacientes` hace una lectura completa y una segunda lectura de consultas para todos los IDs (líneas 10-25).
- Historial de paciente hace paciente, consultas y cobros secuencialmente (líneas 12-37 de `[id]`).
- `cobros` hace cobros y una lectura posterior de doctores (líneas 6-32).
- `consultas` genera folio con `count` antes del insert (líneas 121-127).
- Riesgo: latencia acumulada, sobrelectura y posibles carreras al generar folios.
- Fase: Fase 3 — performance; la integridad del folio requiere análisis separado.

**MEDIUM — Refetch completo después de mutaciones**

- Archivo: páginas de configuración e inventario; por ejemplo `inventario/page.tsx`, líneas 140 y 156.
- Evidencia: después de PATCH/DELETE se llama `refetch()` del listado completo.
- Riesgo: tráfico y latencia innecesarios.
- Fase: Fase 3 — performance.

**MEDIUM — Inicialización repetida de OCR**

- Archivo: `src/components/inventario/LabelScanner.tsx`, línea 137.
- Evidencia: el worker Tesseract se crea dentro del flujo de escaneo; no se confirmó reutilización persistente.
- Riesgo: coste de CPU/memoria y latencia por escaneo.
- Fase: Fase 3 — performance.

**MEDIUM — Imágenes grandes en login**

- Archivo: `src/app/(auth)/login/page.tsx`, líneas 121-131 y 165-169.
- Evidencia: se renderizan imágenes `<img>` locales de pantalla completa y logo, sin `next/image` ni dimensiones optimizadas para esos recursos.
- Riesgo: mayor transferencia y render inicial en login.
- Fase: Fase 3 — performance.

## 14. Roles y permisos actuales

Roles observados: `admin`, `doctor` y `recepcionista`, definidos para display y formularios en `src/app/(dashboard)/configuracion/usuarios/page.tsx`, líneas 33-37 y 398-400; también se usan como fallback en `useUser.ts`, línea 45.

**CRITICAL — No hay autorización funcional en las API**

- Evidencia: ningún route handler obtiene el usuario actual, valida `rol`, ownership o permiso antes de leer, insertar, actualizar o borrar. Las llamadas a `getSupabaseAdmin()` aparecen antes de cualquier operación y no hay guard de rol.
- Evidencia adicional: el rol de alta/edición se toma del body en `configuracion/usuarios/route.ts`, líneas 54-61 y 99-102; no se usa para autorizar la request.
- Riesgo: un cliente que alcance una API puede intentar operaciones administrativas independientemente de su rol.
- Fase: Fase 1 — autorización.

La UI muestra el rol y lo envía en formularios, pero no constituye control de acceso server-side. No se inventan permisos por pantalla en este baseline porque no existe una matriz de permisos implementada.

## 15. Manejo de SERVICE_ROLE

El cliente admin singleton está en `src/lib/supabase/admin.ts`, líneas 3-12, y usa `SUPABASE_SERVICE_ROLE_KEY` únicamente en server-side por import directo actual. Todas las API lo utilizan para operaciones de lectura/escritura y Auth Admin.

**CRITICAL — SERVICE_ROLE se usa sin una capa de autorización previa**

- Evidencia: los handlers llaman directamente al cliente admin; no hay secuencia `Authentication -> Authorization -> Validation -> Database`.
- Riesgo: se ignoran las protecciones de RLS para requests no autorizadas.
- Fase: Fase 1 — seguridad.

No se observó la service role key expuesta en código cliente. `.env.local` existe en el worktree y no se leyó su contenido; por tanto no se afirma exposición de secretos desde ese archivo.

## 16. Manejo actual de errores en API

**HIGH — Errores internos devueltos al cliente**

- Evidencia: `error.message` se devuelve directamente en pacientes, consultas, cobros y múltiples endpoints de configuración.
- Evidencia: `inventario` y configuración traducen algunos mensajes, pero devuelven el mensaje original cuando no existe traducción (`inventario`, líneas 12-17; configuración, por ejemplo doctores líneas 16-18).
- Riesgo: exposición de detalles de Supabase/PostgreSQL, constraints, nombres de tablas y esquema.
- Fase: Fase 1 — errores seguros.

**HIGH — Operaciones parciales sin transacción**

- `consultas`: una consulta puede quedar creada si falla el cobro (líneas 158-190).
- `usuarios`: un usuario Auth puede quedar creado si falla el perfil (líneas 68-82); en DELETE, el perfil puede borrarse antes de que falle Auth Admin (líneas 150-164).
- Riesgo: estado inconsistente y recuperación manual.
- Fase: Fase 1 — integridad de operaciones; no se propone implementación en esta fase.

Los errores de validación manual devuelven normalmente `400`; errores de base o Auth devuelven normalmente `500`, incluso cuando el problema podría ser conflicto o input inválido. No hay contrato de error común entre rutas.

## 17. Problemas de seguridad evidentes

### CRITICAL

- APIs sin autenticación/autorización efectiva: `src/lib/supabase/middleware.ts`, líneas 49-53, combinado con todos los route handlers.
- Uso de SERVICE_ROLE sin autorización previa: `src/lib/supabase/admin.ts`, líneas 5-10, y todas las API.
- Operaciones administrativas y borrados accesibles por ID sin comprobar actor/rol: rutas de configuración y `inventario`.

### HIGH

- Posible IDOR en `src/app/api/pacientes/[id]/route.ts`, líneas 8-37: devuelve historial clínico y cobros para cualquier ID alcanzable.
- Datos de request insuficientemente validados y cobros insertados directamente desde body: `src/app/api/cobros/route.ts`, líneas 60-78; patrón repetido en las demás rutas.
- Errores internos expuestos: rutas descritas en la sección 16.
- Consultas amplias con `select('*')` en perfiles y entidades potencialmente sensibles: sección 8.
- `src/config/data-source.ts`, líneas 13-18, configura `rejectUnauthorized: false` para la conexión TypeORM.

### MEDIUM

- No se observó header `Content-Security-Policy` en `next.config.js`, líneas 15-29; sí existen otros headers de seguridad.
- `src/app/(dashboard)/configuracion/page.tsx`, líneas 51-75 y 77-106, actualiza perfil/password vía API administrativa sin que el endpoint compruebe que el ID corresponde al usuario autenticado.

### No confirmado

- `tunnel.log` existe en la raíz y está sin ignorar por `.gitignore`, pero el archivo es binario/no legible con la inspección disponible; no se confirma aquí que contenga secretos o información sensible.
- No se leyó `.env.local`; no se afirma exposición de sus valores.

## 18. Código prototipo, placeholders y UI no conectada

Confirmado:

- Dashboard y reportes son mock/hardcodeados, sección 11.
- `TopBar` muestra avatar fijo `DA` en `src/components/layout/TopBar.tsx`, líneas 49-53.
- El buscador de `TopBar` es un `<input>` sin estado ni handler, líneas 25-33.
- Los botones `Exportar Excel` y `Exportar PDF` de reportes no tienen `onClick`, líneas 176-184 de reportes.
- La página de pacientes muestra un botón `Agendar` sin handler visible en líneas 169-180.

**MEDIUM — Interacciones visuales sin operación conectada**

- Riesgo: funcionalidades presentadas al usuario no producen efecto o muestran información estática.
- Fase: Fase 2/3 según se trate de limpieza o conexión funcional.

## 19. Validación inicial

- `npm run typecheck`: **NOT AVAILABLE** — `package.json` no define el script `typecheck`.
- `npm test`: **NOT AVAILABLE** — `package.json` no define el script `test`.
- `npm run build`: **PASS** — compilación, lint/check de tipos de Next y generación de 29 páginas completados; emitió warnings de serialización de caché webpack.
- `npm run lint`: **NOT COMPLETED** — `next lint` abrió el asistente interactivo para configurar ESLint; no existe una configuración que permita una ejecución no interactiva confirmada.

El build también confirma las 10 rutas API enumeradas y las páginas dinámicas `/pacientes/[id]/historial` e `/inventario/[id]/editar`.

## 20. OUT OF SCOPE

- No se modificó código, configuración de seguridad, middleware, API, schema, dependencias ni secrets.
- No se decidió eliminar o implementar TypeORM; `DEC-004` continúa pendiente.
- No se determinó la política de soft-delete; `DEC-011` continúa provisional.
- No se pudo confirmar el contenido de `tunnel.log` por ser binario; requiere revisión separada antes de afirmar exposición.
- No se revisó una base de datos remota, sus políticas RLS, constraints ni datos reales; las conclusiones se limitan al repositorio.
- No se verificaron consumidores fuera del repositorio ni integraciones desplegadas.

## Estado de Fase 0

Baseline técnico actualizado con hallazgos confirmados. La Fase 0 no cambia el estado de `docs/refactor/decisions.md` porque el alcance permite modificar únicamente este archivo.

## Bloqueos para continuar

- La siguiente fase de seguridad debe resolver primero autenticación, autorización, uso de SERVICE_ROLE, IDOR y errores expuestos antes de refactors de performance o limpieza, conforme a `DEC-001` y `DEC-006`.
- No hay comandos automatizados de typecheck/tests definidos; antes de fases de implementación deberá acordarse cómo ejecutar esas validaciones.
- La decisión de TypeORM sigue pendiente y bloquea cualquier eliminación de entidades/configuración asociada.
