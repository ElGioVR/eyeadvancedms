API RULES

Status: CRITICAL

============================================================

# REQUEST PIPELINE

Toda API privada debe seguir conceptualmente:

REQUEST
|
AUTHENTICATION
|
AUTHORIZATION
|
VALIDATION
|
BUSINESS LOGIC
|
DATABASE
|
SANITIZED RESPONSE

============================================================ 2. STATUS CODES

Usar códigos HTTP coherentes.

401:
No autenticado.

403:
Autenticado pero sin permiso.

404:
Recurso no encontrado o no visible según estrategia de seguridad.

400:
Request inválido.

409:
Conflicto.

500:
Error interno.

============================================================ 3. REQUEST BODY

Nunca insertar directamente:

request.json()

Validar y construir explícitamente el objeto permitido.

============================================================ 4. ALLOWLIST

Preferir allowlist:

const data = {
nombre: parsed.nombre,
telefono: parsed.telefono
}

sobre:

const data = body

============================================================ 5. RESPONSE

Las respuestas deben tener estructura consistente.

No devolver objetos internos de DB sin revisar.

============================================================ 6. PAGINATION

Los endpoints de listado deben considerar:

page;
limit;
search;
sort;

cuando el volumen lo requiera.

============================================================ 7. IDS

Validar IDs.

Nunca utilizar un ID recibido como prueba de autorización.

============================================================ 8. ERRORS

No devolver:

error.message

si contiene detalles internos.

============================================================ 9. API CONTRACT

Cambios breaking deben documentarse antes de implementarse.
