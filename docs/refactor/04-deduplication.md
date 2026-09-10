Fase 4 — Deduplicación
Objetivo

Eliminar código duplicado sin cambiar comportamiento.

Esta fase ocurre después de performance para evitar abstraer código
que todavía está cambiando.

D1 — CRUD de configuración

Actualmente existen aproximadamente:

5 páginas
~25 funciones CRUD

con alto porcentaje de código duplicado.

Crear una abstracción reutilizable para:

list;
create;
update;
delete;
loading;
error;
confirmación.

La abstracción debe permitir diferencias específicas por entidad.

No crear una abstracción excesivamente genérica.

D2 — API routes de configuración

Existen aproximadamente 4 routes con estructuras casi idénticas.

Crear un módulo/factory común para comportamiento compartido.

Mantener:

validación específica;
permisos específicos;
campos específicos;
nombres de tablas;
respuestas particulares;

cuando corresponda.

No ocultar reglas de negocio importantes detrás de una abstracción
demasiado genérica.

D3 — Utilidades

Centralizar:

getInitials
hashToColor
formatDate
formatMoney
estadoConfig

Ubicación objetivo:

src/lib/

Usar Intl.NumberFormat para dinero según los estándares del proyecto.

D4 — Tipos API

Actualmente existen interfaces repetidas:

PacienteAPI
DoctorAPI
Configuracion\*

Crear tipos compartidos.

Objetivo:

una fuente de verdad

Evitar tipos diferentes para la misma entidad salvo que representen
realmente distintas vistas/DTOs.

D5 — Loading

Existen múltiples loading.tsx similares.

Determinar qué puede compartirse y qué debe permanecer específico.

No abstraer componentes simples si la abstracción aumenta complejidad.

D6 — ConfirmModal

ConfirmModal debe tener un único contrato.

Todos los call-sites deben utilizar la misma API.

D7 — Código repetido

Buscar:

arrays de colores;
cálculo de iniciales;
formatters;
estadoConfig;
interfaces;
handlers CRUD;
validaciones repetidas.

Eliminar duplicación únicamente cuando exista una abstracción clara.

Criterios de aceptación
CRUD de configuración reducido.
API config deduplicada.
Utilidades centralizadas.
Tipos centralizados.
ConfirmModal unificado.
Código repetido innecesario eliminado.
Comportamiento funcional conservado.
Typecheck OK.
Tests OK.
Build OK.
Restricciones

NO:

cambiar arquitectura de base de datos;
implementar TypeORM;
migrar Supabase;
cambiar autenticación;
cambiar roles;
cambiar API contracts sin necesidad;
introducir abstracciones únicamente para reducir líneas de código.

Priorizar mantenibilidad sobre cantidad mínima de archivos.
