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
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const proveedoresData = [
  {
    nombre: 'Alcon',
    telefono: '+1 (800) 862-5266',
    email: 'clientes.latam@alcon.com',
    direccion: '62 Inverness Drive East, Aurora, CO 80047, USA',
    contacto: 'Distribuidor Oficial Alcon Mexico',
  },
  {
    nombre: 'Johnson & Johnson Vision',
    telefono: '+1 (800) 423-0193',
    email: 'latam.vision@jnj.com',
    direccion: '501 Arbor Dr, Santa Ana, CA 92705, USA',
    contacto: 'Distribuidor Oficial J&J Vision Mexico',
  },
  {
    nombre: 'Bausch + Lomb',
    telefono: '+1 (800) 323-0233',
    email: 'info@bausch.com',
    direccion: '100 Bausch + Lomb Place, Rochester, NY 14604, USA',
    contacto: 'Distribuidor Oficial Bausch + Lomb Mexico',
  },
  {
    nombre: 'Carl Zeiss Meditec',
    telefono: '+49 3641 64-0',
    email: 'info@zeiss.com.meditec',
    direccion: 'Göschwitzer Str. 51-52, 07745 Jena, Alemania',
    contacto: 'Distribuidor Oficial Zeiss Mexico',
  },
  {
    nombre: 'Hoya Vision',
    telefono: '+81 3 4332 1111',
    email: 'info@hoya.com',
    direccion: '2-7-5 Nishi-Shinjuku, Shinjuku-ku, Tokio, Japón',
    contacto: 'Distribuidor Oficial Hoya Mexico',
  },
];

const categoriasData = [
  {
    nombre: 'Lente Intraocular (LIO)',
    descripcion: 'Lentes implantados quirúrgicamente dentro del ojo para reemplazar el cristalino natural. Usados principalmente en cirugías de cataratas.',
  },
  {
    nombre: 'Lente Monofocal',
    descripcion: 'Lente con una única distancia focal. Proporciona visión clara a una distancia específica (lejos, intermedio o cerca).',
  },
  {
    nombre: 'Lente Multifocal',
    descripcion: 'Lente con múltiples focalidades que permite visión a diversas distancias (lejos, intermedio y cerca).',
  },
  {
    nombre: 'Lente Tórica',
    descripcion: 'Lente diseñada para corregir astigmatismo. Disponible en versiones monofocales y multifocales.',
  },
  {
    nombre: 'Lente EDOF',
    descripcion: 'Lente de rango extendido de foco (Extended Depth of Focus). Proporciona visión continua de lejos a intermedio.',
  },
  {
    nombre: 'Lente de Contacto',
    descripcion: 'Lente que se coloca directamente sobre la superficie del ojo para corregir errores refractivos.',
  },
  {
    nombre: 'Lente Progresivo',
    descripcion: 'Lente oftálmica con transición gradual entre distancias para corrección de presbicia.',
  },
  {
    nombre: 'Lente Bifocal',
    descripcion: 'Lente oftálmica con dos zonas de foco para corrección de visión de lejos y cerca.',
  },
  {
    nombre: 'Lente Filtros UV',
    descripcion: 'Lente con protección contra radiación ultravioleta.',
  },
  {
    nombre: 'Lente Filtros Azul',
    descripcion: 'Lente con filtro de luz azul para protección digital.',
  },
];

async function seedCatalogos() {
  console.log('Iniciando seed de proveedores y categorías...\n');

  // --- PROVEEDORES ---
  console.log('--- PROVEEDORES ---');
  const { data: existingProv } = await supabase
    .from('proveedores')
    .select('nombre');

  const existingProvNames = new Set((existingProv || []).map(p => p.nombre));
  const newProveedores = proveedoresData.filter(p => !existingProvNames.has(p.nombre));

  if (newProveedores.length === 0) {
    console.log('Todos los proveedores ya existen.\n');
  } else {
    const { data: insertedProv, error: provError } = await supabase
      .from('proveedores')
      .insert(newProveedores)
      .select('id, nombre');

    if (provError) {
      console.error('Error al insertar proveedores:', provError.message);
    } else {
      console.log(`✓ ${insertedProv.length} proveedores insertados:`);
      insertedProv.forEach(p => console.log(`  - ${p.nombre}`));
      console.log('');
    }
  }

  // --- CATEGORÍAS ---
  console.log('--- CATEGORÍAS ---');
  const { data: existingCats } = await supabase
    .from('categorias_lentes')
    .select('nombre');

  const existingCatNames = new Set((existingCats || []).map(c => c.nombre));
  const newCategorias = categoriasData.filter(c => !existingCatNames.has(c.nombre));

  if (newCategorias.length === 0) {
    console.log('Todas las categorías ya existen.\n');
  } else {
    const { data: insertedCats, error: catError } = await supabase
      .from('categorias_lentes')
      .insert(newCategorias)
      .select('id, nombre');

    if (catError) {
      console.error('Error al insertar categorías:', catError.message);
    } else {
      console.log(`✓ ${insertedCats.length} categorías insertadas:`);
      insertedCats.forEach(c => console.log(`  - ${c.nombre}`));
      console.log('');
    }
  }

  // --- ASOCIAR LIOs CON PROVEEDOR Y CATEGORÍA ---
  console.log('--- ASOCIANDO LIOs CON PROVEEDOR Y CATEGORÍA ---');

  const { data: alcon } = await supabase
    .from('proveedores')
    .select('id')
    .eq('nombre', 'Alcon')
    .single();

  const { data: catLio } = await supabase
    .from('categorias_lentes')
    .select('id')
    .eq('nombre', 'Lente Intraocular (LIO)')
    .single();

  if (alcon && catLio) {
    const { data: updatedItems, error: updateError } = await supabase
      .from('inventario_items')
      .update({
        proveedor_id: alcon.id,
        categoria_id: catLio.id,
      })
      .eq('tipo', 'LENTE_INTRAOCULAR')
      .is('proveedor_id', null)
      .select('id, modelo, potencia_dioptrias');

    if (updateError) {
      console.error('Error al asociar LIOs:', updateError.message);
    } else {
      console.log(`✓ ${updatedItems.length} LIOs asociados a proveedor Alcon y categoría "Lente Intraocular (LIO)"`);
      updatedItems.forEach(item => {
        console.log(`  - ${item.modelo} ${item.potencia_dioptrias}D`);
      });
    }
  } else {
    console.log('No se encontró el proveedor Alcon o la categoría LIO para asociar.');
  }

  console.log('\n========================================');
  console.log('SEED DE CATÁLOGOS COMPLETADO');
  console.log('========================================');
}

seedCatalogos().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
