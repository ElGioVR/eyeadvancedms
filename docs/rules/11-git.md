GIT RULES

Status: ACTIVE

============================================================

# SMALL COMMITS

Preferir commits pequeños y relacionados.

============================================================ 2. SCOPE

Un commit debería representar una intención clara.

Ejemplo:

security: protect patient API

Mejor que:

refactor everything

============================================================ 3. DIFF

Antes de finalizar:

git diff

revisar:

archivos;
líneas;
cambios accidentales.
============================================================ 4. NO SECRETS

Nunca committear:

.env.local;
credentials;
API keys;
tokens;
dumps sensibles;
logs con información sensible.
============================================================ 5. GENERATED FILES

No modificar archivos generados manualmente salvo necesidad real.

============================================================ 6. FORMAT

Respetar el formatter/linter existente.

No introducir cambios masivos de formatting durante tareas
funcionales.

============================================================ 7. REVERTABILITY

Los cambios deberían poder revertirse razonablemente.

============================================================ 8. COMMIT MESSAGE

Cuando se solicite un commit:

usar formato claro:

feat:
fix:
refactor:
security:
perf:
test:
docs:
chore:
