NEXT.JS RULES

Status: ACTIVE

============================================================

# SERVER VS CLIENT

No utilizar:

'use client'

por defecto.

Antes de convertir una página a Client Component:

determinar si realmente necesita:

browser APIs;
estado interactivo;
eventos;
hooks client-side.
============================================================ 2. SERVER COMPONENTS

Preferir Server Components para:

lectura de datos;
páginas de listado;
dashboards;
reportes;

cuando no exista necesidad de interactividad.

============================================================ 3. DATA FETCHING

Evitar descargar datasets completos al navegador si pueden
filtrarse/paginarse en servidor.

============================================================ 4. CACHE

Antes de modificar caching:

determinar si los datos son:

estáticos;
dinámicos;
privados;
dependientes del usuario.
============================================================ 5. API ROUTES

No introducir caching accidental en endpoints de datos privados.

Revisar explícitamente:

dynamic;
revalidate;
cache.
============================================================ 6. IMAGES

Preferir next/image para imágenes optimizables.

No hacer migraciones masivas de imágenes durante tareas no relacionadas.

============================================================ 7. FONTS

Preferir next/font cuando sea apropiado.

No introducir fuentes externas bloqueantes innecesariamente.

============================================================ 8. ROUTING

Antes de crear un link:

verificar que la ruta realmente existe.

============================================================ 9. CLIENT FETCH

Evitar:

window.location.reload()

para actualizar datos.

Preferir mecanismos de actualización controlados.

============================================================ 10. LOADING

Evitar múltiples sistemas redundantes de loading.

No mantener:

loading.tsx

- spinner interno
- skeleton interno

sin una razón clara.

============================================================ 11. NEXT.JS VERSION

Respetar la versión real instalada.

No utilizar APIs disponibles únicamente en versiones diferentes
sin comprobar compatibilidad.
