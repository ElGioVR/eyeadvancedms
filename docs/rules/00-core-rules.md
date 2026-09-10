CORE ENGINEERING RULES

Version: 1.0
Status: ACTIVE

Este documento define las reglas obligatorias que cualquier agente de IA
debe seguir al modificar este proyecto.

Estas reglas tienen prioridad sobre preferencias personales del agente.

============================================================

# REGLA PRINCIPAL

NO MODIFICAR CÓDIGO SIN ENTENDERLO.

Antes de cambiar código:

Leer el archivo objetivo.
Leer sus imports.
Buscar sus consumidores.
Buscar sus dependencias.
Entender el flujo de datos.
Entender el contrato existente.
Revisar las reglas aplicables.
Revisar docs/refactor/ si la tarea pertenece al refactor.

No asumir cómo funciona el sistema.

El código real tiene prioridad sobre la documentación cuando existe
una discrepancia.

Si existe una discrepancia:

documentarla;
no inventar una solución;
seguir la decisión registrada en decisions.md.
============================================================ 2. SCOPE CONTROL

Cada tarea tiene un alcance.

El agente SOLO debe modificar:

archivos necesarios;
código directamente relacionado;
tests necesarios;
documentación necesaria.

NO modificar código fuera del alcance.

Si se encuentra un problema adicional:

NO solucionarlo automáticamente.

Reportarlo como:

OUT OF SCOPE

Formato:

OUT OF SCOPE:

archivo:
problema:
riesgo:
recomendación:
============================================================ 3. NO OVERENGINEERING

No introducir abstracciones sin necesidad.

NO crear:

factories;
repositories;
services;
hooks;
utilities;
wrappers;
providers;

si el código no demuestra que son necesarios.

Antes de crear una abstracción debe existir:

duplicación real;
beneficio claro;
contrato estable;
reducción de complejidad.

Regla:

Preferir código simple y explícito sobre arquitectura innecesariamente
abstracta.

============================================================ 4. NO INVENTAR

Está PROHIBIDO inventar:

endpoints;
tablas;
columnas;
relaciones;
roles;
permisos;
tipos;
funciones;
hooks;
variables de entorno;
APIs externas;
comportamiento de negocio.

Si algo no existe:

NO asumir.

Indicar:

MISSING DEPENDENCY

y explicar qué falta.

============================================================ 5. PRESERVAR COMPORTAMIENTO

Un refactor no debe cambiar comportamiento funcional sin autorización.

Antes de modificar:

identificar:

input;
procesamiento;
output;
errores;
efectos secundarios.

Después comprobar que el comportamiento continúa siendo equivalente.

Excepciones:

vulnerabilidades;
bugs documentados;
cambios explícitamente solicitados.
============================================================ 6. SEGURIDAD FIRST

Nunca sacrificar seguridad para simplificar código.

Está prohibido:

desactivar autenticación;
desactivar autorización;
confiar en datos del cliente;
exponer secrets;
imprimir secrets;
devolver errores internos;
utilizar SERVICE_ROLE sin justificación;
ignorar RLS sin motivo documentado;
permitir escalamiento de privilegios.

Si un cambio puede afectar seguridad:

DETENERSE.

Analizar primero.

============================================================ 7. DATOS SENSIBLES

Este proyecto puede manejar información sensible.

Nunca:

loguear datos personales innecesariamente;
imprimir tokens;
imprimir passwords;
imprimir SERVICE_ROLE_KEY;
devolver password_hash;
devolver secrets;
exponer datos de otros usuarios.

Usar:

select específico

en lugar de:

select('\*')

cuando exista riesgo de exposición.

============================================================ 8. VALIDACIÓN

Todo input externo debe considerarse NO CONFIABLE.

Incluye:

request body;
query params;
route params;
cookies;
headers;
IDs;
formularios.

Validar antes de utilizar.

No hacer:

const body = await request.json();

y posteriormente insertar body directamente.

Debe existir:

parse
→ validate
→ authorize
→ transform
→ database

============================================================ 9. AUTORIZACIÓN

Autenticación != autorización.

No basta con:

user != null

También comprobar:

rol;
ownership;
permisos;
contexto de operación.

Nunca confiar en:

body.role

para decidir permisos.

============================================================ 10. TYPESCRIPT

Evitar:

any

salvo que exista una razón documentada.

Preferir:

unknown

cuando el tipo sea desconocido.

No utilizar:

as any

como mecanismo para silenciar errores.

No utilizar:

@ts-ignore

sin justificación.

No utilizar:

@ts-expect-error

sin explicar por qué existe.

============================================================ 11. ERRORES

Los errores internos no deben llegar directamente al cliente.

NO hacer:

catch (error) {
return Response.json({
error: error.message
});
}

