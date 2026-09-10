Fase 2 — Código Muerto y Limpieza
Modelo objetivo

Esta fase debe ser principalmente mecánica.

No introducir cambios arquitectónicos.

Objetivo

Eliminar código que no tiene consumidores reales y dependencias
innecesarias, manteniendo exactamente el comportamiento funcional.

D1 — Archivos candidatos

Verificar consumidores antes de eliminar:

DataTable.tsx
useFilteredData.ts
actions/auth.ts
supabase/server.ts
entities/index.ts
data/index.ts
types/index.ts

No eliminar automáticamente.

Para cada archivo:

buscar imports;
buscar imports dinámicos;
buscar referencias indirectas;
revisar configuración;
eliminar únicamente si no tiene consumidores.
D2 — Mocks

Revisar:

src/data/\*

Identificar mocks huérfanos.

Mantener temporalmente únicamente los utilizados por:

dashboard;
reportes;

si todavía no han sido migrados a API real.

Eliminar el resto después de verificar consumidores.

D3 — Imports sin uso

Eliminar:

imports;
variables;
estados;
funciones;
iconos;
hooks;

que no tengan consumidores.

No modificar lógica funcional como parte de esta tarea.

D4 — ConfirmModal

Actualmente existen dos APIs de props.

Objetivo:

Crear una única API consistente.

Revisar los 8 call-sites.

Migrar todos al mismo contrato.

No cambiar comportamiento visual salvo que sea necesario para
unificar la API.

D5 — Dependencias

Revisar:

pg
typeorm
date-fns
typescript-transform-paths
react-hook-form
@tanstack/react-table
recharts

Para cada dependencia:

buscar imports;
revisar configuración;
revisar scripts;
revisar build;
revisar uso indirecto.

Eliminar únicamente dependencias realmente no utilizadas.

IMPORTANTE:

No eliminar TypeORM si la decisión arquitectónica de Fase 5
todavía no está tomada y su eliminación afecta otros procesos.

D6 — Verificación

Después de cada grupo de eliminaciones:

npm run typecheck

Al finalizar:

npm run typecheck
npm test
npm run build

Restricciones

NO:

modificar APIs;
cambiar esquema de BD;
cambiar autenticación;
cambiar roles;
introducir Server Components;
cambiar queries;
hacer optimizaciones;
hacer deduplicación grande;
cambiar UX.

La única finalidad es eliminar código muerto y limpiar dependencias.

Criterios de aceptación
Código muerto eliminado.
Mocks huérfanos eliminados.
Imports sin uso eliminados.
ConfirmModal unificado.
Dependencias verificadas.
Typecheck OK.
Tests OK.
Build OK.
