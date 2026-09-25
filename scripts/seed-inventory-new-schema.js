#!/usr/bin/env node
/**
 * Script to delete existing inventory items and seed 5 new items
 * with the new schema fields.
 * Run: node scripts/seed-inventory-new-schema.js
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteAllItems() {
  console.log('Deleting all existing inventory items...');
  
  // First delete movements (kardex) to avoid FK constraints
  const { error: movError } = await supabase
    .from('inventario_movimientos')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
  
  if (movError) {
    console.warn('Warning deleting movements:', movError.message);
  }
  
  // Then delete items
  const { error: itemError } = await supabase
    .from('inventario_items')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
  
  if (itemError) {
    console.error('Error deleting items:', itemError.message);
    return false;
  }
  
  console.log('All items deleted successfully');
  return true;
}

async function seedItems() {
  console.log('Seeding 5 new inventory items...');
  
  const items = [
    {
      manufacturer: 'Alcon',
      product_name: 'Clareon PanOptix Toric IOL',
      model: 'CNATT2',
      sphere: 23.50,
      cylinder: 1.00,
      add_intermediate: 2.17,
      add_near: 3.25,
      nozzle: 'D',
      serial_number: '26169559028',
      expiration_date: '2030-01-06',
      barcode: '26169559028',
      barcode_format: 'CODE_39',
      stock: 10,
      stock_minimo: 3,
      precio_compra: 45000.00,
      precio_venta: 72000.00,
      lote: 'L-2024-001',
      notas: 'LIO Multifocal Torica premium para cirugia de cataratas con presbicia',
      categoria_id: null,
      proveedor_id: null,
    },
    {
      manufacturer: 'Zeiss',
      product_name: 'AT LARA 829MP Toric',
      model: '829MP',
      sphere: 21.00,
      cylinder: 1.50,
      add_intermediate: 1.80,
      add_near: 2.75,
      nozzle: 'C',
      serial_number: 'ZS789456123',
      expiration_date: '2029-06-15',
      barcode: 'ZS789456123',
      barcode_format: 'CODE_128',
      stock: 5,
      stock_minimo: 2,
      precio_compra: 38000.00,
      precio_venta: 65000.00,
      lote: 'Z-2024-012',
      notas: 'LIO EDOF Torica con tecnologia de profundidad de foco extendida',
      categoria_id: null,
      proveedor_id: null,
    },
    {
      manufacturer: 'Johnson & Johnson',
      product_name: 'Tecnis Symfony Toric IOL',
      model: 'ZXT',
      sphere: 22.50,
      cylinder: 2.00,
      add_intermediate: 1.65,
      add_near: 2.50,
      nozzle: 'B',
      serial_number: 'JJ987654321',
      expiration_date: '2029-12-31',
      barcode: 'JJ987654321',
      barcode_format: 'EAN_13',
      stock: 8,
      stock_minimo: 3,
      precio_compra: 42000.00,
      precio_venta: 68000.00,
      lote: 'J-2024-045',
      notas: 'LIO EDOF Torica con tecnologia de difraccion para vision continua',
      categoria_id: null,
      proveedor_id: null,
    },
    {
      manufacturer: 'Bausch + Lomb',
      product_name: 'enVista MX60 Toric',
      model: 'MX60T',
      sphere: 20.00,
      cylinder: 1.25,
      add_intermediate: 0.00,
      add_near: 0.00,
      nozzle: 'A',
      serial_number: 'BL123456789',
      expiration_date: '2028-11-20',
      barcode: 'BL123456789',
      barcode_format: 'CODE_39',
      stock: 15,
      stock_minimo: 5,
      precio_compra: 28000.00,
      precio_venta: 45000.00,
      lote: 'B-2024-078',
      notas: 'LIO Monofocal Torica hidrofobica de acrilico',
      categoria_id: null,
      proveedor_id: null,
    },
    {
      manufacturer: 'Hoya',
      product_name: 'Vivinex iSert XY1 Toric',
      model: 'XY1T',
      sphere: 24.00,
      cylinder: 1.75,
      add_intermediate: 0.00,
      add_near: 0.00,
      nozzle: 'D',
      serial_number: 'HY567890123',
      expiration_date: '2030-03-10',
      barcode: 'HY567890123',
      barcode_format: 'CODE_128',
      stock: 6,
      stock_minimo: 2,
      precio_compra: 32000.00,
      precio_venta: 52000.00,
      lote: 'H-2024-033',
      notas: 'LIO Monofocal Torica pre-cargada con sistema iSert',
      categoria_id: null,
      proveedor_id: null,
    },
  ];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const year = new Date().getFullYear().toString().slice(-2);
    const seq = (i + 1).toString().padStart(5, '0');
    const folio = `LEN-${year}-${seq}`;
    
    const { data, error } = await supabase
      .from('inventario_items')
      .insert({
        folio,
        ...item,
        estado: 'DISPONIBLE',
      })
      .select()
      .single();
    
    if (error) {
      console.error(`Error inserting item ${i + 1}:`, error.message);
      continue;
    }
    
    // Create initial kardex movement (ENTRADA)
    await supabase.from('inventario_movimientos').insert({
      inventario_item_id: data.id,
      tipo: 'ENTRADA',
      cantidad: item.stock,
      stock_resultante: item.stock,
      usuario_id: null,
      referencia_tipo: 'INVENTARIO_INICIAL',
      motivo: `Stock inicial: ${item.stock} unidades`,
    });
    
    console.log(`✓ Created: ${item.manufacturer} ${item.product_name} (${item.model}) - Folio: ${folio}`);
  }
  
  console.log('\nAll 5 items seeded successfully!');
}

async function main() {
  try {
    const deleted = await deleteAllItems();
    if (!deleted) {
      console.error('Failed to delete existing items');
      process.exit(1);
    }
    
    await seedItems();
    
    console.log('\n✅ Inventory reset complete with 5 new items using new schema!');
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

main();