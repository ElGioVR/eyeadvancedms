CODE QUALITY RULES

Status: ACTIVE

============================================================

# PRINCIPIOS

El código debe ser:

legible;
predecible;
mantenible;
tipado;
testeable;
simple.

Preferir claridad sobre clever code.

============================================================ 2. FUNCIONES

Una función debe tener una responsabilidad principal.

Evitar funciones que:

validen;
autoricen;
consulten DB;
transformen;
formateen;
y construyan HTTP responses

todo al mismo tiempo.

Separar responsabilidades cuando exista complejidad real.

============================================================ 3. DUPLICACIÓN

No abstraer duplicación accidental.

Antes de crear una abstracción:

buscar todos los consumidores.

Si dos bloques son similares pero tienen reglas de negocio diferentes:

NO unirlos automáticamente.

============================================================ 4. NOMBRES

Preferir:

getPatientById

sobre:

getData

Preferir:

isAdmin

sobre:

flag

Preferir:

patientId

sobre:

id

cuando el contexto lo permita.

============================================================ 5. TYPESCRIPT

No usar any para evitar problemas de tipos.

No usar casts innecesarios.

Preferir tipos derivados de fuentes existentes cuando sea posible.

Evitar mantener interfaces duplicadas que representen la misma entidad.

============================================================ 6. IMPORTS

Eliminar:

imports sin uso;
variables sin uso;
funciones sin consumidores.

No realizar limpieza masiva durante una tarea funcional
si aumenta el riesgo del cambio.

============================================================ 7. CONSTANTES

No repetir strings críticos.

Ejemplos:

roles;
estados;
nombres de permisos;
códigos de error.

Centralizar únicamente cuando exista reutilización real.

============================================================ 8. MAGIC VALUES

Evitar números o strings cuyo significado no sea evidente.

En lugar de:

if (status === 3)

usar una constante o enum si el dominio realmente lo necesita.

============================================================ 9. ASYNC

No ejecutar operaciones secuenciales si son independientes.

Evitar:

await A()
await B()
await C()

cuando A, B y C no dependen entre sí.

Considerar Promise.all cuando sea seguro.

============================================================ 10. SIDE EFFECTS

Evitar side effects ocultos.

Una función debe dejar claro si:

modifica DB;
modifica estado;
realiza requests;
escribe archivos;
emite eventos.
============================================================ 11. CONSOLE

No dejar:

console.log()

de debugging.

Antes de finalizar una tarea:

buscar:

console.log
coor
console.warn

y verificar si son intencionales.

============================================================ 12. TODO

No introducir TODO como sustituto de implementación.

Si algo queda pendiente:

documentarlo en la documentación de la fase correspondiente.

============================================================ 13. ABSTRACCIONES

Una abstracción debe reducir complejidad.

Si una abstracción hace que una función sencilla requiera:

factory;
config;
adapter;nsole.err
wrapper;
generic;
provider

sin beneficio claro:

NO crearla.

============================================================ 14. CRITERIO DE CALIDAD

Antes de terminar:

¿Otro desarrollador puede entender el código rápidamente?

Si la respuesta es NO:

simplificar.
