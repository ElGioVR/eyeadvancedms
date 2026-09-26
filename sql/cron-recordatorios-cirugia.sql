-- OPCIONAL: recordatorios de "cirugía próxima" aunque nadie tenga la app abierta.
-- La app ya los procesa sola mientras haya algún usuario conectado (ver
-- src/services/recordatorios.ts). Este script agrega un respaldo con Supabase
-- (pg_cron + pg_net, disponibles en el plan gratuito) que llama al endpoint cada 10 min.
--
-- Cómo usarlo (una sola vez, en Supabase → SQL Editor):
--   1. Database → Extensions: habilitar "pg_cron" y "pg_net".
--   2. Reemplazar <URL_DE_TU_APP> y <CRON_SECRET> (el mismo valor que en Vercel).
--   3. Ejecutar este script.
-- No ejecutar desde agentes ni scripts automáticos (ver AGENTS.md).

select cron.schedule(
  'recordatorios-cirugia',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://<URL_DE_TU_APP>/api/agenda/notificaciones',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);

-- Para quitarlo:
-- select cron.unschedule('recordatorios-cirugia');
