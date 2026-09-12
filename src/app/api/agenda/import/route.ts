import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import * as XLSX from 'xlsx';

interface ImportRow {
  'FECHA'?: string;
  'NOMBRE PX'?: string;
  'No. Expediente'?: string | number;
  'HORA CX'?: string;
  'JORNADA'?: string;
  'FECHA NAC.'?: string;
  'SEXO'?: string;
  'EDAD'?: string | number;
  'DIAGNOSTICO'?: string;
  'PROCEDIMIENTO'?: string;
  'OJO'?: string;
  'LIO'?: string | number;
  'MARCA'?: string;
  'TIEMPO ESTIMADO CX'?: string;
  'TIEMPO DE ESTANCIA'?: string;
  'CIRUJANO'?: string;
  'NOTAS'?: string;
}

interface AplazadoRow {
  'NOMBRE PX'?: string;
  'No. Expediente'?: string | number;
  'PROCEDENCIA'?: string;
  'DIAGNOSTICO'?: string;
  'PROCEDIMIENTO'?: string;
  'OJO'?: string;
  'LIO'?: string | number;
  'MOTIVO'?: string;
}

function parseExcelDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

function parseExcelTime(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}:00`;
  }
  const str = String(val).trim();
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`;
  }
  return null;
}

function normalizeOjo(val: string | undefined): string | null {
  if (!val) return null;
  const v = val.trim().toUpperCase();
  if (v === 'OD' || v === 'DERECHO') return 'OD';
  if (v === 'OI' || v === 'OS' || v === 'IZQUIERDO') return 'OI';
  return v;
}

