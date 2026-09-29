import { NextResponse } from 'next/server';
import { handleSupabaseError, mensajeSeguro } from '@/lib/supabase/handle-error';
import { errorInterno } from '@/lib/api/validar';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import type { Worksheet } from 'exceljs';

// Import con lotes de cientos de filas: margen amplio en Vercel.
export const maxDuration = 60;

/* ─────────── Utilidades de parsing ─────────── */

/** Parser CSV: campos entre comillas, separador , o ; */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.length > 1 || cur[0].trim() !== '') rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  cur.push(field);
  if (cur.length > 1 || cur[0].trim() !== '') rows.push(cur);
  return rows;
}

/** Decodifica el archivo como texto con fallback Windows-1252 (Excel es-MX) */
function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(buf);
    } catch {
      return new TextDecoder('latin1').decode(buf);
    }
  }
}

/** Renombra headers duplicados: OJO, OJO → OJO, OJO_2 */
function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const key = h.trim();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}_${count + 1}`;
  });
}

function parseFecha(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  // Formato ISO con hora: "2026-07-22 00:00:00" → prefijo
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Formato largo en inglés: "Tuesday, September 1, 2026"
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseFechaNacimiento(val: unknown): string | null {
  const fecha = parseFecha(val);
  if (fecha && fecha >= '1900-01-01' && fecha <= '2100-12-31') return fecha;
  return null;
}

function parseHora(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}:00`;
  }
  const str = String(val).trim().toUpperCase();
  // Formato AM/PM: "10:00AM", "9:30 AM", "2:00 AM"
  const ampm = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    const meridiem = ampm[3];
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }
  const simple = str.match(/(\d{1,2}):(\d{2})/);
  if (simple) return `${simple[1].padStart(2, '0')}:${simple[2]}:00`;
  return null;
}

function normalizeOjo(val: unknown): string | null {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (v === 'OD' || v === 'DERECHO') return 'OD';
  if (v === 'OI' || v === 'OS' || v === 'IZQUIERDO') return 'OI';
  if (v === 'OU' || v === 'AO' || v === 'AMBOS' || v === 'BILATERAL') return 'OU';
  // agenda_cirugias.ojo tiene CHECK (OD/OI/OU): otro valor tumbaba todo el lote.
  return null;
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** "$5,100.00 " → 5100 */
function parseCosto(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(String(val).replace(/[$\s,]/g, ''));
  return isNaN(num) ? 0 : num;
}

interface DoctorRef { id: string; alias: string }

/**
 * Resuelve el doctor a partir del texto del archivo usando la lista de doctores
 * activos precargada UNA vez por request (antes: 1 consulta por fila).
 */
function crearResolverDoctor(doctores: DoctorRef[]) {
  const memo = new Map<string, DoctorRef | null>();
  return (texto: unknown): DoctorRef | null => {
    if (!texto) return null;
    const buscar = String(texto).trim();
    if (!buscar || doctores.length === 0) return null;

    const buscarLower = buscar.toLowerCase();
    if (memo.has(buscarLower)) return memo.get(buscarLower) ?? null;

    // Primer cirujano antes de "/" (BAYARDO/IRINA → BAYARDO)
    const principal = buscarLower.split('/')[0]?.trim() || buscarLower;

    const exacto = doctores.find((d) => {
      const a = d.alias.toLowerCase();
      return a === principal || a.includes(principal) || principal.includes(a);
    });
    const porApellido = exacto
      ? null
      : doctores.find((d: DoctorRef) => {
          const apellidos = d.alias.toLowerCase().split(' ');
          return apellidos.some((a: string) => a.length > 3 && principal.includes(a));
        });
    const r = exacto || porApellido || null;
    memo.set(buscarLower, r);
    return r;
  };
}

/* ─────────── Utilidades de lotes ─────────── */

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Tamaño de lote para inserts en arreglo. */
const LOTE_INSERT = 200;
/** Tamaño de página de PostgREST (max-rows por defecto de Supabase). */
const PAGINA = 1000;
/** Máx. de peticiones simultáneas cuando se cae a inserción fila por fila. */
const CONCURRENCIA = 8;

function trozos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Ejecuta `fn` sobre cada elemento con un límite de concurrencia (orden de resultados preservado). */
async function mapConLimite<T, R>(items: T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const res = new Array<R>(items.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      res[i] = await fn(items[i], i);
    }
  });
  await Promise.all(trabajadores);
  return res;
}

