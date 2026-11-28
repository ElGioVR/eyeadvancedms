-- Solo lectura: indica qué parches de sql/ faltan en esta base. Correr en el SQL Editor.
WITH chequeos(parche, existe) AS (
  VALUES
  ('patch-insumos-inventario-supabase.sql (NUEVO: insumos)',          to_regclass('public.insumos') IS NOT NULL AND to_regprocedure('public.insumo_trasladar(uuid,uuid,integer,uuid,text)') IS NOT NULL),
  ('patch-lente-recibido-notificacion.sql',                           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cirugia_lentes' AND column_name='creado_por')),
  ('patch-push-notificaciones-supabase.sql',                          to_regclass('public.push_suscripciones') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='push_suscripciones' AND column_name='session_id')),
  ('patch-push-notificaciones (recordatorio_para)',                   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agenda_cirugias' AND column_name='recordatorio_para')),
  ('patch-cirugia-lentes-reservas-supabase.sql',                      to_regclass('public.cirugia_lentes') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agenda_cirugias' AND column_name='tipo_caso')),
  ('patch-cirugia-lentes-funciones-supabase.sql',                     EXISTS (SELECT 1 FROM pg_proc WHERE proname='reservar_lente_cirugia') AND EXISTS (SELECT 1 FROM pg_proc WHERE proname='liberar_lentes_cirugia')),
  ('patch-inventario-atomico-supabase.sql',                           EXISTS (SELECT 1 FROM pg_proc WHERE proname='registrar_movimiento_inventario')),
  ('patch-cat-modelos-lio.sql',                                       to_regclass('public.cat_modelos_lio') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agenda_cirugias' AND column_name='modelo_lio_id')),
  ('patch-crear-cirugia-reserva-lio-supabase.sql',                    EXISTS (SELECT 1 FROM pg_proc WHERE proname='crear_cirugia'))
)
SELECT CASE WHEN existe THEN '✅ aplicado' ELSE '❌ FALTA' END AS estado, parche
FROM chequeos ORDER BY existe, parche;
