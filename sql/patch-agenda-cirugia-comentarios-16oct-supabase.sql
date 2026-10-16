-- =====================================================================
-- Comentarios de la clínica «AGENDA DE CIRUGÍA» (16 oct 2026).
-- Idempotente. Ejecutar manualmente en el SQL Editor de Supabase (revisar antes).
--
--  1. Catálogo de cirugías: los 8 nombres oficiales SIN ojo (el ojo se elige aparte).
--     Las filas anteriores de Faco / Pterigión (con ojo en el nombre o genéricas)
--     se DESACTIVAN (no se borran: las cirugías ya agendadas las conservan).
--     El precio de las nuevas se copia del de un ojo de su familia anterior (no OU ni combinadas).
--  2. Lentes: modo 'SIN_TRAMITE' (no elegir Asignar / Solicitar / Compra directa):
--     el lente solo se registra (Hoya, Zeiss u otro proveedor que lo surte).
--  3. Modelos de LIO: Hoya iSert y Bausch + Lomb enVista (no aparecían en la lista).
--     Quedan «por verificar»; se pueden corregir en Configuración → Marcas.
--  4. Historial de cirugía: acción CIRUGIA_CORREGIDA (edición tras completarla).
-- =====================================================================

-- Requisitos (por si no se corrieron): precio del catálogo y columna modo de lentes.
ALTER TABLE catalogo_quirurgico ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cirugia_lentes ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'ASIGNAR';