async function findDoctorMatch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  cirujanoTexto: string
): Promise<{ doctor_id: string | null; doctor_nombre: string | null }> {
  if (!cirujanoTexto) return { doctor_id: null, doctor_nombre: null };

  const nombres = cirujanoTexto.split('/').map(n => n.trim()).filter(Boolean);
  if (nombres.length === 0) return { doctor_id: null, doctor_nombre: null };

  const nombreBusqueda = nombres[0];

  const { data: doctores } = await supabase
    .from('doctores')
    .select('id, nombre_completo')
    .eq('activo', true);

  if (!doctores || doctores.length === 0) return { doctor_id: null, doctor_nombre: cirujanoTexto };

  const searchLower = nombreBusqueda.toLowerCase();
  const match = doctores.find(d => {
    const nameLower = d.nombre_completo.toLowerCase();
    return nameLower.includes(searchLower) || searchLower.includes(nameLower);
  });

  if (match) {
    return { doctor_id: match.id, doctor_nombre: match.nombre_completo };
  }

  const matchApellido = doctores.find(d => {
    const apellidos = d.nombre_completo.toLowerCase().split(' ');
    return apellidos.some((a: string) => searchLower.includes(a) && a.length > 3);
  });

  if (matchApellido) {
    return { doctor_id: matchApellido.id, doctor_nombre: matchApellido.nombre_completo };
  }

  return { doctor_id: null, doctor_nombre: cirujanoTexto };
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Formato de datos inválido' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const confirmar = formData.get('confirmar') === 'true';

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó un archivo' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const cirugiaSheet = workbook.Sheets['CIRUGIA'];
  const aplazadosSheet = workbook.Sheets['APLAZADOS'];

  const cirugiaData: ImportRow[] = cirugiaSheet
    ? XLSX.utils.sheet_to_json(cirugiaSheet) as ImportRow[]
    : [];
  const aplazadosData: AplazadoRow[] = aplazadosSheet
    ? XLSX.utils.sheet_to_json(aplazadosSheet) as AplazadoRow[]
    : [];

  if (cirugiaData.length === 0 && aplazadosData.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene datos válidos' }, { status: 400 });
  }

  const filasCirugia: Array<Record<string, unknown>> = [];
  const filasAplazadas: Array<Record<string, unknown>> = [];
  const erroresCount = { cirugia: 0, aplazada: 0 };
  let doctorNoEncontradoCount = 0;

  for (const row of cirugiaData) {
    const nombre = row['NOMBRE PX']?.toString().trim();
    if (!nombre) {
      erroresCount.cirugia++;
      continue;
    }

    const fecha = parseExcelDate(row['FECHA']);
    const hora = parseExcelTime(row['HORA CX']);
    const expediente = row['No. Expediente']?.toString().trim() || null;
    const diagnostico = row['DIAGNOSTICO']?.toString().trim() || null;
    const procedimiento = row['PROCEDIMIENTO']?.toString().trim() || null;
    const ojo = normalizeOjo(row['OJO']?.toString());
    const lio = row['LIO']?.toString().trim() || null;
    const marca = row['MARCA']?.toString().trim() || null;
    const tiempoEstimado = row['TIEMPO ESTIMADO CX']?.toString().trim() || null;
    const tiempoEstancia = row['TIEMPO DE ESTANCIA']?.toString().trim() || null;
    const cirujano = row['CIRUJANO']?.toString().trim() || null;
    const notas = row['NOTAS']?.toString().trim() || null;
    const jornada = row['JORNADA']?.toString().trim() || null;

    let doctorId: string | null = null;
    let doctorNombre: string | null = null;
    if (cirujano) {
      const match = await findDoctorMatch(supabase, cirujano);
      doctorId = match.doctor_id;
      doctorNombre = match.doctor_nombre;
      if (!doctorId) doctorNoEncontradoCount++;
    }

    filasCirugia.push({
      nombre_paciente: nombre,
      expediente,
      fecha,
      hora,
      jornada,
      diagnostico,
      procedimiento,
      ojo,
      lio,
      marca_lio: marca,
      tiempo_estimado: tiempoEstimado,
      tiempo_estancia: tiempoEstancia,
      doctor_id: doctorId,
      estado: fecha ? 'agendada' : 'aplazada',
      notas,
      cirujano_texto: cirujano,
      doctor_nombre_temp: doctorNombre,
    });
  }

  for (const row of aplazadosData) {
    const nombre = row['NOMBRE PX']?.toString().trim();
    if (!nombre) {
      erroresCount.aplazada++;
      continue;
    }

    filasAplazadas.push({
      nombre_paciente: nombre,
      expediente: row['No. Expediente']?.toString().trim() || null,
      diagnostico: row['DIAGNOSTICO']?.toString().trim() || null,
      procedimiento: row['PROCEDIMIENTO']?.toString().trim() || null,
      ojo: normalizeOjo(row['OJO']?.toString()),
      lio: row['LIO']?.toString().trim() || null,
      procedencia: row['PROCEDENCIA']?.toString().trim() || null,
      motivo_aplazamiento: row['MOTIVO']?.toString().trim() || null,
      estado: 'aplazada',
    });
  }

  if (!confirmar) {
    return NextResponse.json({
      preview: true,
      cirugias: filasCirugia,
      aplazadas: filasAplazadas,
      totalCirugias: filasCirugia.length,
      totalAplazadas: filasAplazadas.length,
      erroresCirugia: erroresCount.cirugia,
      erroresAplazada: erroresCount.aplazada,
      doctorNoEncontrado: doctorNoEncontradoCount,
    });
  }

  let insertadas = 0;
  let insertadasAplazadas = 0;
  let erroresInsercion = 0;

  for (const fila of filasCirugia) {
    const { cirujano_texto: _, doctor_nombre_temp: __, ...insertData } = fila;
    const { error } = await supabase
      .from('agenda_cirugias')
      .insert(insertData);
    if (error) erroresInsercion++;
    else insertadas++;
  }

  for (const fila of filasAplazadas) {
    const { error } = await supabase
      .from('agenda_cirugias')
      .insert(fila);
    if (error) erroresInsercion++;
    else insertadasAplazadas++;
  }

  return NextResponse.json({
    preview: false,
    importadas: insertadas,
    aplazadasImportadas: insertadasAplazadas,
    errores: erroresInsercion,
    doctorNoEncontrado: doctorNoEncontradoCount,
  });
}
