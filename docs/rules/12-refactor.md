REFACTORING RULES

Status: ACTIVE

============================================================

# REFACTOR != REWRITE

Un refactor mejora estructura sin reescribir el sistema
innecesariamente.

============================================================ 2. ONE CHANGE AT A TIME

Preferir:

seguridad;
limpieza;
performance;
deduplicación;
arquitectura.

No mezclar todo.

============================================================ 3. BASELINE

Antes de refactorizar:

documentar comportamiento actual.

============================================================ 4. DEAD CODE

Eliminar únicamente código confirmado como muerto.

Buscar:

imports;
consumers;
dynamic imports;
routes;
scripts;
config.
============================================================ 5. DUPLICATION

No abstraer antes de entender las diferencias.

============================================================ 6. ARCHITECTURE

No introducir:

services
repositories
factories
patterns

solo porque son considerados "best practice".

La arquitectura debe responder a necesidades reales.

============================================================ 7. API

No cambiar contratos públicos durante un refactor interno
sin documentarlo.

============================================================ 8. DATABASE

No mezclar refactor de aplicación con migraciones complejas
sin una fase específica.

============================================================ 9. DOCUMENTATION

Actualizar docs cuando la arquitectura real cambie.

============================================================ 10. VALIDATION

Cada fase debe poder verificarse independientemente.

============================================================ 11. ROLLBACK

Si un cambio produce regresiones:

detener.

No continuar acumulando cambios encima del problema.

============================================================ 12. FINAL REVIEW

Después de terminar una fase:

revisar diff;
ejecutar tests;
revisar seguridad;
actualizar documentación;
registrar decisiones.
