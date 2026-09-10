TESTING RULES

Status: ACTIVE

============================================================

# TESTS

Todo cambio importante debe tener validación apropiada.

============================================================ 2. SECURITY

Para cambios de seguridad considerar tests de:

no autenticado;
usuario incorrecto;
rol incorrecto;
recurso ajeno;
input inválido.
============================================================ 3. API

Para API importante comprobar:

200
201
400
401
403
404
409
500

cuando correspondan.

============================================================ 4. REGRESSION

No eliminar tests simplemente porque fallan después de un refactor.

Determinar primero si el test está obsoleto o si el código se rompió.

============================================================ 5. MOCKS

No crear mocks que oculten problemas reales de integración.

============================================================ 6. TEST SIZE

Preferir tests pequeños y deterministas.

============================================================ 7. BEFORE/AFTER

En refactors importantes:

comprobar comportamiento antes y después cuando sea posible.

============================================================ 8. COMPLETION

Una tarea no está terminada solo porque:

npm run typecheck

pasa.

Debe comprobarse la validación relevante al cambio.
