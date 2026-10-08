-- =====================================================================
-- Verificación de reservas de lentes (NO es migración). Ejecutar SOLO en una
-- base de prueba desechable, nunca en producción. Termina con ROLLBACK.
-- Sustituye los UUID de la sección "DATOS DE PRUEBA" por datos reales de
-- tu base de prueba: un ítem de LIO con stock 1 y dos cirugías distintas.
-- =====================================================================
BEGIN;

-- DATOS DE PRUEBA
-- :item = id de inventario_items con stock = 1
-- :c1, :c2 = ids de agenda_cirugias distintas (sin lentes reservados)
\set item   '00000000-0000-0000-0000-000000000001'
\set c1     '00000000-0000-0000-0000-000000000002'
\set c2     '00000000-0000-0000-0000-000000000003'

-- 1) La primera reserva debe funcionar
SELECT estado FROM reservar_lente_cirugia(:'c1'::uuid, 'PRIMERO', 'INVENTARIO', :'item'::uuid, 'PRUEBA', 'MODELO', 22.5, false);

-- 2) La segunda reserva del mismo ítem debe FALLAR con LENTE_SIN_DISPONIBLE
DO $$
BEGIN
  PERFORM reservar_lente_cirugia(:'c2'::uuid, 'PRIMERO', 'INVENTARIO', :'item'::uuid, 'PRUEBA', 'MODELO', 22.5, false);
  RAISE EXCEPTION 'FALLO: la segunda reserva no debió funcionar';
EXCEPTION WHEN SQLSTATE 'P0002' THEN
  RAISE NOTICE 'OK: segunda reserva rechazada (LENTE_SIN_DISPONIBLE)';
END $$;

-- 3) Al liberar la primera, la segunda debe poder reservar
SELECT liberar_lentes_cirugia(:'c1'::uuid, NULL) AS liberados;
SELECT estado FROM reservar_lente_cirugia(:'c2'::uuid, 'PRIMERO', 'INVENTARIO', :'item'::uuid, 'PRUEBA', 'MODELO', 22.5, false);

ROLLBACK;
