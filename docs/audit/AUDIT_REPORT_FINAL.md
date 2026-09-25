# AUDIT_REPORT_FINAL.md — Fase 4: Reporte final
## Proyecto: EyeAdvanced Medical Solutions (eyeadvancedms)
**Fecha:** 2026-09-25 · **Ciclo:** auditoría profunda + refactor end-to-end (Fases 0-4).

---

## Resumen ejecutivo

Se ejecutó el ciclo completo sobre el estado real del workspace (119 archivos modificados + ~40 nuevos sin commitear, producto del desarrollo en curso de honorarios simplificados, import masivo de agenda, dashboard con gráficas y renombre de doctores a `alias`).

- **Fase 0** (`AUDIT_DISCOVERY.md`): inventario exacto de 56 API routes, 48 migraciones, desalineaciones del ERD, flujos de negocio por módulo y stack real.
- **Fase 1** (`AUDIT_FINDINGS.md`): 60 hallazgos con evidencia `archivo:línea` (7 críticos, 18 altos, 21 medios, 14 bajos).
- **Fase 2** (`REFACTOR_PLAN.md`): 8 waves ordenados por dependencia técnica, decisión de runner de tests sin dependencias nuevas (node:test), contratos antes/después con consumidores.
- **Fase 3** (`CHANGELOG_AUDIT.md`): implementación de los 8 waves con validación por wave.
- **Fase 4**: este reporte + ERD pendiente de actualización final (ver riesgos).

### Métricas antes → después

| Métrica | Antes | Después |
|---|---|---|
| Endpoints con error de BD invisible (sin log) | ~24 | 0 (todos vía `handleSupabaseError`) |
| Error Boundaries en la app | 0 | 2 (global + dashboard) |
| N+1 críticos (sync/resumen/devengo) | 3 | 0 (batch con chunks de 500) |
| Queries por sync de 150 registros | ~450-750 | ~25-40 (batch) |
| Endpoints de edición de pacientes | 0 | 1 (`PATCH /api/pacientes/[id]`) |
| PII expuesta sin rol (`pacientes/resumen`) | Sí | No (requireRole clínico) |
| `storage_path` interno expuesto al cliente | Sí | No |
| Binarios huérfanos al eliminar archivo | Sí | No (se borra del bucket) |
| Implementaciones duplicadas consolidadas | 9 (normalize ×3, parseCsv ×2, getInitials ×4, formatBytes ×2) | 1 fuente (`lib/text.ts`) |
| recharts en bundle inicial de Dashboard | ~200 kB estáticos | dynamic + skeleton |
| Dependencias muertas | jspdf + jspdf-autotable | removidas |
| Tests unitarios con cobertura | 0 | 23 asserts (`test:unit`), líneas 100% |
| Validación de entrada (search, preferencias, historial) | sin límites/wildcards | escapado + límites + whitelist |
| Protección DoS en imports | ninguno | 5MB + 2000 filas (agenda) / 5MB (aseguranzas) |

### Validación final
- `npx tsc --noEmit` → **OK**.
- `npm run lint` → sin errores nuevos (solo 2 warnings `<img>` preexistentes).
- **Suite de regresión b1-b22**: 18/22 PASAN. Fallos **preexistentes documentados** (no introducidos por este ciclo):
  - `b9` (2): espera `catalogo-servicios?paciente_id=` y un enlace de navegación que cambiaron en el formulario de cirugías (documentado en `docs/cirugias/auditoria-fase-1.md`).
  - `b10` (2): espera `new Date(h.created_at)` (reemplazado por `ClientDate` por regla de hidración) y el botón Crear cirugía que ahora vive en el detalle de consulta.
  - `b11` (5): espera joins ARQ-001 (`origen/servicio`) en el listado de agenda que nunca existieron en la versión actual del route (fallaban antes del ciclo — verificado contra HEAD).
- `npm run test:unit` → 19/19. `npm run test:cobertura` → líneas **100%**, branches 95-98% en `lib/text.ts` y `lib/supabase/handle-error.ts`.
- `npm run build` → **compila** sin errores (First Load JS compartido 87.8 kB).

---

## Riesgos residuales (requieren decisión humana)

1. **🔴 Migraciones pendientes de aplicar en BD remota** (bloqueante de módulos):
   - `sql/patch-doctores-alias.sql` — **el código ya usa `doctores.alias`**: sin aplicarlo, Doctores y joins de doctor devuelven 500.
   - `sql/patch-crear-cirugia-lio-relajado.sql` (RPC con LIO relajado + lio/marca_lio).
   - `sql/patch-indices-perf.sql` (índices + drop RPC muerto).
   - Migraciones 260/261/262/270/280 (honorarios simplificados + etiquetas LIO) según `run-migrations` de la BD local.
2. **Doble esquema de `inventario_items`** (`manufacturer/model` vs `marca/modelo`): el código tiene cascadas de fallback funcionales; se requiere decisión de esquema canónico para eliminarlas (Wave 1.2 del plan, señalado como decisión del admin).
3. **RLS del cliente**: el backend usa service-role en casi todo; la seguridad real depende de los endpoints. Se recomienda auditar las políticas RLS del proyecto Supabase (fuera del repo).
4. **Rate-limit in-memory**: en serverless es best-effort; para endurecer login/search/imports se requiere infra externa (Upstash) — dependencia nueva pendiente de aprobación.
5. **CSP sigue en Report-Only** con `unsafe-inline`: enforcing requiere mover scripts inline (sw-register, ThemeProvider) a archivos.
6. **Tests b9/b10/b11**: requieren actualizar sus asserts al contrato actual (fuera del alcance de "cero regresiones" — son fallos previos documentados, no introducidos ahora).
7. **`crear_consulta` RPC eliminado**: si algún flujo externo lo llamaba, dejará de existir (el código no lo usa).

---

## Documentación
- `docs/audit/AUDIT_DISCOVERY.md` — mapa del estado real (Fase 0).
- `docs/audit/AUDIT_FINDINGS.md` — hallazgos con evidencia (Fase 1).
- `docs/audit/REFACTOR_PLAN.md` — plan y contratos (Fase 2).
- `docs/audit/CHANGELOG_AUDIT.md` — cambios aplicados (Fase 3).
- `docs/ERD.md` / `docs/AI_CONTEXT.md`: **pendiente de actualizar** con `doctores.alias` + tablas faltantes — requiere aplicar primero las migraciones en BD para que la documentación refleje la verdad desplegada (decisión del admin).
