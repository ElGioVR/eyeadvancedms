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

const today = new Date().toISOString().slice(0, 10);

const cirugiasData = [
  {
    nombre_paciente: 'María Elena González López',
    expediente: 'EXP-2024-0847',
    fecha: today,
    hora: '08:00',
    jornada: 'Matutina',
    diagnostico: 'Catarata senil bilateral - Ojo Derecho',
    procedimiento: 'Facofemulsificación con implante de LIO',
    ojo: 'OD',
    lio: 'Clareon IOL',
    marca_lio: '#SY60WF +21.0D',
    tiempo_estimado: '45 min',
    tiempo_estancia: '4 horas',
    estado: 'agendada',
    procedencia: 'Consulta externa',
    notas: 'Paciente con hipertensión controlada. Ayuno de 8h.',
  },
  {
    nombre_paciente: 'Roberto Carlos Mendoza Torres',
    expediente: 'EXP-2025-0231',
    fecha: today,
    hora: '09:30',
    jornada: 'Matutina',
    diagnostico: 'Catarata nuclear avanzada - Ojo Izquierdo',
    procedimiento: 'Facofemulsificación con implante de LIO',
    ojo: 'OI',
    lio: 'Clareon IOL',
    marca_lio: '#SY60WF +23.0D',
    tiempo_estimado: '50 min',
    tiempo_estancia: '4 horas',
    estado: 'agendada',
    procedencia: 'Referido por Dr. García',
    notas: 'Paciente diabético tipo 2. Glucosa ayuno < 150.',
  },
  {
    nombre_paciente: 'Ana Lucía Ramírez Vázquez',
    expediente: 'EXP-2024-1205',
    fecha: today,
    hora: '11:00',
    jornada: 'Matutina',
    diagnostico: 'Catarata cortical - Ojo Derecho',
    procedimiento: 'Facofemulsificación con implante de LIO tórico',
    ojo: 'OD',
    lio: 'Clareon IOL Tórica',
    marca_lio: '#SY60WF +19.5D',
    tiempo_estimado: '55 min',
    tiempo_estancia: '5 horas',
    estado: 'agendada',
    procedencia: 'Consulta externa',
    notas: 'Astigmatismo previo. Marca LIO tórico según biometría.',
  },
  {
    nombre_paciente: 'Francisco Javier Herrera Díaz',
    expediente: 'EXP-2025-0089',
    fecha: today,
    hora: '14:00',
    jornada: 'Vespertina',
    diagnostico: 'Catarata traumatica - Ojo Izquierdo',
    procedimiento: 'Extracción extracapsular con implante de LIO',
    ojo: 'OI',
    lio: 'AcrySof IOL',
    marca_lio: 'MA60AC +17.5D',
    tiempo_estimado: '60 min',
    tiempo_estancia: '6 horas',
    estado: 'agendada',
    procedencia: 'Urgencias - Trauma ocular',
    notas: 'Paciente con antecedente de trauma hace 3 meses. Revisar presión intraocular post-op.',
  },
  {
    nombre_paciente: 'Guadalupe Fernanda Castro Ruiz',
    expediente: 'EXP-2024-0678',
    fecha: today,
    hora: '15:30',
    jornada: 'Vespertina',
    diagnostico: 'Catarata +4 con presbicia - Ambos ojos',
    procedimiento: 'Facofemulsificación bilateral secuencial con LIO multifocal',
    ojo: 'OD/OI',
    lio: 'Clareon IOL Multifocal',
    marca_lio: '#SY60WF +20.5D',
    tiempo_estimado: '70 min',
    tiempo_estancia: '6 horas',
    estado: 'agendada',
    procedencia: 'Consulta externa',
    notas: 'Cirugía programada bilateral en sesiones separadas. Primero OD, 2 semanas después OI.',
  },
];

async function seedCirugias() {
  console.log('Iniciando seed de cirugías para hoy...\n');
  console.log(`Fecha: ${today}\n`);

  const { data: doctor, error: doctorError } = await supabase
    .from('doctores')
    .select('id, alias')
    .or('alias.ilike.%piloto%,email.ilike.%piloto%')
    .eq('activo', true)
    .single();

  if (doctorError || !doctor) {
    console.error('Error: No se encontró el doctor PILOTO activo');
    console.error(doctorError?.message || '');
    process.exit(1);
  }

  console.log(`Doctor: ${doctor.alias} (ID: ${doctor.id})\n`);

  const { data: existingCirugias } = await supabase
    .from('agenda_cirugias')
    .select('id')
    .eq('fecha', today)
    .eq('doctor_id', doctor.id);

  if (existingCirugias && existingCirugias.length > 0) {
    console.log(`Ya existen ${existingCirugias.length} cirugías para este doctor hoy. Omitiendo duplicados.`);
  }

  const cirugiasToInsert = cirugiasData.map(c => ({
    ...c,
    doctor_id: doctor.id,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('agenda_cirugias')
    .insert(cirugiasToInsert)
    .select('id, nombre_paciente, hora, procedimiento, ojo');

  if (insertError) {
    console.error('Error al insertar cirugías:', insertError.message);
    console.error('Code:', insertError.code);
    console.error('Details:', insertError.details);
    process.exit(1);
  }

  console.log(`✓ ${inserted.length} cirugías agendadas para hoy:\n`);

  inserted.forEach((c, i) => {
    console.log(`${i + 1}. ${c.hora} - ${c.nombre_paciente}`);
    console.log(`   Procedimiento: ${c.procedimiento} (${c.ojo})`);
    console.log('');
  });

  console.log('========================================');
  console.log('SEED DE CIRUGÍAS COMPLETADO');
  console.log('========================================');
}

seedCirugias().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
