DATABASE RULES

Status: CRITICAL

============================================================

# DATA SAFETY

Nunca ejecutar cambios destructivos sin confirmación explícita.

============================================================ 2. MIGRATIONS

Todo cambio de schema debe ser reproducible mediante migración.

============================================================ 3. DELETE

Antes de hard-delete:

analizar:

relaciones;
auditoría;
recuperación;
requerimientos de negocio.
============================================================ 4. INDEXES

Indexar cuando exista:

búsqueda frecuente;
foreign key;
filtro frecuente;
orden frecuente.

No crear índices indiscriminadamente.

============================================================ 5. N+1

Buscar queries repetitivas dentro de loops.

============================================================ 6. TRANSACTIONS

Usar transacciones cuando varias operaciones deban ser atómicas.

============================================================ 7. RACE CONDITIONS

No utilizar:

count + 1

para generar identificadores cuando exista concurrencia.

Usar mecanismos seguros:

sequence;
UUID;
atomic operation;
constraint.
============================================================ 8. CONSTRAINTS

No eliminar constraints simplemente para evitar errores.

============================================================ 9. DATA TYPES

Respetar tipos reales de DB.

No asumir que:

number
string
boolean

corresponden automáticamente al schema real.

============================================================ 10. PRODUCTION

Nunca ejecutar operaciones destructivas en producción
como parte automática de un refactor.
