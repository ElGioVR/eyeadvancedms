SUPABASE RULES

Status: CRITICAL

============================================================

# RLS

Asumir que RLS es parte fundamental de la seguridad.

No bypass RLS sin justificación.

============================================================ 2. SERVICE ROLE

SERVICE_ROLE solo debe utilizarse server-side.

Nunca:

componentes React;
browser;
código enviado al cliente.
============================================================ 3. QUERIES

Preferir columnas explícitas:

select('id,nombre,email')

sobre:

select('\*')

especialmente en datos sensibles.

============================================================ 4. PAGINATION

No descargar tablas completas cuando el dataset pueda crecer.

Usar:

range()

o mecanismo equivalente.

============================================================ 5. FILTERING

Preferir filtrado server-side para datasets grandes.

============================================================ 6. ERROR HANDLING

No exponer directamente errores de Supabase al usuario.

============================================================ 7. JOINS

Evitar múltiples requests secuenciales cuando una query
o relación pueda resolver el problema de forma segura.

============================================================ 8. MIGRATIONS

Cambios de schema deben estar documentados y ser reproducibles.

No modificar producción manualmente como sustituto de una migración.

============================================================ 9. INDEXES

Antes de optimizar una query lenta:

comprobar si faltan índices adecuados.

============================================================ 10. DATA INTEGRITY

No eliminar constraints ni relaciones para "hacer funcionar"
una operación.
