SECURITY RULES

Status: CRITICAL

Estas reglas son obligatorias.

============================================================

# ZERO TRUST

Todo input externo es no confiable.

Nunca confiar automáticamente en:

body;
query;
params;
cookies;
headers;
localStorage;
datos enviados desde React.
============================================================ 2. AUTHENTICATION

Toda API privada debe comprobar sesión.

No asumir que middleware por sí solo es suficiente
si existe riesgo de bypass.

============================================================ 3. AUTHORIZATION

Después de autenticar:

comprobar autorización.

Authentication:
¿Quién eres?

Authorization:
¿Qué puedes hacer?

============================================================ 4. ROLES

Nunca confiar en:

request.role

para determinar permisos.

El rol debe provenir de una fuente confiable.

============================================================ 5. IDOR

Nunca asumir que conocer un UUID significa tener acceso.

Para:

GET /resource/[id]
PATCH /resource/[id]
DELETE /resource/[id]

comprobar:

sesión;
rol;
ownership;
permisos.
============================================================ 6. SERVICE ROLE

SERVICE_ROLE bypasses RLS.

Por lo tanto:

cada uso debe estar justificado.

Nunca exponer SERVICE_ROLE al navegador.

============================================================ 7. SUPABASE

Preferir el cliente normal cuando sea suficiente.

Usar privilegios elevados únicamente cuando sea necesario.

============================================================ 8. INPUT VALIDATION

Utilizar Zod para inputs externos cuando corresponda.

Pipeline:

parse
→ validate
→ authorize
→ database

============================================================ 9. OUTPUT

No devolver:

password_hash;
secrets;
tokens;
errores SQL;
stack traces;
información interna.
============================================================ 10. LOGGING

Nunca registrar:

passwords;
tokens;
API keys;
SERVICE_ROLE_KEY;
información sensible innecesaria.
============================================================ 11. DELETE

Antes de implementar DELETE:

determinar si el dominio requiere:

soft delete;
audit trail;
restricciones de rol;
confirmación.

No implementar hard-delete automáticamente.

============================================================ 12. SECURITY CHANGE

Si una modificación afecta:

autenticación;
autorización;
roles;
secrets;
RLS;
SERVICE_ROLE;

usar modelo de alta capacidad para revisión.

Nunca considerar la tarea terminada únicamente porque compila.
