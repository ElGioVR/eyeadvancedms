# FASE 1 — SEGURIDAD P0

**Fecha:** 2026-09-18
**Commits:** `c581e9d`, `e9c31e1`, `b7f791e`

## Cambios aplicados

| # | Item | Cambio | Archivos |
|---|------|--------|----------|
| 1 | Secretos hardcoded | `process.env` + fail-fast si faltan; `.env.example` creado | `run-migrations.js`, `create-admin.ts`, `import-csv.ts`, `.env.example` |
| 2 | Auth bypass `auth.user.role` | Reemplazado por `usuarios.rol` query + `resolveDoctorId` | `reportes/doctor/[id]/route.ts`, `reportes/historico/route.ts` |
| 3 | CRON_SECRET fail-open | Ahora fail-closed (500 si falta) | `agenda/notificaciones/route.ts` |
| 4 | Login sin rate-limit | In-memory rate-limit: 5 intentos → 15min block, por IP+email | `lib/rate-limit.ts` (nuevo), `api/auth/login/route.ts` |
| 5 | CSV injection | `sanitizeCSVCell()` en exports server + client | `liquidaciones/[id]/exportar/route.ts`, `honorarios/doctores/[id]/page.tsx` |
| 6 | next@14.2.0 (35 CVEs) | Actualizado a `14.2.35` | `package.json` |
| 7 | xlsx (CVEs irreparables) | Eliminado; reemplazado por `exceljs` | `api/agenda/import/route.ts`, `reportes/page.tsx` |
| 8 | Historial git con secrets | `git filter-repo` + force push | historial purgado |

## Pendiente (requiere tu decisión)

- **rememberMe real**: Supabase ya persiste sesión con refresh token; checkbox actual es visual. Cambiar requiere modificar `signInWithPassword` options.
- **RLS policies**: SQL listo para revisar (sección F1.6 arriba). No ejecuto cambios sin tu OK.
- **CRON_SECRET → notificaciones POST**: El endpoint usa `doctor_id` para enviar notif; debería usar `doctores.usuario_id`. Cambio el comportamiento de delivery.
- **next@16.x**: Los 8 CVEs restantes requieren next@16 (breaking). No actualizable sin refactor.
- **gitleaks pre-commit**: Requiere instalar herramienta globalmente.

## CVEs pendientes (devDependencies, no explotables en prod)

- `glob@7.2.3` via `@next/eslint-plugin-next`
- `minimatch` via `@typescript-eslint`
- `postcss` via next internals

## Verificación

- `next build` ✅
- `git log --all -- scripts/` ✅ (sin commits con secrets)
- `npm audit` — 8 vulns (2 mod, 7 high, 1 crit) todos en devDeps o requieren next@16
