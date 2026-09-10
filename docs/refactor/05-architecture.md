Fase 5 — Decisión Arquitectónica
Objetivo

Resolver definitivamente la divergencia entre documentación y código.

La decisión debe basarse en:

complejidad;
mantenimiento;
seguridad;
performance;
costo de migración;
necesidades reales del proyecto;
capacidades de Supabase;
experiencia del equipo.
Estado actual

La arquitectura real es aproximadamente:

Next.js Route
↓
Supabase

Existe infraestructura TypeORM que no participa del runtime principal.

La documentación describe:

Route
↓
Service
↓
Repository
↓
TypeORM
↓
Database

OPCIÓN A — Supabase-first
Recomendación inicial

Mantener Supabase como acceso principal a datos.

Arquitectura propuesta:

Route
↓
Auth / Role Guard
↓
Validation
↓
Business logic cuando sea necesaria
↓
Supabase

No crear Service/Repository simplemente por seguir la documentación
antigua.

Tareas
eliminar TypeORM si no tiene uso real;
eliminar entidades;
eliminar data-source.ts;
eliminar configuración CLI;
eliminar pg si no tiene consumidores;
eliminar dependencias asociadas;
limpiar scripts;
crear índices en BD;
documentar arquitectura real;
actualizar docs/;
documentar endpoints reales;
eliminar documentación de endpoints inexistentes.
OPCIÓN B — Implementar arquitectura Service/Repository/TypeORM

Elegir únicamente si existen razones concretas para hacerlo.

Arquitectura:

Route
↓
Service
↓
Repository
↓
TypeORM
↓
Database

Tareas adicionales
crear Services;
crear Repositories;
crear entidades;
crear migraciones;
configurar DataSource;
definir transacciones;
migrar API routes progresivamente;
crear tests;
crear índices;
eliminar acceso directo a Supabase donde corresponda;
definir estrategia de deployment/migraciones.
Criterios para elegir
Elegir Opción A si:
Supabase cubre las necesidades actuales;
no existe lógica compleja que requiera otra capa;
el equipo quiere menor complejidad;
no se necesita TypeORM;
el costo de migrar a TypeORM no aporta beneficios suficientes.
Elegir Opción B si:
existen necesidades reales de ORM;
se requieren patrones complejos de repositorios;
se necesitan transacciones/lógica que justifiquen la capa;
existe una estrategia clara de migraciones;
el equipo tiene razones concretas para mantener TypeORM.

No elegir B solamente porque así lo describen las docs actuales.

Índices

Independientemente de la opción:

Revisar índices para:

foreign keys;
columnas utilizadas en búsqueda;
columnas utilizadas en orden;
columnas utilizadas en filtros;
timestamps;
estados.

Los índices deben basarse en queries reales.

Documentación

Actualizar documentación para que describa la realidad.

Debe incluir:

arquitectura;
autenticación;
autorización;
roles;
API endpoints reales;
entidades;
esquema de datos;
dependencias;
decisiones importantes;
migraciones;
convenciones.

Eliminar referencias a componentes inexistentes.

Endpoints

Comparar documentación vs implementación.

Documentar explícitamente:

EXISTE
NO EXISTE
DEPRECADO
PLANIFICADO

No documentar como existente algo que todavía no existe.

Criterios de aceptación
Opción A/B elegida.
Decisión registrada en decisions.md.
TypeORM eliminado o implementado realmente.
Índices revisados.
Arquitectura documentada.
Endpoints documentados correctamente.
Dependencias alineadas con la arquitectura.
Tests actualizados.
Typecheck OK.
Build OK.
Regla

No implementar arquitectura por estética.

La arquitectura debe resolver necesidades reales del sistema.
