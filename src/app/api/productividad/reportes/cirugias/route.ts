import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { CSV_BOM, rangoPersonalizado } from '@/lib/rangos';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

const PAGE_SIZE = 1000;
const MAX_FILAS = 10000;
const CHUNK_IN = 200;

const ENCABEZADOS = [
  'FECHA',
  'NOMBRE PX',
  'No. Expediente',
  'HORA CX',
  'JORNADA',
  'FECHA NAC.',
  'SEXO',
  'EDAD',
  'DIAGNOSTICO',
  'PROCEDIMIENTO',
  'OJO',
  'LIO',
  'MARCA',
  'TIEMPO ESTIMADO CX',
  'TIEMPO DE ESTANCIA',
  'CIRUJANO',
  'NOTAS',
];

interface FilaCirugia {
  id: string;
  nombre_paciente: string;
  expediente: string | null;
  fecha: string | null;
  hora: string | null;
  jornada: string | null;
  diagnostico: string | null;
  procedimiento: string | null;
  ojo: string | null;
  lio: string | null;
  marca_lio: string | null;
  tiempo_estimado: string | null;
  tiempo_estancia: string | null;
  notas: string | null;
  doctor_id: string | null;
  doctores: { alias?: string } | null;
  pacientes: { sexo?: string | null; fecha_nacimiento?: string | null } | null;
}

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  if (/^[=+\-@\t\r\n]/.test(raw)) {
    return `'${raw.replace(/"/g, '""')}`;
  }
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function csvFrom(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map(sanitizeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map((c) => sanitizeCsvCell(c == null ? '' : c)).join(','));
  }
  return CSV_BOM + lines.join('\r\n');
}

function calcularEdad(fechaNacimiento: string | null | undefined, fechaRef: string | null | undefined): number | null {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNacimiento || '');
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaRef || '');
  if (!n || !r) return null;
  const ny = Number(n[1]);
  const nm = Number(n[2]);
  const nd = Number(n[3]);
  const ry = Number(r[1]);
  const rm = Number(r[2]);
  const rd = Number(r[3]);
  let edad = ry - ny;
  if (rm < nm || (rm === nm && rd < nd)) edad -= 1;
  return edad >= 0 ? edad : null;
}

function normalizarNombre(v: string | null | undefined): string {
  return (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function enChunks<T>(items: T[], size = CHUNK_IN): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const SELECT_CIRUGIAS = `
  id, nombre_paciente, expediente, fecha, hora, jornada, diagnostico, procedimiento,
  ojo, lio, marca_lio, tiempo_estimado, tiempo_estancia, notas, doctor_id,
  doctores:doctor_id(alias),
  pacientes:paciente_id(sexo, fecha_nacimiento)
`;

async function listarCirugias(
  supabase: Supabase,
  desde: string,
  hasta: string,
  doctorId: string | null
): Promise<FilaCirugia[]> {
  const filas: FilaCirugia[] = [];
  for (let pagina = 0; pagina * PAGE_SIZE < MAX_FILAS; pagina++) {
    const inicio = pagina * PAGE_SIZE;
    let q = supabase
      .from('agenda_cirugias')
      .select(SELECT_CIRUGIAS)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true, nullsFirst: false })
      .range(inicio, inicio + PAGE_SIZE - 1);
    if (doctorId) q = q.eq('doctor_id', doctorId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    filas.push(...((data || []) as unknown as FilaCirugia[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return filas;
}

async function cargarCirujanos(
  supabase: Supabase,
  filas: FilaCirugia[]
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  const ids = filas.map((f) => f.id);
  if (ids.length === 0) return mapa;
  for (const chunk of enChunks(ids)) {
    const { data, error } = await supabase
      .from('agenda_cirugia_doctores')
      .select('cirugia_id, doctor_id, rol, doctores:doctor_id(alias)')
      .in('cirugia_id', chunk);
    if (error) continue;
    for (const row of (data || []) as Array<{
      cirugia_id: string;
      rol: string | null;
      doctores: { alias?: string } | null;
    }>) {
      const nombre = row.doctores?.alias;
      if (!nombre) continue;
      const previo = mapa.get(row.cirugia_id) || [];
      if (!previo.includes(nombre)) previo.push(nombre);
      mapa.set(row.cirugia_id, previo);
    }
  }
  return mapa;
}

async function cargarPacientesPorNombre(
  supabase: Supabase,
  filas: FilaCirugia[]
): Promise<Map<string, { sexo: string | null; fecha_nacimiento: string | null }>> {
  const mapa = new Map<string, { sexo: string | null; fecha_nacimiento: string | null }>();
  const pendientes = new Map<string, string>();
  for (const f of filas) {
    const key = normalizarNombre(f.nombre_paciente);
    if (key && !f.pacientes && !pendientes.has(key)) pendientes.set(key, f.nombre_paciente.trim());
  }
  if (pendientes.size === 0) return mapa;

  for (const chunk of enChunks([...pendientes.values()])) {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nombre_completo, sexo, fecha_nacimiento')
      .in('nombre_completo', chunk)
      .limit(500);
    if (error) continue;
    const porNombre = new Map<string, Array<{ sexo: string | null; fecha_nacimiento: string | null }>>();
    for (const p of (data || []) as Array<{
      nombre_completo: string;
      sexo: string | null;
      fecha_nacimiento: string | null;
    }>) {
      const key = normalizarNombre(p.nombre_completo);
      const lista = porNombre.get(key) || [];
      lista.push({ sexo: p.sexo, fecha_nacimiento: p.fecha_nacimiento });
      porNombre.set(key, lista);
    }
    for (const [key, candidatos] of porNombre) {
      if (candidatos.length === 1) mapa.set(key, candidatos[0]);
    }
  }
  return mapa;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const { desde, hasta } = rangoPersonalizado(searchParams.get('desde'), searchParams.get('hasta'));
  const doctorId = searchParams.get('doctor_id');

  if (desde > hasta) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  const dur = () => (performance.now() - startedAt).toFixed(1);

  try {
    const supabase = getSupabaseAdmin();
    const filas = await listarCirugias(supabase, desde, hasta, doctorId);
    const [cirujanos, pacientesPorNombre] = await Promise.all([
      cargarCirujanos(supabase, filas),
      cargarPacientesPorNombre(supabase, filas),
    ]);

    const datos = filas.map((f) => {
      const clinica = f.pacientes || pacientesPorNombre.get(normalizarNombre(f.nombre_paciente)) || null;
      const participantes = cirujanos.get(f.id) || [];
      const principal = f.doctores?.alias;
      const nombres = principal ? [principal, ...participantes.filter((n) => n !== principal)] : participantes;
      const edad = calcularEdad(clinica?.fecha_nacimiento, f.fecha);
      return [
        f.fecha,
        f.nombre_paciente,
        f.expediente,
        f.hora,
        f.jornada,
        clinica?.fecha_nacimiento || '',
        clinica?.sexo || '',
        edad == null ? '' : edad,
        f.diagnostico,
        f.procedimiento,
        f.ojo,
        f.lio,
        f.marca_lio,
        f.tiempo_estimado,
        f.tiempo_estancia,
        nombres.join('/'),
        f.notas,
      ];
    });

    const csv = csvFrom(ENCABEZADOS, datos);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cirugias-${desde}_${hasta}.csv"`,
        'Server-Timing': `reporte-cirugias;dur=${dur()}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set('Server-Timing', `reporte-cirugias;dur=${dur()}`);
    return response;
  }
}
