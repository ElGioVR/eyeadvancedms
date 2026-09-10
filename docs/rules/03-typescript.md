TYPESCRIPT RULES

Status: ACTIVE

============================================================

# STRICT TYPING

Preferir tipos explícitos en:

funciones públicas;
API responses;
database boundaries;
componentes reutilizables.
============================================================ 2. ANY

Evitar any.

Si es inevitable:

documentar por qué.

============================================================ 3. UNKNOWN

Cuando un valor realmente sea desconocido:

usar unknown.

Después validar/narrowear.

============================================================ 4. TYPE ASSERTIONS

Evitar:

as SomeType

cuando el valor no esté garantizado.

Un cast no valida datos.

============================================================ 5. API TYPES

Los tipos de API deben estar centralizados cuando representen
el mismo contrato.

No crear:

PacienteAPI1
PacienteAPI2
PacienteAPI3

si representan el mismo recurso.

============================================================ 6. NULLABILITY

Manejar explícitamente:

null
undefined

No utilizar non-null assertions (!) sin garantía real.

============================================================ 7. ENUMS

No crear enums por defecto.

Considerar unions cuando sean suficientes:

type Role = 'admin' | 'doctor' | 'recepcionista';

============================================================ 8. TYPE ERRORS

Nunca resolver un error de TypeScript simplemente mediante:

as any

@ts-ignore

Cambiar el código o el tipo correctamente.

============================================================ 9. TYPES VS INTERFACES

Usar una estrategia consistente dentro del proyecto.

No cambiar interfaces a types simplemente por preferencia
durante un refactor no relacionado.
