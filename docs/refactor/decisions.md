Decisiones Arquitectónicas del Refactor

Este archivo contiene decisiones que deben considerarse permanentes
hasta que exista una nueva decisión explícita que las reemplace.

Los modelos deben leer este archivo antes de proponer cambios
arquitectónicos.

DEC-001 — Seguridad primero

Estado:

APROBADA

La seguridad tiene prioridad sobre:

performance;
deduplicación;
limpieza;
arquitectura.

No continuar con refactors grandes mientras existan vulnerabilidades
críticas conocidas.

DEC-002 — Cambios incrementales

Estado:

APROBADA

El refactor debe ejecutarse en pasos pequeños.

Cada paso debe:

modificar una responsabilidad concreta;
ejecutar typecheck;
ejecutar tests;
revisar diff;
documentar problemas.

Evitar cambios gigantes difíciles de revisar.

DEC-003 — No implementar documentación inexistente

Estado:

APROBADA

La documentación actual contiene arquitectura y endpoints que no
existen.

No implementar automáticamente una arquitectura únicamente porque
aparece en la documentación.

Primero determinar si aporta valor.

DEC-004 — TypeORM

Estado:

PENDIENTE

Decisión pendiente entre:

A — eliminar TypeORM
B — implementarlo realmente

No eliminar TypeORM antes de tomar esta decisión si existen procesos
que dependan de él.

DEC-005 — Supabase

Estado:

APROBADA PROVISIONALMENTE

La implementación actual utiliza Supabase como acceso principal a datos.

No crear Repository/Service/TypeORM únicamente por razones estéticas.

La arquitectura definitiva se decidirá en Fase 5.

DEC-006 — SERVICE_ROLE

Estado:

APROBADA

SERVICE_ROLE nunca debe considerarse un mecanismo de autorización.

Toda operación sensible debe pasar por:

Authentication
↓
Authorization
↓
Validation
↓
Database

DEC-007 — Validación

Estado:

APROBADA

Los datos provenientes de requests deben validarse antes de llegar
a la base de datos.

Zod será el mecanismo principal de validación de request bodies
cuando sea apropiado.

DEC-008 — Tipos

Estado:

APROBADA

Evitar múltiples interfaces que representen la misma entidad.

Preferir tipos compartidos y DTOs explícitos cuando las formas
realmente sean diferentes.

DEC-009 — Seguridad de datos sensibles

Estado:

APROBADA

Nunca enviar al cliente campos sensibles innecesarios.

Especialmente:

password hashes;
secrets;
tokens;
información interna de BD;
PHI innecesaria.
DEC-010 — Errores

Estado:

APROBADA

Los errores internos no deben exponerse directamente al cliente
en producción.

Las respuestas API deben ser seguras y consistentes.

DEC-011 — DELETE

Estado:

APROBADA PROVISIONALMENTE

Las entidades sensibles deben evaluarse para soft-delete y
auditabilidad.

No convertir todos los DELETE automáticamente.

La decisión debe considerar:

relaciones;
integridad;
requisitos del negocio;
auditoría.
DEC-012 — Performance

Estado:

APROBADA

Preferir:

server-side pagination
server-side search
server-side filtering

sobre descargar datasets completos al navegador.

DEC-013 — Duplicación

Estado:

APROBADA

No crear abstracciones únicamente para reducir cantidad de líneas.

Una abstracción debe:

reducir complejidad;
mejorar consistencia;
ser reutilizable;
mantener claridad.
DEC-014 — Server Components

Estado:

APROBADA PROVISIONALMENTE

Las páginas de solo lectura deben evaluarse para migración a
Server Components.

No eliminar use client automáticamente.

DEC-015 — Modelos de IA

Estado:

APROBADA

Usar modelos según la dificultad.

GPT 5.6 Luna:

arquitectura;
seguridad;
decisiones;
debugging difícil;
revisión;
auditoría.

Qwen3.7 Plus:

implementación compleja;
performance;
cambios que requieren comprensión del proyecto.

MiMo-V2.5:

limpieza;
deduplicación;
tareas mecánicas;
implementación claramente especificada.
DEC-016 — Flujo de trabajo con IA

Estado:

APROBADA

Usar:

GPT 5.6 Luna
↓
plan
↓
archivo docs/refactor/\*.md
↓
modelo de menor costo
↓
implementación
↓
tests
↓
GPT 5.6 Luna
↓
review

No enviar toda la auditoría original a cada modelo.

Cada modelo debe leer únicamente los documentos necesarios para
su tarea.

DEC-017 — No mezclar fases

Estado:

APROBADA

Durante una tarea:

no arreglar problemas no relacionados;
no hacer refactors oportunistas;
no modificar fases futuras;
no cambiar arquitectura sin autorización.

Si se descubre un problema nuevo:

documentarlo;
clasificarlo;
asignarlo a una fase;
continuar con la tarea actual si es seguro.
DEC-018 — Estado

Estado de ejecución:

Fase 0 — PENDIENTE
Fase 1 — PENDIENTE
Fase 2 — PENDIENTE
Fase 3 — PENDIENTE
Fase 4 — PENDIENTE
Fase 5 — PENDIENTE
Auditoría final — PENDIENTE

Actualizar este archivo cuando una fase cambie de estado.

Registro de nuevas decisiones

Cuando aparezca una decisión arquitectónica nueva:

DEC-XXX

Estado:
PROPUESTA / APROBADA / RECHAZADA / REEMPLAZADA

Decisión:
...

Motivo:
...

Consecuencias:
...

Fecha:
...

DEC-019 — Matriz S3 de autorización por roles

Estado:

APROBADA — lista para implementación en S3

Contexto:

La matriz original de `docs/refactor/01-security.md`, líneas 237-278,
marcaba `AUTH` genérico para `admin`, `doctor` y `recepcionista` en todas
las operaciones, sin diferenciar por rol ni por operación. Esta decisión
reemplaza esa matriz con autorización diferenciada por área y método.

Roles existentes:

- `admin`
- `doctor`
- `recepcionista`

No se crea ni se incorpora un rol `inventario`. Las tareas de inventario
corresponden al rol `recepcionista` según esta decisión.

Matriz:

| Área | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| Usuarios | `admin` | `admin` | `admin` | `admin` |
| Configuración: proveedores, aseguranzas, categorías-lentes y doctores | `admin`, `doctor`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` |
| Cobros | `admin`, `doctor`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` |
| Inventario | `admin`, `doctor`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` | `admin`, `recepcionista` |

Reglas adicionales:

- En Configuración, Cobros e Inventario, `doctor` tiene solo lectura.
- En Usuarios, todas las operaciones están restringidas a `admin`.
- La autorización debe ejecutarse server-side usando el rol obtenido de una
  fuente confiable del servidor.
- Un rol enviado por el cliente no determina la autorización.
- Una sesión válida sin el rol requerido recibe `403`.
- La identidad del actor se obtiene de la sesión, no de `user_id` enviado por
  body, query string o headers.
- `SERVICE_ROLE` no es un mecanismo de autorización.

Consecuencias:

- S3 puede implementar guards por rol conforme a esta matriz.
- S4 debe mantener la administración de usuarios restringida a `admin`.
- Las operaciones de inventario no requieren crear un cuarto rol.
- `docs/refactor/01-security.md` se actualizará después de verificar la
  implementación S3 contra esta decisión.

Fecha:

2026-09-07
