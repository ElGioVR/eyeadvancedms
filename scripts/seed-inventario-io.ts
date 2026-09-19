import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          envVars[key] = value;
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('Error al cargar .env.local:', error);
    return {};
  }
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const lentesData = [
  {
    marca: 'Alcon',
    modelo: 'Clareon IOL',
    stock: 1,
    stock_minimo: 5,
    lote: '26201558083',
    fecha_caducidad: '2030-02-18',
    estado: 'DISPONIBLE',
    notas: 'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    tipo: 'LENTE_INTRAOCULAR',
    potencia_dioptrias: 23.0,
    tipo_lio: 'MONOFOCAL',
    modelo_fabricante: '#SY60WF'
  },
  {
    marca: 'Alcon',
    modelo: 'Clareon IOL',
    stock: 1,
    stock_minimo: 5,
    lote: '26020404053',
    fecha_caducidad: '2029-04-20',
    estado: 'DISPONIBLE',
    notas: 'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    tipo: 'LENTE_INTRAOCULAR',
    potencia_dioptrias: 20.5,
    tipo_lio: 'MONOFOCAL',
    modelo_fabricante: '#SY60WF'
  },
  {
    marca: 'Alcon',
    modelo: 'Clareon IOL',
    stock: 1,
    stock_minimo: 5,
    lote: '26000794122',
    fecha_caducidad: '2029-03-03',
    estado: 'DISPONIBLE',
    notas: 'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    tipo: 'LENTE_INTRAOCULAR',
    potencia_dioptrias: 21.0,
    tipo_lio: 'MONOFOCAL',
    modelo_fabricante: '#SY60WF'
  },
  {
    marca: 'Alcon',
    modelo: 'AcrySof IOL',
    stock: 1,
    stock_minimo: 5,
    lote: '31605435072',
    fecha_caducidad: '2030-09-14',
    estado: 'DISPONIBLE',
    notas: 'Lente intraocular Alcon AcrySof - UV Filter - Size B',
    tipo: 'LENTE_INTRAOCULAR',
    potencia_dioptrias: 17.5,
    tipo_lio: 'MONOFOCAL',
    modelo_fabricante: 'MA60AC'
  },
  {
    marca: 'Alcon',
    modelo: 'Clareon IOL',
    stock: 1,
    stock_minimo: 5,
    lote: '26173477048',
    fecha_caducidad: '2029-12-13',
    estado: 'DISPONIBLE',
    notas: 'Lente intraocular Alcon Clareon - UV & Blue Light Filter',
    tipo: 'LENTE_INTRAOCULAR',
    potencia_dioptrias: 19.5,
    tipo_lio: 'MONOFOCAL',
    modelo_fabricante: '#SY60WF'
  }
];

async function seedInventario() {
  console.log('Iniciando seed de inventario de LIOs...\n');

  const { data: existingItems, error: checkError } = await supabase
    .from('inventario_items')
    .select('lote')
    .eq('tipo', 'LENTE_INTRAOCULAR');

  if (checkError) {
    console.error('Error al verificar inventario existente:', checkError.message);
    process.exit(1);
  }

  const existingLotes = new Set((existingItems || []).map(i => i.lote));
  const newItems = lentesData.filter(item => !existingLotes.has(item.lote));

  if (newItems.length === 0) {
    console.log('Todos los LIOs ya existen en el inventario (por número de serie).');
    process.exit(0);
  }

  console.log(`${newItems.length} LIOs nuevos a insertar (${lentesData.length - newItems.length} ya existentes).\n`);

  const { data: insertedItems, error: insertError } = await supabase
    .from('inventario_items')
    .insert(newItems)
    .select('id, marca, modelo, modelo_fabricante, potencia_dioptrias, lote, fecha_caducidad');

  if (insertError) {
    console.error('Error al insertar inventario:', insertError.message);
    console.error('Code:', insertError.code);
    console.error('Details:', insertError.details);
    process.exit(1);
  }

  console.log(`✓ ${insertedItems.length} LIOs insertados exitosamente:\n`);
  
  insertedItems.forEach((item, index) => {
    console.log(`${index + 1}. ${item.marca} ${item.modelo}`);
    console.log(`   Modelo: ${item.modelo_fabricante} | Dioptrías: ${item.potencia_dioptrias}D`);
    console.log(`   Serie: ${item.lote} | Caducidad: ${item.fecha_caducidad}`);
    console.log('');
  });

  console.log('Registrando movimientos de entrada en Kardex...\n');

  const movimientos = insertedItems.map(item => ({
    inventario_item_id: item.id,
    tipo: 'ENTRADA',
    cantidad: 1,
    stock_resultante: 1,
    usuario_id: null,
    referencia_tipo: 'SEED_DATA',
    referencia_id: null,
    motivo: 'Ingreso inicial de inventario desde proveedor Alcon'
  }));

  const { error: movError } = await supabase
    .from('inventario_movimientos')
    .insert(movimientos);

  if (movError) {
    console.error('Error al registrar movimientos:', movError.message);
    console.log('Los LIOs se insertaron pero no se registraron los movimientos en Kardex.');
  } else {
    console.log(`✓ ${movimientos.length} movimientos de entrada registrados en Kardex`);
  }

  console.log('\n========================================');
  console.log('SEED COMPLETADO EXITOSAMENTE');
  console.log('========================================');
  console.log(`Total insertado: ${insertedItems.length} LIOs\n`);
}

seedInventario().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
