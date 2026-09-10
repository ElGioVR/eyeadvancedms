REACT RULES

Status: ACTIVE

============================================================

# COMPONENT RESPONSIBILITY

Un componente debe tener una responsabilidad clara.

============================================================ 2. STATE

No utilizar estado cuando el valor pueda derivarse.

Evitar estados duplicados.

============================================================ 3. FETCHING

No realizar fetch redundante.

Evitar descargar nuevamente toda una tabla después de una
mutación cuando pueda actualizarse únicamente el recurso afectado.

============================================================ 4. ABORT

Requests que puedan solaparse deben considerar AbortController.

============================================================ 5. DEBOUNCE

Inputs de búsqueda que disparen requests deben usar debounce
cuando corresponda.

============================================================ 6. EFFECTS

No utilizar useEffect para lógica que pueda ejecutarse
directamente durante render o mediante eventos.

============================================================ 7. CLIENT CREATION

No crear clientes externos innecesariamente en cada render.

Revisar si pueden vivir a module scope.

============================================================ 8. RELOAD

Evitar:

window.location.reload()

como mecanismo general de actualización.

============================================================ 9. KEYS

No utilizar índices como key si existe un identificador estable.

============================================================ 10. MEMOIZATION

No utilizar:

useMemo
useCallback
memo

por defecto.

Usarlos cuando exista una razón real.

============================================================ 11. ACCESSIBILITY

Mantener:

labels;
keyboard navigation;
aria cuando corresponda;
botones semánticos.
============================================================ 12. LOADING/ERROR

Estados async deben considerar:

loading;
success;
error;
empty.
============================================================ 13. COMPONENT DUPLICATION

Antes de crear un componente genérico:

comprobar que los consumidores realmente comparten comportamiento.
