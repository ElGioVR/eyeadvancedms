PERFORMANCE RULES

Status: ACTIVE

============================================================

# MEASURE FIRST

No optimizar basándose únicamente en intuición.

Identificar primero el cuello de botella.

============================================================ 2. DATABASE

Preferir:

database filtering
database pagination
database aggregation

sobre descargar todos los datos y procesarlos en JavaScript.

============================================================ 3. FULL SCANS

Evitar descargar tablas completas si pueden crecer.

============================================================ 4. WATERFALLS

Identificar requests secuenciales innecesarios.

============================================================ 5. CLIENT BUNDLE

No importar dependencias pesadas en componentes que no las necesitan.

============================================================ 6. IMAGES

Optimizar imágenes grandes.

Preferir formatos modernos y next/image cuando corresponda.

============================================================ 7. SERVER COMPONENTS

Utilizar Server Components cuando permitan reducir:

JavaScript;
requests;
loading;
bundle.
============================================================ 8. CACHE

No cachear información privada incorrectamente.

============================================================ 9. REFRESH

Evitar refetch completo después de cada mutación.

============================================================ 10. PERFORMANCE VS SECURITY

Nunca optimizar eliminando controles de seguridad.

============================================================ 11. PERFORMANCE VS CORRECTNESS

No introducir optimizaciones que cambien comportamiento sin
demostrar equivalencia.
