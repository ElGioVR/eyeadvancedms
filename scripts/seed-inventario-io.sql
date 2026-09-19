-- Script para insertar datos de inventario de lentes intraoculares (LIO)
-- Basado en imagen de cajas Alcon Clareon IOL y AcrySof IOL
-- Fecha: 2026-09-19

-- NOTA: Ejecutar este script en la base de datos de Supabase
-- Asegúrese de que la tabla inventario_items existe y tiene el schema correcto

BEGIN;

-- Insertar lentes intraoculares Clareon IOL
INSERT INTO inventario_items (
  folio,
  marca,
  modelo,
  codigo_barras,
  grado_esferico,
  grado_cilindrico,
  eje,
  color,
  material,
  stock,
  stock_minimo,
  precio_compra,
  precio_venta,
  lote,
  fecha_caducidad,
  estado,
  notas,
  categoria_id,
  proveedor_id,
  tipo,
  potencia_dioptrias,
  tipo_lio,
  modelo_fabricante
) VALUES
  -- Clareon IOL +23.0D
  (
    'LEN-26-00001',
    'Alcon',
    'Clareon IOL',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    1,
    5,
    NULL,
    NULL,
    '26201558083',
    '2030-02-18',
    'DISPONIBLE',
    'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    NULL,
    NULL,
    'LENTE_INTRAOCULAR',
    23.0,
    'MONOFOCAL',
    '#SY60WF'
  ),
  -- Clareon IOL +20.5D
  (
    'LEN-26-00002',
    'Alcon',
    'Clareon IOL',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    1,
    5,
    NULL,
    NULL,
    '26020404053',
    '2029-04-20',
    'DISPONIBLE',
    'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    NULL,
    NULL,
    'LENTE_INTRAOCULAR',
    20.5,
    'MONOFOCAL',
    '#SY60WF'
  ),
  -- Clareon IOL +21.0D
  (
    'LEN-26-00003',
    'Alcon',
    'Clareon IOL',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    1,
    5,
    NULL,
    NULL,
    '26000794122',
    '2029-03-03',
    'DISPONIBLE',
    'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    NULL,
    NULL,
    'LENTE_INTRAOCULAR',
    21.0,
    'MONOFOCAL',
    '#SY60WF'
  ),
  -- AcrySof IOL MA60AC +17.5D
  (
    'LEN-26-00004',
    'Alcon',
    'AcrySof IOL',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    1,
    5,
    NULL,
    NULL,
    '31605435072',
    '2030-09-14',
    'DISPONIBLE',
    'Lente intraocular Alcon AcrySof - UV Filter - Size B',
    NULL,
    NULL,
    'LENTE_INTRAOCULAR',
    17.5,
    'MONOFOCAL',
    'MA60AC'
  ),
  -- Clareon IOL +19.5D
  (
    'LEN-26-00005',
    'Alcon',
    'Clareon IOL',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    1,
    5,
    NULL,
    NULL,
    '26173477048',
    '2029-12-13',
    'DISPONIBLE',
    'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    NULL,
    NULL,
    'LENTE_INTRAOCULAR',
    19.5,
    'MONOFOCAL',
    '#SY60WF'
  );

-- Registrar movimientos de entrada en el Kardex para cada ítem insertado
-- Esto es necesario para mantener el historial de inventario
INSERT INTO inventario_movimientos (
  inventario_item_id,
  tipo,
  cantidad,
  stock_resultante,
  usuario_id,
  referencia_tipo,
  referencia_id,
  motivo,
  created_at
)
SELECT 
  id,
  'ENTRADA',
  1,
  1,
  NULL,
  'SEED_DATA',
  NULL,
  'Ingreso inicial de inventario desde proveedor Alcon',
  NOW()
FROM inventario_items
WHERE lote IN ('26201558083', '26020404053', '26000794122', '31605435072', '26173477048')
AND NOT EXISTS (
  SELECT 1 FROM inventario_movimientos m 
  WHERE m.inventario_item_id = inventario_items.id
);

COMMIT;

-- Verificar la inserción
SELECT 
  folio,
  marca,
  modelo,
  modelo_fabricante as "modelo_fab",
  potencia_dioptrias as "dioptrias",
  lote as "serie",
  fecha_caducidad as "caducidad",
  stock,
  estado
FROM inventario_items 
WHERE tipo = 'LENTE_INTRAOCULAR'
ORDER BY created_at DESC
LIMIT 10;