si error.message puede revelar:

PostgreSQL;
Supabase;
SQL;
schema;
filesystem;
configuración interna.

Separar:

INTERNAL ERROR

de:

PUBLIC ERROR

============================================================ 12. CAMBIOS INCREMENTALES

Preferir:

10 cambios pequeños

sobre:

1 cambio gigante.

Cada cambio debe ser:

pequeño;
comprobable;
reversible;
entendible.
============================================================ 13. VALIDACIÓN OBLIGATORIA

Después de modificar código ejecutar, cuando existan:

npm run typecheck

npm test

npm run build

Si existe lint:

npm run lint

Si alguno falla:

NO ignorar el error.

Determinar si:

fue causado por el cambio;
ya existía;
es una dependencia externa.

Documentarlo.

============================================================ 14. DIFF REVIEW

Después de implementar:

revisar git diff.

Preguntar:

¿Modifiqué únicamente lo necesario?
¿Hay código no relacionado?
¿Hay archivos modificados accidentalmente?
¿Hay imports innecesarios?
¿Hay console.log?
¿Hay TODO temporales?
¿Hay comentarios innecesarios?
¿Hay cambios de comportamiento no solicitados?
============================================================ 15. CLEAN CODE

Preferir:

nombres descriptivos;
funciones pequeñas;
responsabilidades claras;
dependencias explícitas;
código fácil de leer.

Evitar:

funciones gigantes;
nesting excesivo;
booleanos ambiguos;
nombres genéricos;
duplicación innecesaria;
comentarios que expliquen código obvio.
============================================================ 16. COMENTARIOS

No comentar:

// incrementa contador

si el código ya es evidente.

Sí comentar:

decisiones no obvias;
workarounds;
restricciones externas;
razones de seguridad;
comportamiento de terceros;
decisiones arquitectónicas.
============================================================ 17. DOCUMENTACIÓN

Si una decisión cambia arquitectura:

actualizar:

docs/refactor/decisions.md

Si cambia seguridad:

actualizar:

docs/refactor/01-security.md

Si cambia performance:

actualizar:

docs/refactor/03-performance.md

Si cambia arquitectura:

actualizar:

docs/refactor/05-architecture.md

============================================================ 18. REGLA DE NO REGRESIÓN

Antes de terminar una tarea comprobar:

seguridad;
funcionalidad;
tipos;
tests;
build;
performance cuando corresponda.

No considerar una tarea terminada simplemente porque compila.

============================================================ 19. STOP CONDITIONS

El agente debe DETENERSE y pedir revisión si encuentra:

migración destructiva;
pérdida de datos;
cambio de schema;
modificación de autenticación;
modificación de autorización;
cambio de roles;
cambio de secrets;
eliminación de una API pública;
breaking change;
arquitectura ambigua;
comportamiento de negocio ambiguo.

No asumir.

============================================================ 20. OUTPUT OBLIGATORIO

Al terminar cada tarea responder:

IMPLEMENTED

Qué se modificó.

FILES

Archivos modificados.

VALIDATION

Typecheck:
PASS / FAIL

Tests:
PASS / FAIL / NOT AVAILABLE

Build:
PASS / FAIL / NOT AVAILABLE

Lint:
PASS / FAIL / NOT AVAILABLE

SCOPE

OUT OF SCOPE:

...
RISKS
...
NEXT

Siguiente paso recomendado.

============================================================ 21. REGLA PARA MODELOS BARATOS

Los modelos de menor costo deben recibir tareas:

pequeñas;
concretas;
mecánicas;
con archivos definidos;
con criterios de aceptación claros.

NO delegar a modelos baratos:

decisiones de arquitectura;
seguridad crítica;
autorización;
IDOR;
migraciones destructivas;
decisiones de base de datos;
cambios de contratos públicos.
============================================================ 22. REGLA DE DOS PASOS

Para cambios importantes utilizar:

PASO 1

ANÁLISIS

No modificar código.

PASO 2

IMPLEMENTACIÓN

Implementar únicamente lo aprobado.

Para cambios críticos:

PASO 3

AUDITORÍA

Otro análisis independiente del resultado.

============================================================ 23. PRIORIDAD

Cuando existan conflictos entre objetivos:

Seguridad
Integridad de datos
Correctitud funcional
Compatibilidad
Performance
Mantenibilidad
Elegancia del código
============================================================ 24. REGLA FINAL

Si no estás seguro:

NO INVENTES.

Si el cambio es riesgoso:

DETENTE.

Si el alcance no está claro:

PREGUNTA.

Si encuentras un problema fuera del alcance:

DOCUMENTA.

Si modificas código:

VALIDA.

Si terminas:

REVISA EL DIFF.
