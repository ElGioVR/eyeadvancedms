Fase 3 — Performance
Objetivo

Reducir:

transferencia de datos;
tiempo de respuesta;
queries innecesarias;
waterfalls;
tamaño del bundle;
trabajo del navegador;
refetches completos.
P1 — Paginación server-side

Endpoints prioritarios:

pacientes
consultas
cobros
inventario

Eliminar patrones que descarguen tablas completas.

Implementar:

?page=1&pageSize=25

o equivalente.

Supabase debe realizar la paginación.

P2 — Búsqueda server-side

Mover búsqueda desde:

dataset completo → filter()

hacia queries server-side.

Usar query params.

Ejemplo:

/api/pacientes?search=juan&page=1

Validar y limitar parámetros.

P3 — Orden server-side

Permitir únicamente columnas conocidas.

No aceptar directamente nombres de columnas arbitrarios.

Crear allowlist.

P4 — Caching / Dynamic

Revisar todos los GET handlers.

En Next.js 14.2 determinar explícitamente si cada endpoint necesita:

dynamic;
revalidation;
caching;
no-store.

Evitar datos congelados cuando se espera información en tiempo real.

No aplicar force-dynamic indiscriminadamente sin entender el
comportamiento deseado.

P5 — Eliminar waterfalls

Revisar especialmente:

cobros → doctores;
consultas → cobros;
pacientes → consultas.

Evitar:

query A
↓
query B
↓
query C

cuando pueda resolverse eficientemente mediante joins/queries
adecuadas.

P6 — Counts

Eliminar:

SELECT todos
↓
contar en JavaScript

Usar count/aggregate apropiado en la base de datos.

P7 — Inventario individual

Crear:

GET /api/inventario/[id]

para editar un solo registro.

Eliminar:

GET inventario completo
↓
find(id)

P8 — Server Components

Migrar progresivamente páginas de solo lectura.

Prioridad:

dashboard;
reportes;
pacientes;
inventario;
consultas;
cobros.

No migrar una página simplemente por reducir use client.

Mantener Client Components únicamente donde exista necesidad real
de interacción/browser APIs.

P9 — Suspense

Usar Suspense donde permita:

streaming;
loading independiente;
menor tiempo hasta contenido útil.

No introducir Suspense únicamente por cambiar arquitectura.

P10 — useFetch

Agregar:

AbortController

para evitar races.

Evitar:

mutation
↓
reload completo de tabla

cuando pueda actualizarse únicamente el estado necesario.

P11 — Filtros

Agregar debounce a filtros de configuración.

Evitar ejecutar trabajo en cada pulsación cuando no sea necesario.

P12 — Supabase Client

Mover:

createClient()

fuera del cuerpo de componentes cuando sea seguro.

Revisar:

Sidebar;
login;
otros componentes.
P13 — Login

Actualmente existen aproximadamente 2.5 MB de imágenes.

Objetivo:

usar next/image;
lazy-load;
optimizar formatos;
evitar cargar todas las imágenes simultáneamente.

Objetivo orientativo:

~2.5 MB → <300 KB

si la calidad visual lo permite.

P14 — Fuentes

Eliminar:

@import url(...)

de Google Fonts.

Usar:

next/font

Reducir pesos cargados a los realmente utilizados.

P15 — OCR

Revisar LabelScanner.

Actualmente se crea un worker OCR nuevo por fotografía y se cargan
dos idiomas.

Evaluar reutilización del worker.

No sacrificar funcionalidad por optimización.

P16 — Bundle

Revisar dependencias server-side.

Determinar si:

pg
typeorm

son realmente necesarios.

La decisión definitiva puede depender de Fase 5.

Validación

Medir antes/después cuando sea posible:

tamaño de respuesta;
número de queries;
tiempo de respuesta;
tamaño de bundle;
tiempo de carga;
número de requests.

Ejecutar:

npm run typecheck
npm test
npm run build

Restricciones

No realizar deduplicación masiva durante esta fase.

Primero optimizar el comportamiento.

No cambiar contratos API sin documentarlo.

No sacrificar seguridad para obtener performance.
