# Reglas del proyecto (aplican a todos los agentes)

## Restricciones duras

- NUNCA ejecutar migraciones ni escrituras contra Supabase/PostgreSQL remoto o de producción. Las migraciones son archivos SQL; solo se aplican en una BD local desechable identificada.
- Cambios aditivos: reutilizar tablas y módulos existentes (pacientes, expedientes, consultas, médicos, inventario/LIO, catálogo de servicios, origen, roles, historial). No borrar ni reescribir funcionalidad de Agenda, consultas o estudios salvo que sea imprescindible y se justifique.
- No imprimir ni escribir secretos; no leer `.env` con datos reales.
- Ejecución continua: no pedir confirmación. Ante una ambigüedad elegir lo más conservador y anotarlo en "Decisiones y supuestos" de la auditoría.
- Un requisito solo es CUBIERTO con evidencia concreta (archivo:línea, migración, test, o comando con su salida).

## Fuente de verdad y memoria entre sesiones

- Especificación: `docs/cirugias/fase-1-creacion-cirugia.md` (IDs OBJ-, ORI-, CAT-, PAC-, DAT-, OJO-, MED-, PRD-, EXP-, CON-, LIO-, ARC-, STO-, AUD-, PER-, FLU-, VAL-, AGE-, EST-, DET-, ARQ-, ALC-, FUE-).
- Mapa del repo: `docs/cirugias/00-mapa-repo.md`
- Matriz de auditoría: `docs/cirugias/auditoria-fase-1.md`
- Al iniciar una sesión lee el mapa y la matriz; NO vuelvas a explorar todo el repo. Tras cada bloque actualiza la matriz (estado + evidencia).

## Economía de tokens

- Usa grep/glob antes de abrir archivos y lee por rango de líneas; no releas lo ya leído.
- Filtra salidas largas de comandos (`| tail -n 40`, `| grep -i error`).
- Delega: exploración amplia -> @explore; pruebas/docs/guía -> @mecanico; revisión independiente -> @auditor.
- No cambies de modelo a mitad de una sesión (se pierde el caché).
- Sin pulido extra ni reescrituras completas de archivos para retoques.

## Hidratación SSR/CSR (obligatorio)

- No usar `new Date()`, `Date.now()`, `Math.random()`, `window`, `localStorage`, `sessionStorage` ni `matchMedia` para producir HTML durante el render inicial de componentes client.
- No usar esos valores en inicializadores de `useState`, helpers llamados desde JSX, atributos JSX ni cálculos de etiquetas visibles.
- Para datos dependientes del cliente, inicializar con un valor determinista igual en servidor y cliente y actualizar en `useEffect`; renderizar un placeholder determinista mientras tanto.
- Toda fecha/hora relativa o localizada debe calcularse con un valor capturado en estado después del montaje, no directamente dentro de JSX.
- Si un componente depende de viewport, autenticación, preferencias del navegador o iconos/renderizado condicional, usar un wrapper de montaje client-only con un placeholder idéntico en server y client.
- Antes de cerrar una tarea frontend, ejecutar `npx tsc --noEmit` y auditar con `rg` los patrones anteriores en `src/app` y `src/components`.

## Rendimiento de APIs (obligatorio)

- Endpoints de lectura usados por pantallas interactivas deben responder en <=500 ms objetivo p95 y <=1 s como límite operativo normal.
- Mutaciones deben responder en <=800 ms objetivo p95 y <=2 s como límite operativo normal.
- Todo endpoint que supere 1 s debe medirse con `Server-Timing`, optimizar consultas/payload y justificar cualquier excepción.
- No devolver `*` en consultas de listado; seleccionar únicamente columnas necesarias y limitar/paginar resultados.
- Evitar consultas secuenciales independientes: resolverlas en paralelo cuando no exista dependencia.
- Los clientes deben cancelar requests obsoletos, ignorar respuestas fuera de orden y conservar los datos visibles durante un refresh.
