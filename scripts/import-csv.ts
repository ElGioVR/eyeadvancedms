import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const SUPABASE_URL = 'https://nnbvjoktulbmonaxjiks.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYnZqb2t0dWxibW9uYXhqaWtzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU2MzUxNiwiZXhwIjoyMTA0MTM5NTE2fQ.If0xVo8gYKNJj5F2zJf7IJyDBEZMRu31wGPhzKX79so';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- TYPES ----------

interface CSVRow {
  FECHA: string;
  'HORA DE INGRESO': string;
  'HORA DE EGRESO': string;
  'NUMERO DE TELEFONO': string;
  DOCTOR: string;
  'MEDICO IC': string;
  'NOMBRE  DE PACIENTE': string;
  SEXO: string;
  'FECHA DE NACIMIENTO (MES, DIA Y AÑO)': string;
  EDAD: string;
  CONSULTA: string;
  DIAGNOSTICO: string;
  'TIPO DE CONSULTA': string;
  'ESTUDIO 1': string;
  'ESTUDIO2': string;
  'ESTUDIO3': string;
  OPERADOR: string;
  PROCEDIMIENTO: string;
  ASEGURANZA: string;
  'METODO DE PAGO': string;
  ' COSTO CONSULTA ': string;
  'TIPO DE MONEDA': string;
}

interface DoctorRow {
  nombre: string;
  usuario_id: string;
  doctor_id: string;
}

interface PacienteRow {
  nombre: string;
  paciente_id: string;
}

// ---------- HELPERS ----------