/** Lee todas las páginas de una consulta (PostgREST corta en `max-rows`). */
async function leerPaginado<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxPaginas = 50,
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < maxPaginas; p++) {
    const { data, error } = await construir(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const filas = data || [];
    out.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return out;
}

/**
 * Inserta filas en lotes. Si un lote falla (una fila inválida tumba el lote),
 * se reintenta fila por fila para aislar solo las filas con error.
 * Devuelve por fila: el registro insertado (según `columnas`) o el error.
 */
async function insertarEnLotes(
  supabase: Admin,
  tabla: string,
  filas: Array<Record<string, unknown>>,
  columnas: string,
): Promise<Array<{ ok: true; row: Record<string, unknown> } | { ok: false; error: unknown }>> {
  const resultado: Array<{ ok: true; row: Record<string, unknown> } | { ok: false; error: unknown }> = [];
  for (const lote of trozos(filas, LOTE_INSERT)) {
    const { data, error } = await supabase.from(tabla).insert(lote as never).select(columnas);
    const insertados = (data || []) as unknown as Record<string, unknown>[];
    if (!error && insertados.length === lote.length) {
      insertados.forEach((row) => resultado.push({ ok: true, row }));
      continue;
    }
    if (!error) {
      // Respuesta incompleta (no debería pasar): no se puede mapear fila a fila.
      lote.forEach(() => resultado.push({ ok: false, error: new Error('Respuesta incompleta al insertar') }));
      continue;
    }
    const individuales = await mapConLimite(lote, CONCURRENCIA, async (fila) => {
      const r = await supabase.from(tabla).insert(fila as never).select(columnas).maybeSingle();
      return r.error || !r.data
        ? ({ ok: false, error: r.error } as const)
        : ({ ok: true, row: r.data as unknown as Record<string, unknown> } as const);
    });
    resultado.push(...individuales);
  }
  return resultado;
}

/** Patrón ILIKE exacto (sin comodines) entre comillas para `ilike(any).{…}`. */
function patronIlikeExacto(texto: string): string {
  const sinComodines = texto.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `"${sinComodines.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** Trozos cuyo tamaño en la URL no excede ~6 KB (límite práctico de PostgREST/proxies). */
function trozosPorLongitud(valores: string[], maxChars = 6000, maxItems = 200): string[][] {
  const out: string[][] = [];
  let actual: string[] = [];
  let largo = 0;
  for (const v of valores) {
    const l = encodeURIComponent(v).length + 1;
    if (actual.length > 0 && (largo + l > maxChars || actual.length >= maxItems)) {
      out.push(actual);
      actual = [];
      largo = 0;
    }
    actual.push(v);
    largo += l;
  }
  if (actual.length) out.push(actual);
  return out;
}

function telefono10(tel: string | null): string | null {
  if (!tel) return null;
  const t = tel.replace(/\D/g, '').slice(-10);
  return t.length === 10 ? t : null;
}

/* ─────────── Tipos de filas ─────────── */

interface CirugiaFila {
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
  doctor_id: string | null;
  estado: string;
  notas: string | null;
  _cirujano_texto: string | null;
  _doctor_alias: string | null;
}

interface ConsultaFila {
  fecha: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  telefono: string | null;
  doctor_alias: string;
  nombre_paciente: string;
  sexo: string | null;
  fecha_nacimiento: string | null;
  tipo_consulta: string;
  diagnostico: string | null;
  tipo_visita: string;
  estudio_1: string | null;
  estudio_2: string | null;
  estudio_3: string | null;
  procedimiento: string | null;
  aseguradora: string | null;
  metodo_pago: string | null;
  costo: number;
}

const MESES_EN: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** "Tuesday, September 1, 2026" → 2026-09-01 */
function parseFechaLargaEn(str: string): string | null {
  const m = str.match(/[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mes = MESES_EN[m[1].toLowerCase()];
  if (mes === undefined) return null;
  return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/* ─────────── Endpoint ─────────── */

// Límites para evitar DoS por memoria en archivos enormes
const MAX_SIZE_IMPORT = 5 * 1024 * 1024; // 5MB
const MAX_FILAS_IMPORT = 2000;
/** Margen del multipart (boundary, otros campos) sobre el tamaño del archivo. */
const MARGEN_MULTIPART = 64 * 1024;
const MAX_NOMBRE_ARCHIVO = 255;

/** MIME aceptados por extensión ('' = el navegador no informó tipo). */
const MIME_IMPORT: Record<'csv' | 'xlsx', string[]> = {
  csv: ['', 'text/csv', 'text/plain', 'application/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'application/octet-stream'],
  xlsx: ['', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'application/zip'],
};

/** Verifica que el contenido coincida con la extensión (xlsx = ZIP «PK\x03\x04»; csv sin bytes nulos). */
function contenidoCoincide(ext: 'csv' | 'xlsx', buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096));
  if (ext === 'xlsx') {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  return !bytes.includes(0);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  // Rechazo temprano por tamaño declarado (antes de leer el multipart a memoria).
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAX_SIZE_IMPORT + MARGEN_MULTIPART) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máximo 5MB)' }, { status: 400 });
  }
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Formato de datos inválido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Formato de datos inválido' }, { status: 400 });
  }

  const fileRaw = formData.get('file');
  const confirmar = formData.get('confirmar') === 'true';
  const tipoRaw = formData.get('tipo');
  if (tipoRaw !== null && tipoRaw !== 'consultas' && tipoRaw !== 'cirugias') {
    return NextResponse.json({ error: 'Tipo de importación no válido' }, { status: 400 });
  }
  const tipo = tipoRaw === 'consultas' ? 'consultas' : 'cirugias';

  if (!fileRaw || !(fileRaw instanceof File)) {
    return NextResponse.json({ error: 'No se proporcionó un archivo' }, { status: 400 });
  }
  const file = fileRaw;

  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
  }
  if (file.size > MAX_SIZE_IMPORT) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máximo 5MB)' }, { status: 400 });
  }
  if (!file.name || file.name.length > MAX_NOMBRE_ARCHIVO) {
    return NextResponse.json({ error: 'Nombre de archivo no válido' }, { status: 400 });
  }

  const extRaw = file.name.split('.').pop()?.toLowerCase() || '';
  if (extRaw !== 'xlsx' && extRaw !== 'csv') {
    return NextResponse.json({ error: 'Formato no soportado. Usa .xlsx o .csv' }, { status: 400 });
  }
  const ext: 'csv' | 'xlsx' = extRaw;
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();
  if (!MIME_IMPORT[ext].includes(mime)) {
    return NextResponse.json({ error: 'Formato no soportado. Usa .xlsx o .csv' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  if (!contenidoCoincide(ext, buffer)) {
    return NextResponse.json({ error: 'El contenido del archivo no corresponde a su extensión' }, { status: 400 });
  }
  const archivoNombre = file.name.replace(/[^\w\-. ]/g, '_').slice(0, 120);

  // Doctores activos: una sola lectura por request (antes: una por fila/doctor).
  const doctoresP = Promise.resolve(supabase.from('doctores').select('id, alias').eq('activo', true));

  async function cargarWorkbook() {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
  }

  /* ══════════ IMPORT DE CONSULTAS (ENTRADA Y SALIDA.csv) ══════════ */
  if (tipo === 'consultas') {
    const aseguranzasP = Promise.resolve(supabase.from('aseguranzas').select('id, nombre'));
    let matriz: string[][];

    try {
      if (ext === 'csv') {
        matriz = parseCsv(decodeText(buffer));
      } else {
        const workbook = await cargarWorkbook();
        const ws = workbook.worksheets[0];
        if (!ws) return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
        matriz = [];
        ws.eachRow((row) => {
          const fila: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => fila.push(String(cell.value ?? '')));
          matriz.push(fila);
        });
      }
    } catch (err) {
      void doctoresP.catch(() => undefined);
      void aseguranzasP.catch(() => undefined);
      return NextResponse.json({ error: mensajeSeguro(err, 'agenda.import.leer', 'No se pudo leer el archivo') }, { status: 400 });
    }

    if (matriz.length < 2) {
      return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
    }
    if (matriz.length - 1 > MAX_FILAS_IMPORT) {
      return NextResponse.json({ error: `El archivo tiene más de ${MAX_FILAS_IMPORT} filas. Divídelo en partes.` }, { status: 400 });
    }

    const headers = matriz[0].map((h) => normalizeText(h));
    const col = (...nombres: string[]) =>
      headers.findIndex((h) => nombres.some((n) => h === n || h.startsWith(n)));
    const idx = {
      fecha: col('fecha'),
      ingreso: col('hora de ingreso'),
      egreso: col('hora de egreso'),
      telefono: col('numero de telefono'),
      doctor: col('doctor'),
      nombre: col('nombre de paciente'),
      sexo: col('sexo'),
      fnac: col('fecha de nacimiento'),
      consulta: col('consulta'),
      diagnostico: col('diagnostico'),
      tipoVisita: col('tipo de consulta'),
      est1: col('estudio 1', 'estudio1'),
      est2: col('estudio2'),
      est3: col('estudio3'),
      procedimiento: col('procedimiento'),
      aseguradora: col('aseguranza'),
      metodoPago: col('metodo de pago'),
      costo: col('costo consulta'),
    };

    if (idx.fecha < 0 || idx.nombre < 0) {
      return NextResponse.json({ error: 'No se encontraron las columnas FECHA y NOMBRE DE PACIENTE' }, { status: 400 });
    }

    const get = (fila: string[], i: number) => (i >= 0 ? String(fila[i] ?? '').trim() : '');

    // Cache de doctores y aseguranzas (ya en vuelo, en paralelo con el parseo)
    const [{ data: doctores }, { data: aseguranzas }] = await Promise.all([doctoresP, aseguranzasP]);
    const findDoctor = crearResolverDoctor((doctores || []) as DoctorRef[]);

    const filas: ConsultaFila[] = [];
    let filasOmitidas = 0;

    for (const fila of matriz.slice(1)) {
      const nombre = get(fila, idx.nombre).slice(0, 255);
      const fechaStr = get(fila, idx.fecha);
      if (!nombre || !fechaStr) { filasOmitidas++; continue; }

      const fecha = parseFechaLargaEn(fechaStr) || parseFecha(fechaStr);
      if (!fecha) { filasOmitidas++; continue; }

      filas.push({
        fecha,
        hora_inicio: parseHora(get(fila, idx.ingreso)),
        hora_fin: parseHora(get(fila, idx.egreso)),
        telefono: get(fila, idx.telefono).slice(0, 30) || null,
        doctor_alias: get(fila, idx.doctor),
        nombre_paciente: nombre,
        sexo: get(fila, idx.sexo).toUpperCase() || null,
        fecha_nacimiento: parseFechaNacimiento(get(fila, idx.fnac)),
        tipo_consulta: (get(fila, idx.consulta) || 'CONSULTA').toUpperCase(),
        diagnostico: get(fila, idx.diagnostico) || null,
        tipo_visita: get(fila, idx.tipoVisita).toUpperCase().includes('PRIMERA') ? 'PRIMERA_VEZ' : 'SUBSECUENTE',
        estudio_1: get(fila, idx.est1) || null,
        estudio_2: get(fila, idx.est2) || null,
        estudio_3: get(fila, idx.est3) || null,
        procedimiento: get(fila, idx.procedimiento) || null,
        aseguradora: get(fila, idx.aseguradora) || null,
        metodo_pago: get(fila, idx.metodoPago) || null,
        costo: parseCosto(get(fila, idx.costo)),
      });
    }

    if (filas.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas válidas (requieren FECHA y NOMBRE DE PACIENTE)' }, { status: 400 });
    }

    // Match doctor/aseguranza por fila (preview) — en memoria
    const asegNorm = new Map<string, string>((aseguranzas || []).map((a: { id: string; nombre: string }) => [normalizeText(a.nombre), a.id]));
    const conDoctores = filas.map((f) => ({
      ...f,
      _doctorRef: f.doctor_alias ? findDoctor(f.doctor_alias) : null,
    }));

    if (!confirmar) {
      return NextResponse.json({
        preview: true,
        tipo: 'consultas',
        total: conDoctores.length,
        omitidas: filasOmitidas,
        doctorNoEncontrado: conDoctores.filter((f) => f.doctor_alias && !f._doctorRef).length,
        filas: conDoctores.map((f) => ({
          fecha: f.fecha,
          hora: f.hora_inicio,
          paciente: f.nombre_paciente,
          doctor: f.doctor_alias || '—',
          doctor_id: f._doctorRef?.id ?? null,
          tipo: f.tipo_consulta,
          aseguranza_resuelta: f.aseguradora ? (asegNorm.get(normalizeText(f.aseguradora)) ? 'sí' : 'no') : '—',
        })),
      });
    }

    /* Confirm: upsert pacientes + insert consultas (por lotes) */
    const METODO_PAGO_MAP: Record<string, string> = {
      'EFECTIVO': 'EFECTIVO', 'TARJETA': 'TARJETA', 'TARJETA DE CREDITO': 'TARJETA',
      'TARJETA DE DEBITO': 'TARJETA', 'TRANSFERENCIA': 'TRANSFERENCIA',
    };

    const fechas = Array.from(new Set(conDoctores.map((f) => f.fecha as string)));
    const telefonos = Array.from(new Set(conDoctores.map((f) => telefono10(f.telefono)).filter((t): t is string => !!t)));
    const nombresUnicos = Array.from(new Map(conDoctores.map((f) => [f.nombre_paciente.toLowerCase(), f.nombre_paciente])).values());

    // Precarga en paralelo: conteo para folios, duplicados existentes, pacientes por teléfono y por nombre.
    // (Antes: 2–3 consultas por fila en serie.)
    let consultasCount: number | null;
    let consultasExistentes: Array<{ fecha: string; hora_inicio: string | null; pacientes: unknown }>;
    let pacientesPorTel: Array<{ id: string; telefono: string | null }>;
    let pacientesPorNombre: Array<{ id: string; nombre_completo: string | null }>;
    try {
      const [conteo, existentes, porTel, porNombre] = await Promise.all([
        supabase.from('consultas').select('id', { count: 'exact', head: true }),
        Promise.all(
          trozos(fechas, 60).map((grupo) =>
            leerPaginado<{ fecha: string; hora_inicio: string | null; pacientes: unknown }>((d, h) =>
              supabase
                .from('consultas')
                .select('fecha, hora_inicio, pacientes:paciente_id (nombre_completo)')
                .in('fecha', grupo)
                .order('id', { ascending: true })
                .range(d, h) as unknown as PromiseLike<{ data: { fecha: string; hora_inicio: string | null; pacientes: unknown }[] | null; error: unknown }>
            )
          )
        ),
        mapConLimite(trozos(telefonos, 200), CONCURRENCIA, async (grupo) => {
          const { data, error } = await supabase.from('pacientes').select('id, telefono').in('telefono', grupo).limit(PAGINA);
          if (error) throw error;
          return (data || []) as Array<{ id: string; telefono: string | null }>;
        }),
        mapConLimite(trozosPorLongitud(nombresUnicos.map(patronIlikeExacto)), CONCURRENCIA, async (grupo) => {
          const { data, error } = await supabase.from('pacientes').select('id, nombre_completo').ilikeAnyOf('nombre_completo', grupo).limit(PAGINA);
          if (error) throw error;
          return (data || []) as Array<{ id: string; nombre_completo: string | null }>;
        }),
      ]);
      if (conteo.error) throw conteo.error;
      consultasCount = conteo.count;
      consultasExistentes = existentes.flat();
      pacientesPorTel = porTel.flat();
      pacientesPorNombre = porNombre.flat();
    } catch (err) {
      return errorInterno(err, 'agenda.import.precarga');
    }

    let seq = consultasCount || 0;
    const year = new Date().getFullYear().toString().slice(-2);

    // Dedupe por (fecha, hora_inicio, nombre paciente normalizado)
    const dupSet = new Set(
      consultasExistentes.map((c) =>
        `${c.fecha}|${(c.hora_inicio || '').slice(0, 5)}|${normalizeText((c as any).pacientes?.nombre_completo || '')}`
      )
    );

    // Índices de pacientes. Coincidencia ambigua (2+ pacientes) no cuenta,
    // igual que el `.maybeSingle()` anterior.
    const agrupar = (pares: Array<[string, string]>) => {
      const m = new Map<string, Set<string>>();
      for (const [k, id] of pares) {
        if (!m.has(k)) m.set(k, new Set());
        m.get(k)!.add(id);
      }
      const unicos = new Map<string, string>();
      m.forEach((ids, k) => { if (ids.size === 1) unicos.set(k, ids.values().next().value as string); });
      return unicos;
    };
    const idPorTel = agrupar(pacientesPorTel.filter((p) => p.telefono).map((p) => [p.telefono as string, p.id]));
    const idPorNombre = agrupar(pacientesPorNombre.filter((p) => p.nombre_completo).map((p) => [(p.nombre_completo as string).toLowerCase(), p.id]));

    let insertadas = 0;
    let omitidasDuplicadas = 0;
    let errores = 0;
    const rechazadosIdx: Array<{ idx: number; nombre: string; fecha?: string | null; motivo: string }> = [];

    // Paso 1 (memoria): duplicados y resolución de paciente: caché por nombre → teléfono → nombre → crear.
    const pacienteCache = new Map<string, string>(); // nombre lower → id existente o clave `nuevo:<nombre lower>`
    const nuevosPacientes = new Map<string, Record<string, unknown>>();
    const pendientes: Array<{ idx: number; f: (typeof conDoctores)[number]; pacienteRef: string }> = [];

    conDoctores.forEach((f, i) => {
      const dupKey = `${f.fecha}|${(f.hora_inicio || '').slice(0, 5)}|${normalizeText(f.nombre_paciente)}`;
      if (dupSet.has(dupKey)) { omitidasDuplicadas++; return; }
      dupSet.add(dupKey);

      const nombreKey = f.nombre_paciente.toLowerCase();
      let ref = pacienteCache.get(nombreKey) || null;
      if (!ref) {
        const tel = telefono10(f.telefono);
        ref = (tel && idPorTel.get(tel)) || idPorNombre.get(nombreKey) || null;
      }
      if (!ref) {
        ref = `nuevo:${nombreKey}`;
        const sexo = f.sexo?.startsWith('M') ? 'MASCULINO' : f.sexo?.startsWith('F') ? 'FEMENINO' : null;
        nuevosPacientes.set(nombreKey, {
          nombre_completo: f.nombre_paciente,
          telefono: f.telefono,
          sexo,
          fecha_nacimiento: f.fecha_nacimiento,
        });
      }
      pacienteCache.set(nombreKey, ref);
      pendientes.push({ idx: i, f, pacienteRef: ref });
    });

    // Paso 2: crear pacientes nuevos en lote (un insert por cada 200).
    const idNuevo = new Map<string, string>();
    const clavesNuevas = Array.from(nuevosPacientes.keys());
    const creados = await insertarEnLotes(supabase, 'pacientes', clavesNuevas.map((k) => nuevosPacientes.get(k)!), 'id');
    creados.forEach((r, i) => { if (r.ok) idNuevo.set(`nuevo:${clavesNuevas[i]}`, r.row.id as string); });

    // Paso 3: armar consultas (folios en orden de fila) e insertarlas en lote.
    const porInsertar: Array<{ idx: number; f: (typeof conDoctores)[number]; row: Record<string, unknown> }> = [];
    for (const p of pendientes) {
      const pacienteId = p.pacienteRef.startsWith('nuevo:') ? idNuevo.get(p.pacienteRef) : p.pacienteRef;
      const f = p.f;
      if (!pacienteId) {
        errores++;
        rechazadosIdx.push({ idx: p.idx, nombre: f.nombre_paciente, fecha: f.fecha, motivo: 'No se pudo crear el paciente' });
        continue;
      }

      seq += 1;
      const folio = `CON-${year}-${String(seq).padStart(5, '0')}`;
      const metodo = f.metodo_pago ? METODO_PAGO_MAP[normalizeText(f.metodo_pago)] || null : null;
      const horaFin = f.hora_fin && f.hora_inicio && f.hora_fin > f.hora_inicio ? f.hora_fin : null;
      const asegId = f.aseguradora ? asegNorm.get(normalizeText(f.aseguradora)) || null : null;

      porInsertar.push({
        idx: p.idx,
        f,
        row: {
          folio,
          paciente_id: pacienteId,
          doctor_id: f._doctorRef?.id || null,
          fecha: f.fecha,
          hora_inicio: f.hora_inicio,
          hora_fin: horaFin,
          tipo_consulta: f.tipo_consulta,
          tipo_visita: f.tipo_visita,
          diagnostico: f.diagnostico,
          estudio_1: f.estudio_1,
          estudio_2: f.estudio_2,
          estudio_3: f.estudio_3,
          procedimiento: f.procedimiento,
          metodo_pago: metodo,
          aseguranza_id: asegId,
          costo_total: f.costo || 0,
          estatus: 'AGENDADA',
          estatus_pago: f.costo > 0 ? 'PENDIENTE_PAGO' : 'PAGADO',
        },
      });
    }

    const resultados = await insertarEnLotes(supabase, 'consultas', porInsertar.map((x) => x.row), 'id');
    resultados.forEach((r, i) => {
      const { idx: filaIdx, f } = porInsertar[i];
      if (r.ok) {
        insertadas++;
      } else {
        errores++;
        rechazadosIdx.push({ idx: filaIdx, nombre: f.nombre_paciente, fecha: f.fecha, motivo: mensajeSeguro(r.error, 'agenda.import', 'No se pudo guardar') });
      }
    });

    // Mismo orden que el procesamiento fila por fila anterior.
    const rechazados = rechazadosIdx
      .sort((x, y) => x.idx - y.idx)
      .map(({ nombre, fecha, motivo }) => ({ nombre, fecha, motivo }));

    await supabase.from('agenda_import_log').insert({
      usuario_id: auth.user.id,
      archivo_nombre: archivoNombre,
      total_filas: conDoctores.length + filasOmitidas,
      filas_ok: insertadas,
      filas_rechazadas: omitidasDuplicadas + errores + filasOmitidas,
      detalle_rechazados: rechazados,
    });

    return NextResponse.json({
      preview: false,
      tipo: 'consultas',
      importadas: insertadas,
      omitidasDuplicadas,
      omitidasSinDatos: filasOmitidas,
      errores,
      rechazados,
    });
  }

  /* ══════════ IMPORT DE CIRUGÍAS (CIRUGIA.csv / Excel) ══════════ */

  interface CirugiaSheetRow {
    'FECHA'?: unknown;
    'NOMBRE PX'?: unknown;
    'No. Expediente'?: unknown;
    'HORA CX'?: unknown;
    'JORNADA'?: unknown;
    'FECHA NAC.'?: unknown;
    'SEXO'?: unknown;
    'EDAD'?: unknown;
    'DIAGNOSTICO'?: unknown;
    'PROCEDIMIENTO'?: unknown;
    'OJO'?: unknown;
    'OJO_2'?: unknown;
    'LIO'?: unknown;
    'LIO_2'?: unknown;
    'MARCA'?: unknown;
    'MARCA_2'?: unknown;
    'TIEMPO ESTIMADO CX'?: unknown;
    'TIEMPO DE ESTANCIA'?: unknown;
    'CIRUJANO'?: unknown;
    'NOTAS'?: unknown;
  }

  let cirugiaRows: Record<string, unknown>[] = [];
  let aplazadosRows: Record<string, unknown>[] = [];

  try {
    if (ext === 'csv') {
      const matriz = parseCsv(decodeText(buffer));
      if (matriz.length < 2) {
        void doctoresP.catch(() => undefined);
        return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
      }
      const headers = dedupeHeaders(matriz[0]);
      cirugiaRows = matriz.slice(1).map((fila) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => { obj[h] = fila[i] ?? ''; });
        return obj;
      });
    } else {
      const workbook = await cargarWorkbook();

      const sheetToJson = (worksheet: Worksheet | undefined): Record<string, unknown>[] => {
        if (!worksheet) return [];
        const rows: Record<string, unknown>[] = [];
        const rawHeaders: string[] = [];
        let headers: string[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              rawHeaders[colNumber] = String(cell.value || '').trim();
            });
            // Una sola vez por hoja (antes se recalculaba por cada celda).
            headers = dedupeHeaders(Array.from(rawHeaders, (h) => h ?? ''));
            return;
          }
          const obj: Record<string, unknown> = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const h = headers[colNumber];
            if (h) obj[h] = cell.value;
          });
          rows.push(obj);
        });
        return rows;
      };

      cirugiaRows = sheetToJson(workbook.getWorksheet('CIRUGIA') || workbook.worksheets[0]);
      aplazadosRows = sheetToJson(workbook.getWorksheet('APLAZADOS'));
    }
  } catch (err) {
    void doctoresP.catch(() => undefined);
    return NextResponse.json({ error: mensajeSeguro(err, 'agenda.import.leer', 'No se pudo leer el archivo') }, { status: 400 });
  }

  if (cirugiaRows.length === 0 && aplazadosRows.length === 0) {
    void doctoresP.catch(() => undefined);
    return NextResponse.json({ error: 'El archivo no contiene datos válidos' }, { status: 400 });
  }
  if (cirugiaRows.length + aplazadosRows.length > MAX_FILAS_IMPORT) {
    void doctoresP.catch(() => undefined);
    return NextResponse.json({ error: `El archivo tiene más de ${MAX_FILAS_IMPORT} filas. Divídelo en partes.` }, { status: 400 });
  }

  const { data: doctores } = await doctoresP;
  const findDoctor = crearResolverDoctor((doctores || []) as DoctorRef[]);

  const filasCirugia: CirugiaFila[] = [];
  const filasAplazadas: Array<Record<string, unknown>> = [];
  const erroresCount = { cirugia: 0, aplazada: 0 };
  let doctorNoEncontradoCount = 0;

  for (const row of cirugiaRows as CirugiaSheetRow[]) {
    const nombre = row['NOMBRE PX']?.toString().trim();
    if (!nombre) { erroresCount.cirugia++; continue; }

    const fecha = parseFecha(row['FECHA']);
    const hora = parseHora(row['HORA CX']);
    // OJO principal: primer grupo; si vacío usar el segundo
    const ojo = normalizeOjo(row['OJO']) || normalizeOjo(row['OJO_2']);
    const lio = String(row['LIO'] ?? '').trim() || String(row['LIO_2'] ?? '').trim() || null;
    const marca = String(row['MARCA'] ?? '').trim() || String(row['MARCA_2'] ?? '').trim() || null;
    const ojo2 = normalizeOjo(row['OJO_2']);
    const notasBase = row['NOTAS']?.toString().trim() || null;

    // "SUSPENDIDO" en notas → cirugía cancelada
    const suspendida = !!notasBase && notasBase.toUpperCase().includes('SUSPENDIDO');

    const cirujano = row['CIRUJANO']?.toString().trim() || null;
    let doctorId: string | null = null;
    let doctorAlias: string | null = null;
    if (cirujano) {
      const match = findDoctor(cirujano);
      doctorId = match?.id ?? null;
      doctorAlias = match?.alias ?? null;
      if (!doctorId) doctorNoEncontradoCount++;
    }

    let notas = notasBase;
    if (suspendida) notas = null;
    else if (ojo2 && ojo && ojo2 !== ojo) {
      notas = notas ? `${notas} (2º ojo: ${ojo2})` : `(2º ojo: ${ojo2})`;
    }

    filasCirugia.push({
      nombre_paciente: nombre,
      expediente: row['No. Expediente']?.toString().trim() || null,
      fecha,
      hora,
      jornada: row['JORNADA']?.toString().trim() || null,
      diagnostico: row['DIAGNOSTICO']?.toString().trim() || null,
      procedimiento: row['PROCEDIMIENTO']?.toString().trim() || null,
      ojo,
      lio,
      marca_lio: marca,
      tiempo_estimado: row['TIEMPO ESTIMADO CX']?.toString().trim() || null,
      tiempo_estancia: row['TIEMPO DE ESTANCIA']?.toString().trim() || null,
      doctor_id: doctorId,
      estado: suspendida ? 'cancelada' : fecha ? 'agendada' : 'aplazada',
      notas,
      _cirujano_texto: cirujano,
      _doctor_alias: doctorAlias,
    });
  }

  for (const row of aplazadosRows) {
    const nombre = row['NOMBRE PX']?.toString().trim();
    if (!nombre) { erroresCount.aplazada++; continue; }

    filasAplazadas.push({
      nombre_paciente: nombre,
      expediente: row['No. Expediente']?.toString().trim() || null,
      diagnostico: row['DIAGNOSTICO']?.toString().trim() || null,
      procedimiento: row['PROCEDIMIENTO']?.toString().trim() || null,
      ojo: normalizeOjo(row['OJO']),
      lio: String(row['LIO'] ?? '').trim() || null,
      procedencia: row['PROCEDENCIA']?.toString().trim() || null,
      motivo_aplazamiento: row['MOTIVO']?.toString().trim() || null,
      estado: 'aplazada',
    });
  }

  if (!confirmar) {
    return NextResponse.json({
      preview: true,
      tipo: 'cirugias',
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
  const rechazados: Array<{ fila: number; motivo: string; nombre: string; fecha?: string; fila_original: string }> = [];
  const yaExistentes: Array<{ fila: number; nombre: string; fecha?: string; fila_original: string }> = [];

  // Duplicados: solo las cirugías de las fechas del archivo (antes se leía la
  // tabla completa, truncada por PostgREST a 1000 filas → dedupe incompleto).
  const fechasArchivo = Array.from(new Set(filasCirugia.map((f) => f.fecha).filter((f): f is string => !!f)));
  const haySinFecha = filasCirugia.some((f) => !f.fecha);
  type Existente = { nombre_paciente: string | null; fecha: string | null; hora: string | null };
  let existentes: Existente[];
  try {
    const [porFecha, sinFecha] = await Promise.all([
      Promise.all(
        trozos(fechasArchivo, 60).map((grupo) =>
          leerPaginado<Existente>((d, h) =>
            supabase
              .from('agenda_cirugias')
              .select('nombre_paciente, fecha, hora')
              .in('fecha', grupo)
              .order('id', { ascending: true })
              .range(d, h) as unknown as PromiseLike<{ data: Existente[] | null; error: unknown }>
          )
        )
      ),
      haySinFecha
        ? leerPaginado<Existente>((d, h) =>
            supabase
              .from('agenda_cirugias')
              .select('nombre_paciente, fecha, hora')
              .is('fecha', null)
              .order('id', { ascending: true })
              .range(d, h) as unknown as PromiseLike<{ data: Existente[] | null; error: unknown }>
          )
        : Promise.resolve([] as Existente[]),
    ]);
    existentes = [...porFecha.flat(), ...sinFecha];
  } catch (err) {
    return errorInterno(err, 'agenda.import.duplicados');
  }

  const existingSet = new Set(
    existentes.map(
      (e) => `${(e.nombre_paciente || '').toLowerCase().trim()}|${e.fecha}|${e.hora}`
    )
  );

  const csvCampo = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const cirugiaBatch: Array<Record<string, unknown>> = [];
  const batchMeta: Array<{ fila: number; filaOriginal: string }> = [];
  filasCirugia.forEach((fila, i) => {
    const key = `${(fila.nombre_paciente || '').toLowerCase()}|${fila.fecha}|${fila.hora}`;
    const filaOriginal = [
      fila.fecha, fila.nombre_paciente, null, fila.hora, fila.jornada, null, null, null, null,
      fila.diagnostico, fila.procedimiento, fila.ojo, fila.lio, fila.marca_lio,
      fila.tiempo_estimado, fila.tiempo_estancia, fila._cirujano_texto, fila.notas,
    ].map(csvCampo).join(',');

    if (existingSet.has(key)) {
      yaExistentes.push({ fila: i + 1, nombre: fila.nombre_paciente, fecha: fila.fecha as string, fila_original: filaOriginal });
      return;
    }
    // También evita duplicados dentro del mismo archivo.
    existingSet.add(key);

    const { _cirujano_texto: _c, _doctor_alias: _d, ...insertData } = fila;
    cirugiaBatch.push(insertData);
    batchMeta.push({ fila: i + 1, filaOriginal });
  });

  if (cirugiaBatch.length > 0) {
    const resultados = await insertarEnLotes(supabase, 'agenda_cirugias', cirugiaBatch, 'id, doctor_id');
    const doctorRows: Array<Record<string, unknown>> = [];
    resultados.forEach((r, i) => {
      const fila = cirugiaBatch[i];
      if (r.ok) {
        insertadas++;
        if (r.row.doctor_id) {
          doctorRows.push({ cirugia_id: r.row.id, doctor_id: r.row.doctor_id, rol: 'CIRUJANO_PRINCIPAL', porcentaje_participacion: 100 });
        }
      } else {
        erroresInsercion++;
        rechazados.push({
          fila: batchMeta[i].fila,
          motivo: mensajeSeguro(r.error, 'agenda.import', 'No se pudo guardar'),
          nombre: fila.nombre_paciente as string,
          fecha: fila.fecha as string,
          fila_original: batchMeta[i].filaOriginal,
        });
      }
    });
    for (const lote of trozos(doctorRows, LOTE_INSERT)) {
      const { error } = await supabase.from('agenda_cirugia_doctores').insert(lote);
      if (error) handleSupabaseError(error, 'agenda.import.doctores');
    }
  }

  if (filasAplazadas.length > 0) {
    const resultados = await insertarEnLotes(supabase, 'agenda_cirugias', filasAplazadas, 'id');
    for (const r of resultados) {
      if (r.ok) insertadasAplazadas++;
      else erroresInsercion++;
    }
  }

  await supabase.from('agenda_import_log').insert({
    usuario_id: auth.user.id,
    archivo_nombre: archivoNombre,
    total_filas: filasCirugia.length + filasAplazadas.length,
    filas_ok: insertadas + insertadasAplazadas,
    filas_rechazadas: rechazados.length + yaExistentes.length + erroresCount.cirugia + erroresCount.aplazada,
    detalle_rechazados: rechazados,
  });

  let rechazadosCsv: string | null = null;
  if (rechazados.length > 0) {
    const header = 'Fila,Motivo,Paciente,Fecha,fila_original\n';
    const rows = rechazados.map((r) => `${r.fila},${csvCampo(r.motivo)},${csvCampo(r.nombre)},${csvCampo(r.fecha || '')},${csvCampo(r.fila_original)}`).join('\n');
    rechazadosCsv = header + rows;
  }

  return NextResponse.json({
    preview: false,
    tipo: 'cirugias',
    importadas: insertadas,
    aplazadasImportadas: insertadasAplazadas,
    errores: erroresInsercion,
    doctorNoEncontrado: doctorNoEncontradoCount,
    rechazados,
    yaExistentes,
    rechazadosCsv,
  });
}