-- 1. Catálogo de cirugías ------------------------------------------------
WITH oficiales(nombre, familia) AS (
  VALUES
    ('Facoemulsificación del cristalino + LIO monofocal no tórico', 'FACO'),
    ('Facoemulsificación del cristalino + LIO monofocal tórico', 'FACO'),
    ('Facoemulsificación del cristalino + LIO trifocal no tórico', 'FACO'),
    ('Facoemulsificación del cristalino + LIO trifocal tórico', 'FACO'),
    ('Resección de pterigión + autoinjerto conjuntival', 'PTERIGION'),
    ('Resección de pterigión + mitomicina C 0.02 % + autoinjerto conjuntival', 'PTERIGION'),
    ('Resección de pterigión + injerto de membrana amniótica', 'PTERIGION'),
    ('Resección de pterigión + mitomicina C 0.02 % + injerto de membrana amniótica', 'PTERIGION')
),
precios AS (
  -- Precio de referencia: el de un ojo (OD/OI) de la fila anterior; si no hay, el genérico
  -- sin ojo. Se excluyen OU (ambos ojos) y combinaciones con «+» (otro precio).
  SELECT CASE WHEN translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%FACO%' THEN 'FACO' ELSE 'PTERIGION' END AS familia,
         COALESCE(max(precio) FILTER (WHERE ojo IN ('OD', 'OI')),
                  max(precio) FILTER (WHERE ojo IS NULL)) AS precio
    FROM catalogo_quirurgico
   WHERE (translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%FACO%'
          OR translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%PTERIGI%')
     AND position('+' in nombre) = 0
     AND (ojo IS NULL OR ojo IN ('OD', 'OI'))
   GROUP BY 1
)
INSERT INTO catalogo_quirurgico (nombre, ojo, precio, activo)
SELECT o.nombre, NULL, COALESCE(p.precio, 0), true
  FROM oficiales o
  LEFT JOIN precios p ON p.familia = o.familia
 WHERE NOT EXISTS (
   SELECT 1 FROM catalogo_quirurgico c
    WHERE lower(btrim(c.nombre)) = lower(btrim(o.nombre)) AND c.ojo IS NULL
 );

-- Reactiva los oficiales (por si alguno estaba inactivo).
UPDATE catalogo_quirurgico SET activo = true, updated_at = now()
 WHERE ojo IS NULL AND activo = false
   AND lower(btrim(nombre)) IN (
     lower('Facoemulsificación del cristalino + LIO monofocal no tórico'),
     lower('Facoemulsificación del cristalino + LIO monofocal tórico'),
     lower('Facoemulsificación del cristalino + LIO trifocal no tórico'),
     lower('Facoemulsificación del cristalino + LIO trifocal tórico'),
     lower('Resección de pterigión + autoinjerto conjuntival'),
     lower('Resección de pterigión + mitomicina C 0.02 % + autoinjerto conjuntival'),
     lower('Resección de pterigión + injerto de membrana amniótica'),
     lower('Resección de pterigión + mitomicina C 0.02 % + injerto de membrana amniótica'));

-- Desactiva los Faco / Pterigión anteriores: los que llevan el ojo y los genéricos sin «+».
-- Combinaciones que la clínica haya creado (con «+») se respetan.
UPDATE catalogo_quirurgico SET activo = false, updated_at = now()
 WHERE activo = true
   AND (ojo IS NOT NULL OR position('+' in nombre) = 0)
   AND (translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%FACO%'
        OR translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%PTERIGI%')
   AND NOT (ojo IS NULL AND lower(btrim(nombre)) IN (
     lower('Facoemulsificación del cristalino + LIO monofocal no tórico'),
     lower('Facoemulsificación del cristalino + LIO monofocal tórico'),
     lower('Facoemulsificación del cristalino + LIO trifocal no tórico'),
     lower('Facoemulsificación del cristalino + LIO trifocal tórico'),
     lower('Resección de pterigión + autoinjerto conjuntival'),
     lower('Resección de pterigión + mitomicina C 0.02 % + autoinjerto conjuntival'),
     lower('Resección de pterigión + injerto de membrana amniótica'),
     lower('Resección de pterigión + mitomicina C 0.02 % + injerto de membrana amniótica')));

-- 2. Lentes: modo «solo registro» ------------------------------------------
ALTER TABLE cirugia_lentes DROP CONSTRAINT IF EXISTS cirugia_lentes_modo_check;
ALTER TABLE cirugia_lentes ADD CONSTRAINT cirugia_lentes_modo_check
  CHECK (modo IN ('ASIGNAR', 'SOLICITAR', 'COMPRA_DIRECTA', 'SIN_TRAMITE'));

-- 3. Modelos de LIO Hoya iSert y B+L enVista -------------------------------
INSERT INTO cat_modelos_lio (fabricante, modelo, diseno, torico, verificado, origen, notas, activo)
SELECT v.fabricante, v.modelo, v.diseno, v.torico, false, 'MANUAL',
       'Solicitado por la clínica (16 oct 2026); verificar código con el proveedor', true
  FROM (VALUES
    ('Hoya', 'iSert 250', 'MONOFOCAL', false),
    ('Hoya', 'iSert 251', 'MONOFOCAL', false),
    ('Hoya', 'Vivinex iSert XY1', 'MONOFOCAL', false),
    ('Hoya', 'Vivinex Toric iSert XY1A', 'MONOFOCAL', true),
    ('Bausch + Lomb', 'enVista MX60E', 'MONOFOCAL', false),
    ('Bausch + Lomb', 'enVista Toric MX60ET', 'MONOFOCAL', true)
  ) AS v(fabricante, modelo, diseno, torico)
 WHERE NOT EXISTS (
   SELECT 1 FROM cat_modelos_lio m
    WHERE lower(m.fabricante) = lower(v.fabricante) AND lower(m.modelo) = lower(v.modelo) AND m.torico = v.torico
 );

-- Que Hoya y B+L no estén apagados como marca.
UPDATE cat_modelos_lio SET activo = true, updated_at = now()
 WHERE activo = false
   AND (lower(modelo) LIKE '%isert%' OR lower(modelo) LIKE '%envista%');

-- 4. Historial: corrección de una cirugía ya completada ------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cirugia_historial'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%accion%'
  LOOP
    EXECUTE format('ALTER TABLE public.cirugia_historial DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.cirugia_historial
  ADD CONSTRAINT cirugia_historial_accion_check CHECK (accion IN (
    'CIRUGIA_CREADA', 'LIO_ASIGNADO', 'PARTICIPANTE_ASIGNADO',
    'ARCHIVO_AGREGADO', 'ARCHIVO_ELIMINADO', 'ESTADO_CAMBIADO',
    'LENTES_RESUELTOS', 'NOTAS_EDITADAS', 'CONFIRMACION_CITA', 'CIRUGIA_CORREGIDA'
  ));

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT nombre, ojo, precio, activo FROM catalogo_quirurgico
 WHERE translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%FACO%' OR translate(upper(nombre), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%PTERIGI%'
 ORDER BY activo DESC, nombre;
SELECT fabricante, modelo, torico, activo FROM cat_modelos_lio
 WHERE lower(modelo) LIKE '%isert%' OR lower(modelo) LIKE '%envista%' ORDER BY fabricante, modelo;