function parseMoney(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeTime(time: string | undefined): string {
  if (!time) return '00:00';
  const cleaned = time.trim().toUpperCase();
  const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '00:00';
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3];
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr.trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function normalizeSexo(s: string): 'MASCULINO' | 'FEMENINO' | 'OTRO' {
  const upper = s.trim().toUpperCase();
  if (upper.includes('MASCULINO') || upper === 'M' || upper === 'MASC') return 'MASCULINO';
  if (upper.includes('FEMENINO') || upper === 'F' || upper === 'FEM') return 'FEMENINO';
  return 'OTRO';
}

function normalizeTipoConsulta(t: string | undefined): string {
  if (!t) return 'CONSULTA';
  const upper = t.trim().toUpperCase();
  if (upper.includes('ESTUDIO')) return 'ESTUDIO';
  if (upper.includes('REVISION') || upper.includes('REVISIÓN')) return 'REVISION';
  if (upper.includes('PROCEDIMIENTO')) return 'PROCEDIMIENTO';
  return 'CONSULTA';
}

function normalizeTipoVisita(t: string | undefined): string {
  if (!t) return 'PRIMERA_VEZ';
  const upper = t.trim().toUpperCase();
  if (upper.includes('SUBSECUENTE')) return 'SUBSECUENTE';
  return 'PRIMERA_VEZ';
}

function normalizeMetodoPago(t: string | undefined): string {
  if (!t) return 'NO_APLICA';
  const upper = t.trim().toUpperCase();
  if (upper.includes('EFECTIVO')) return 'EFECTIVO';
  if (upper.includes('TARJETA')) return 'TARJETA';
  if (upper.includes('TRANSFERENCIA')) return 'TRANSFERENCIA';
  return 'NO_APLICA';
}

function normalizeMoneda(t: string | undefined): string {
  if (!t) return 'PESOS';
  const upper = t.trim().toUpperCase();
  if (upper.includes('DOLAR')) return 'DOLARES';
  return 'PESOS';
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

// ---------- STEP 1: READ CSV ----------

function readCSV(): CSVRow[] {
  const csvPath = path.join('C:\\Users\\Gio\\Downloads', 'ENTRADA Y SALIDA 2026(SEPTIEMBRE).csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }
  const content = fs.readFileSync(csvPath, 'latin1');
  const result = Papa.parse<CSVRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  // Filter rows with actual patient data (skip empty or catalog rows)
  return result.data.filter(
    (row) => row['NOMBRE  DE PACIENTE']?.trim() && row['DOCTOR']?.trim()
  );
}

// ---------- STEP 2: CLEAN DATABASE ----------

async function cleanDatabase() {
  console.log('\n🧹 Limpiando base de datos...');

  // Delete in dependency order
  const tables = [
    'notificaciones',
    'lentes_x_consulta',
    'cobros',
    'consultas',
    'lentes',
    'doctores',
    'usuarios',
    'pacientes',
    'aseguranzas',
    'categorias_lentes',
    'proveedores',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`  ⚠️  Error deleting ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table} limpiado`);
    }
  }
}

// ---------- STEP 3: CREATE DOCTORES ----------

async function createDoctores(rows: CSVRow[]): Promise<Map<string, DoctorRow>> {
  console.log('\n👨‍⚕️ Creando doctores...');
  const doctorMap = new Map<string, DoctorRow>();

  const uniqueDoctors = [...new Set(rows.map((r) => cleanName(r.DOCTOR)))];

  for (const nombre of uniqueDoctors) {
    // Create usuario first
    const email = `${nombre.toLowerCase().replace(/\s+/g, '.')}@eyeadvanced.local`;
    const { data: usuario, error: userError } = await supabase
      .from('usuarios')
      .insert({
        email,
        password_hash: '$2b$10$placeholder',
        nombre,
        rol: 'doctor',
        activo: true,
      })
      .select('id')
      .single();

    if (userError) {
      console.log(`  ⚠️  Error creating usuario for ${nombre}: ${userError.message}`);
      continue;
    }

    // Create doctor
    const { data: doctor, error: doctorError } = await supabase
      .from('doctores')
      .insert({
        usuario_id: usuario.id,
        nombre_completo: nombre,
        especialidad: 'Oftalmologia',
        activo: true,
      })
      .select('id')
      .single();

    if (doctorError) {
      console.log(`  ⚠️  Error creating doctor ${nombre}: ${doctorError.message}`);
      continue;
    }

    doctorMap.set(nombre, { nombre, usuario_id: usuario.id, doctor_id: doctor.id });
    console.log(`  ✅ Dr(a). ${nombre}`);
  }

  return doctorMap;
}

// ---------- STEP 4: CREATE PACIENTES ----------

async function createPacientes(rows: CSVRow[]): Promise<Map<string, PacienteRow>> {
  console.log('\n🧑‍🦯 Creando pacientes...');
  const pacienteMap = new Map<string, PacienteRow>();

  const uniquePatients = new Map<string, CSVRow>();
  for (const row of rows) {
    const name = cleanName(row['NOMBRE  DE PACIENTE']);
    if (!uniquePatients.has(name)) {
      uniquePatients.set(name, row);
    }
  }

  for (const [nombre, row] of uniquePatients) {
    const fechaNac = parseDate(row['FECHA DE NACIMIENTO (MES, DIA Y AÑO)']);
    const sexo = normalizeSexo(row['SEXO']);
    const telefono = row['NUMERO DE TELEFONO']?.trim() || null;
    const edad = row['EDAD'] ? parseInt(row['EDAD'], 10) : null;

    const { data: paciente, error } = await supabase
      .from('pacientes')
      .insert({
        nombre_completo: nombre,
        sexo,
        fecha_nacimiento: fechaNac || '1990-01-01',
        edad: isNaN(edad!) ? null : edad,
        telefono,
      })
      .select('id')
      .single();

    if (error) {
      console.log(`  ⚠️  Error creating paciente ${nombre}: ${error.message}`);
      continue;
    }

    pacienteMap.set(nombre, { nombre, paciente_id: paciente.id });
    console.log(`  ✅ ${nombre}`);
  }

  return pacienteMap;
}

// ---------- STEP 5: CREATE CONSULTAS ----------

async function createConsultas(
  rows: CSVRow[],
  doctorMap: Map<string, DoctorRow>,
  pacienteMap: Map<string, PacienteRow>
): Promise<Map<string, string>> {
  console.log('\n📋 Creando consultas...');
  const consultaMap = new Map<string, string>(); // key: "paciente|fecha|hora" -> consulta_id

  let folioCounter = 1;
  const year = new Date().getFullYear().toString().slice(-2);

  for (const row of rows) {
    const nombrePaciente = cleanName(row['NOMBRE  DE PACIENTE']);
    const nombreDoctor = cleanName(row.DOCTOR);

    const paciente = pacienteMap.get(nombrePaciente);
    const doctor = doctorMap.get(nombreDoctor);

    if (!paciente) {
      console.log(`  ⚠️  Paciente no encontrado: ${nombrePaciente}`);
      continue;
    }
    if (!doctor) {
      console.log(`  ⚠️  Doctor no encontrado: ${nombreDoctor}`);
      continue;
    }

    const fecha = parseDate(row.FECHA);
    if (!fecha) {
      console.log(`  ⚠️  Fecha inválida para ${nombrePaciente}: ${row.FECHA}`);
      continue;
    }

    const horaInicio = normalizeTime(row['HORA DE INGRESO']);
    const horaFin = normalizeTime(row['HORA DE EGRESO']);
    const tipoConsulta = normalizeTipoConsulta(row['TIPO DE CONSULTA'] || row.CONSULTA);
    const tipoVisita = normalizeTipoVisita(row['TIPO DE CONSULTA']);
    const diagnostico = row.DIAGNOSTICO?.trim() || null;
    const estudio1 = row['ESTUDIO 1']?.trim() || null;
    const estudio2 = row['ESTUDIO2']?.trim() || null;
    const estudio3 = row['ESTUDIO3']?.trim() || null;
    const procedimiento = row.PROCEDIMIENTO?.trim() || null;

    const folio = `CO-${year}-${(folioCounter++).toString().padStart(5, '0')}`;

    const { data: consulta, error } = await supabase
      .from('consultas')
      .insert({
        paciente_id: paciente.paciente_id,
        doctor_id: doctor.doctor_id,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tipo_consulta: tipoConsulta,
        tipo_visita: tipoVisita,
        folio,
        diagnostico,
        estudio_1: estudio1,
        estudio_2: estudio2,
        estudio_3: estudio3,
        procedimiento,
      })
      .select('id')
      .single();

    if (error) {
      console.log(`  ⚠️  Error creating consulta for ${nombrePaciente}: ${error.message}`);
      continue;
    }

    const key = `${nombrePaciente}|${fecha}|${horaInicio}`;
    consultaMap.set(key, consulta.id);
    console.log(`  ✅ ${folio} - ${nombrePaciente} con Dr(a). ${nombreDoctor}`);
  }

  return consultaMap;
}

// ---------- STEP 6: CREATE COBROS ----------

async function createCobros(
  rows: CSVRow[],
  pacienteMap: Map<string, PacienteRow>,
  consultaMap: Map<string, string>
) {
  console.log('\n💰 Creando cobros...');

  let folioCounter = 1;
  const year = new Date().getFullYear().toString().slice(-2);

  for (const row of rows) {
    const costoStr = row[' COSTO CONSULTA '];
    if (!costoStr) continue; // Skip rows without cost

    const monto = parseMoney(costoStr);
    if (monto <= 0) continue;

    const nombrePaciente = cleanName(row['NOMBRE  DE PACIENTE']);
    const paciente = pacienteMap.get(nombrePaciente);
    if (!paciente) continue;

    const fecha = parseDate(row.FECHA);
    const horaInicio = normalizeTime(row['HORA DE INGRESO']);
    const key = `${nombrePaciente}|${fecha}|${horaInicio}`;
    const consultaId = consultaMap.get(key) || null;

    const metodoPago = normalizeMetodoPago(row['METODO DE PAGO']);
    const moneda = normalizeMoneda(row['TIPO DE MONEDA']);

    const folio = `CF-${year}-${(folioCounter++).toString().padStart(5, '0')}`;

    const { error } = await supabase.from('cobros').insert({
      paciente_id: paciente.paciente_id,
      consulta_id: consultaId,
      metodo_pago: metodoPago,
      monto,
      moneda,
      pagado: true,
      fecha_pago: fecha ? `${fecha}T12:00:00Z` : null,
      folio,
      notas: null,
    });

    if (error) {
      console.log(`  ⚠️  Error creating cobro for ${nombrePaciente}: ${error.message}`);
      continue;
    }

    console.log(`  ✅ ${folio} - ${nombrePaciente} - $${monto.toLocaleString()}`);
  }
}

// ---------- MAIN ----------

async function main() {
  console.log('========================================');
  console.log('  IMPORTACIÓN CSV → SUPABASE');
  console.log('  EyeAdvanced MS');
  console.log('========================================');

  // Step 1: Read CSV
  const rows = readCSV();
  console.log(`\n📄 CSV leído: ${rows.length} registros válidos`);

  // Step 2: Clean database
  await cleanDatabase();

  // Step 3: Create doctores
  const doctorMap = await createDoctores(rows);
  console.log(`\n📊 Doctores creados: ${doctorMap.size}`);

  // Step 4: Create pacientes
  const pacienteMap = await createPacientes(rows);
  console.log(`\n📊 Pacientes creados: ${pacienteMap.size}`);

  // Step 5: Create consultas
  const consultaMap = await createConsultas(rows, doctorMap, pacienteMap);
  console.log(`\n📊 Consultas creadas: ${consultaMap.size}`);

  // Step 6: Create cobros
  await createCobros(rows, pacienteMap, consultaMap);

  console.log('\n========================================');
  console.log('  ✅ IMPORTACIÓN COMPLETADA');
  console.log('========================================');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
