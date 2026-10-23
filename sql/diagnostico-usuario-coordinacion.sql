-- =====================================================================
-- Diagnostico (SOLO LECTURA) del usuario de coordinacion y de la agenda
-- de noviembre. No modifica nada. Correr en el SQL Editor de Supabase.
-- Si el usuario no se llama "coord...", cambia el filtro del CTE "u".
-- =====================================================================

-- 1) Configuracion del usuario
WITH u AS (
  SELECT * FROM usuarios
  WHERE nombre ILIKE '%coord%' OR email ILIKE '%coord%'
)
SELECT
  u.id, u.nombre, u.email, u.rol, u.activo,
  u.preferencias,
  (u.preferencias->>'modo_focus')            AS modo_focus,   -- 'true' + rol admin => solo ve lo suyo
  u.sesion_activa_id, u.sesion_activa_desde, u.sesion_vista_at, u.sesion_dispositivo,
  au.last_sign_in_at, au.email_confirmed_at, au.banned_until,
  d.id AS doctor_id, d.alias AS doctor_alias, d.activo AS doctor_activo
FROM u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN doctores d ON d.usuario_id = u.id;

-- Interpretacion:
--  * rol fuera de (admin, doctor, recepcionista, enfermero) -> 403 en la agenda.
--  * activo = false                                          -> 403 "Usuario inactivo".
--  * rol = admin + modo_focus = true + doctor_id no nulo     -> la agenda solo muestra
--    las citas de ese doctor (parece que "faltan" pacientes).
--  * sesion_vista_at muy reciente y varias personas usando la misma cuenta
--    -> sesion unica: cada inicio de sesion expulsa al otro equipo (401 intermitente).
--  * banned_until no nulo                                    -> bloqueado en Supabase Auth.

-- 2) Sesiones abiertas de esa cuenta en Supabase Auth (muchas = cuenta compartida)
SELECT s.user_id, s.id AS session_id, s.created_at, s.updated_at, s.user_agent, s.ip
FROM auth.sessions s
WHERE s.user_id IN (SELECT id FROM usuarios WHERE nombre ILIKE '%coord%' OR email ILIKE '%coord%')
ORDER BY s.updated_at DESC
LIMIT 20;

-- 3) Volumen de la vista mes de noviembre 2026 (cuadricula 26-oct a 06-dic).
--    Si alguna fuente pasa de 1000 (o la suma de 500), la version anterior
--    de la agenda cortaba los ultimos dias.
SELECT 'cirugias' AS fuente, count(*) FROM agenda_cirugias WHERE fecha BETWEEN '2026-10-26' AND '2026-12-06'
UNION ALL
SELECT 'consultas', count(*) FROM consultas WHERE fecha BETWEEN '2026-10-26' AND '2026-12-06';

-- 4) Mismo calculo para la vista de octubre 2026 (cuadricula 28-sep a 08-nov):
--    aqui es donde desaparecian los dias 1-8 de noviembre.
SELECT 'cirugias' AS fuente, count(*) FROM agenda_cirugias WHERE fecha BETWEEN '2026-09-28' AND '2026-11-08'
UNION ALL
SELECT 'consultas', count(*) FROM consultas WHERE fecha BETWEEN '2026-09-28' AND '2026-11-08';

-- 5) Citas de noviembre por dia (para comparar contra lo que se ve en pantalla)
SELECT fecha, count(*) FILTER (WHERE src = 'cx') AS cirugias, count(*) FILTER (WHERE src = 'co') AS consultas
FROM (
  SELECT fecha, 'cx' AS src FROM agenda_cirugias WHERE fecha BETWEEN '2026-11-01' AND '2026-11-30'
  UNION ALL
  SELECT fecha, 'co' FROM consultas WHERE fecha BETWEEN '2026-11-01' AND '2026-11-30'
) t
GROUP BY fecha ORDER BY fecha;

-- 6) Citas de noviembre sin fecha valida o sin paciente ligado (no se pintan bien)
SELECT 'consultas sin paciente' AS caso, count(*) FROM consultas c
  LEFT JOIN pacientes p ON p.id = c.paciente_id
  WHERE c.fecha BETWEEN '2026-11-01' AND '2026-11-30' AND p.id IS NULL
UNION ALL
SELECT 'cirugias sin hora', count(*) FROM agenda_cirugias WHERE fecha BETWEEN '2026-11-01' AND '2026-11-30' AND hora IS NULL;
