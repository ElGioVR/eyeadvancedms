import { NextResponse } from 'next/server';
import { handleSupabaseError, mensajeSeguro } from '@/lib/supabase/handle-error';
import { errorInterno } from '@/lib/api/validar';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { ROLES_IMPORTAR_AGENDA } from '@/lib/permisos-agenda';
import { invalidarDoctorDeUsuario } from '@/lib/auth-helpers';
import {
  claveTexto,
  crearResolverDoctores,
  crearResolverPacientes,
  faltantesPaciente,
  generarCsvRechazos,
  limpiarEspacios,
  normalizarSexo,
  parseFechaImport,
  parseHoraImport,
  validarNombrePaciente,
  valorCelda,
  type DoctorExistente,
  type FilaRechazada,
  type PacienteExistente,
  type ResolucionDoctor,
} from '@/lib/import-agenda';

// Import con lotes de cientos de filas: margen amplio en Vercel.
export const maxDuration = 60;

/*
 * Importación masiva de consultas y cirugías.
 *
 * - Sin duplicados: una fila que ya existe (mismo paciente, fecha y hora; o la
 *   misma cirugía aplazada) se omite, también si se repite dentro del archivo.
 * - Doctores y pacientes que faltan se crean UNA vez y quedan marcados con
 *   `pendiente_completar` (mig. 400) para terminar su ficha.
 * - Alias de doctor sin distinguir mayúsculas/acentos («Luis» = «LUIS»); los
 *   nuevos se guardan en MAYÚSCULAS. Nombres de paciente y alias se validan.
 * - Las filas que no se pudieron agregar vuelven en un CSV con su motivo y las
 *   columnas originales para corregirlas y volver a importar.
 */

/* ─────────── Lectura del archivo ─────────── */

/** Parser CSV: campos entre comillas, separador , o ; */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
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

function normalizeOjo(val: unknown): string | null {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (v === 'OD' || v === 'DERECHO') return 'OD';
  if (v === 'OI' || v === 'OS' || v === 'IZQUIERDO') return 'OI';
  if (v === 'OU' || v === 'AO' || v === 'AMBOS' || v === 'BILATERAL') return 'OU';
  return null;
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** "$5,100.00 " → 5100 */
function parseCosto(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(String(val).replace(/[$\s,]/g, ''));
  return isNaN(num) ? 0 : num;
}

const texto = (v: unknown) => limpiarEspacios(String(v ?? ''));

/** Una hoja leída: encabezados originales + filas (valores crudos y por encabezado). */
interface Hoja {
  nombre: string;
  encabezados: string[];
  filas: Array<{ numero: number; valores: Array<string | number>; obj: Record<string, string | number> }>;
}

function hojaDesdeMatriz(nombre: string, matriz: Array<Array<string | number>>): Hoja {
  const encabezados = (matriz[0] || []).map((h) => String(h ?? '').trim());
  const claves = dedupeHeaders(encabezados);
  const filas: Hoja['filas'] = [];
  matriz.slice(1).forEach((valores, i) => {
    if (valores.every((v) => String(v ?? '').trim() === '')) return; // fila vacía
    const obj: Record<string, string | number> = {};
    claves.forEach((h, j) => { if (h) obj[h] = valores[j] ?? ''; });
    filas.push({ numero: i + 2, valores, obj });
  });
  return { nombre, encabezados, filas };
}

/* ─────────── Utilidades de lotes ─────────── */

type Admin = ReturnType<typeof getSupabaseAdmin>;

const LOTE_INSERT = 200;
const PAGINA = 1000;
const CONCURRENCIA = 8;

function trozos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

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

async function leerPaginado<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxPaginas = 100,
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

type ResultadoInsert = { ok: true; row: Record<string, unknown> } | { ok: false; error: unknown };

/** ¿El error es por una columna que aún no existe (migración sin aplicar)? */
function esColumnaFaltante(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === 'PGRST204' || e.code === '42703' || /column .* (does not exist|could not find)|Could not find the '.*' column/i.test(e.message || ''));
}

/**
 * Inserta en lotes. Si un lote falla se reintenta fila por fila para aislar
 * solo las filas con error. Si falla por una columna opcional inexistente
 * (`opcionales`, p. ej. `pendiente_completar` sin la mig. 400) se reintenta sin ella.
 */
async function insertarEnLotes(
  supabase: Admin,
  tabla: string,
  filas: Array<Record<string, unknown>>,
  columnas: string,
  opcionales: string[] = [],
): Promise<ResultadoInsert[]> {
  let quitar = false;
  const preparar = (f: Record<string, unknown>) => {
    if (!quitar) return f;
    const copia = { ...f };
    for (const c of opcionales) delete copia[c];
    return copia;
  };
  const resultado: ResultadoInsert[] = [];
  for (const loteOriginal of trozos(filas, LOTE_INSERT)) {
    let lote = loteOriginal.map(preparar);
    let { data, error } = await supabase.from(tabla).insert(lote as never).select(columnas);
    if (error && !quitar && opcionales.length && esColumnaFaltante(error)) {
      quitar = true;
      lote = loteOriginal.map(preparar);
      ({ data, error } = await supabase.from(tabla).insert(lote as never).select(columnas));
    }
    const insertados = (data || []) as unknown as Record<string, unknown>[];
    if (!error && insertados.length === lote.length) {
      insertados.forEach((row) => resultado.push({ ok: true, row }));
      continue;
    }
    if (!error) {
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

/* ─────────── Doctores y pacientes ─────────── */

async function cargarDoctores(supabase: Admin): Promise<DoctorExistente[]> {
  return leerPaginado<DoctorExistente>((d, h) =>
    supabase.from('doctores').select('id, alias, activo').order('id', { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: DoctorExistente[] | null; error: unknown }>
  );
}

async function cargarPacientes(supabase: Admin): Promise<PacienteExistente[]> {
  return leerPaginado<PacienteExistente>((d, h) =>
    supabase
      .from('pacientes')
      .select('id, nombre_completo, telefono, created_at')
      .order('id', { ascending: true })
      .range(d, h) as unknown as PromiseLike<{ data: PacienteExistente[] | null; error: unknown }>
  );
}

interface PacienteNuevo {
  nombre_completo: string;
  telefono: string | null;
  sexo: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
}

/** Referencia a doctor/paciente: id existente o clave de uno por crear. */
type Ref = { id: string } | { nuevo: string } | null;

/**
 * Crea los doctores nuevos (alias en MAYÚSCULAS). Si otro proceso ya lo creó
 * (índice único de alias, mig. 400) se reutiliza el existente.
 */
async function crearDoctores(supabase: Admin, nuevos: Map<string, string>): Promise<{ ids: Map<string, string>; fallos: Map<string, string> }> {
  const ids = new Map<string, string>();
  const fallos = new Map<string, string>();
  const claves = Array.from(nuevos.keys());
  if (claves.length === 0) return { ids, fallos };
  const filas = claves.map((k) => ({
    alias: nuevos.get(k)!,
    nombre: null,
    especialidad: 'Oftalmología',
    activo: true,
    tipo_personal: 'MEDICO',
    cobra_honorarios: true,
    pendiente_completar: true,
  }));
  const res = await insertarEnLotes(supabase, 'doctores', filas, 'id', ['pendiente_completar', 'tipo_personal', 'cobra_honorarios']);
  const pendientes: string[] = [];
  res.forEach((r, i) => {
    if (r.ok) ids.set(claves[i], r.row.id as string);
    else pendientes.push(claves[i]);
  });
  if (pendientes.length) {
    // Carrera con otro import: buscar por alias exacto en mayúsculas
    const { data } = await supabase.from('doctores').select('id, alias').in('alias', pendientes.map((k) => nuevos.get(k)!));
    for (const k of pendientes) {
      const d = (data || []).find((x: { alias: string }) => x.alias === nuevos.get(k));
      if (d) ids.set(k, d.id);
      else fallos.set(k, `No se pudo crear el doctor «${nuevos.get(k)}»`);
    }
  }
  if (ids.size) invalidarDoctorDeUsuario();
  return { ids, fallos };
}

async function crearPacientes(supabase: Admin, nuevos: Map<string, PacienteNuevo>): Promise<{ ids: Map<string, string>; fallos: Map<string, string> }> {
  const ids = new Map<string, string>();
  const fallos = new Map<string, string>();
  const claves = Array.from(nuevos.keys());
  if (claves.length === 0) return { ids, fallos };
  const filas = claves.map((k) => {
    const p = nuevos.get(k)!;
    return { ...p, pendiente_completar: faltantesPaciente(p).length > 0 };
  });
  const res = await insertarEnLotes(supabase, 'pacientes', filas, 'id', ['pendiente_completar']);
  res.forEach((r, i) => {
    if (r.ok) ids.set(claves[i], r.row.id as string);
    else fallos.set(claves[i], `No se pudo crear el paciente: ${mensajeSeguro(r.error, 'agenda.import.paciente', 'error al guardar')}`);
  });
  return { ids, fallos };
}

/** Resolución de doctor → Ref, registrando los nuevos. Devuelve el motivo si se rechaza. */
function refDoctor(r: ResolucionDoctor | null, nuevos: Map<string, string>): { ref: Ref; motivo?: string; nuevo?: boolean } {
  if (!r) return { ref: null };
  if (r.tipo === 'rechazo') return { ref: null, motivo: r.motivo };
  if (r.tipo === 'existente') return { ref: { id: r.id } };
  if (!nuevos.has(r.clave)) nuevos.set(r.clave, r.alias);
  return { ref: { nuevo: r.clave }, nuevo: true };
}

function idDe(ref: Ref, creados: Map<string, string>): string | null | undefined {
  if (!ref) return null;
  if ('id' in ref) return ref.id;
  return creados.get(ref.nuevo); // undefined = no se pudo crear
}

/* ─────────── Endpoint ─────────── */

const MAX_SIZE_IMPORT = 5 * 1024 * 1024; // 5MB
const MAX_FILAS_IMPORT = 2000;
const MARGEN_MULTIPART = 64 * 1024;
const MAX_NOMBRE_ARCHIVO = 255;
const MAX_FILAS_PREVIEW = 100;

const MIME_IMPORT: Record<'csv' | 'xlsx', string[]> = {
  csv: ['', 'text/csv', 'text/plain', 'application/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'application/octet-stream'],
  xlsx: ['', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'application/zip'],
};

function contenidoCoincide(ext: 'csv' | 'xlsx', buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096));
  if (ext === 'xlsx') {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  return !bytes.includes(0);
}

/** Fila del preview que ve el usuario antes de confirmar. */
interface FilaPreview {
  fila: number;
  fecha: string | null;
  hora: string | null;
  paciente: string;
  doctor: string | null;
  estado?: string;
  paciente_nuevo: boolean;
  doctor_nuevo: boolean;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ROLES_IMPORTAR_AGENDA);
  if (roleError) return roleError;

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

  // Lecturas de referencia en paralelo con el parseo del archivo.
  const doctoresP = cargarDoctores(supabase);
  const pacientesP = cargarPacientes(supabase);
  doctoresP.catch(() => undefined);
  pacientesP.catch(() => undefined);

  // Hojas del archivo (CSV = una sola hoja).
  let hojas: Hoja[];
  try {
    if (ext === 'csv') {
      hojas = [hojaDesdeMatriz(tipo === 'cirugias' ? 'CIRUGIA' : 'CONSULTAS', parseCsv(decodeText(buffer)))];
    } else {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const leerHoja = (ws: (typeof workbook.worksheets)[number] | undefined, nombre: string): Hoja | null => {
        if (!ws) return null;
        const matriz: Array<Array<string | number>> = [];
        ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          const fila: Array<string | number> = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => { fila[colNumber - 1] = valorCelda(cell.value); });
          matriz[rowNumber - 1] = Array.from(fila, (v) => v ?? '');
        });
        return hojaDesdeMatriz(nombre, Array.from(matriz, (f) => f ?? []));
      };
      if (tipo === 'consultas') {
        const h = leerHoja(workbook.worksheets[0], 'CONSULTAS');
        hojas = h ? [h] : [];
      } else {
        const principal = leerHoja(workbook.getWorksheet('CIRUGIA') || workbook.worksheets[0], 'CIRUGIA');
        const aplazados = leerHoja(workbook.getWorksheet('APLAZADOS'), 'APLAZADOS');
        hojas = [principal, aplazados].filter((h): h is Hoja => !!h);
      }
    }
  } catch (err) {
    return NextResponse.json({ error: mensajeSeguro(err, 'agenda.import.leer', 'No se pudo leer el archivo') }, { status: 400 });
  }

  const totalFilas = hojas.reduce((n, h) => n + h.filas.length, 0);
  if (totalFilas === 0) {
    return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
  }
  if (totalFilas > MAX_FILAS_IMPORT) {
    return NextResponse.json({ error: `El archivo tiene más de ${MAX_FILAS_IMPORT} filas. Divídelo en partes.` }, { status: 400 });
  }

  let doctores: DoctorExistente[];
  let pacientes: PacienteExistente[];
  try {
    [doctores, pacientes] = await Promise.all([doctoresP, pacientesP]);
  } catch (err) {
    return errorInterno(err, 'agenda.import.precarga');
  }
  const resolverDoctor = crearResolverDoctores(doctores);
  const resolverPaciente = crearResolverPacientes(pacientes);

  // Estado común a ambos tipos
  const rechazos: FilaRechazada[] = [];
  const duplicados: FilaRechazada[] = [];
  const doctoresNuevos = new Map<string, string>(); // clave → alias MAYÚSCULAS
  const pacientesNuevos = new Map<string, PacienteNuevo>(); // clave → datos
  const valoresTexto = (valores: Array<string | number>) => valores.map((v) => String(v ?? ''));
  const rechazar = (hoja: Hoja, fila: Hoja['filas'][number], motivo: string) =>
    rechazos.push({ fila: fila.numero, motivo, valores: valoresTexto(fila.valores), hoja: hoja.nombre });
  const omitirDuplicado = (hoja: Hoja, fila: Hoja['filas'][number], motivo: string) =>
    duplicados.push({ fila: fila.numero, motivo, valores: valoresTexto(fila.valores), hoja: hoja.nombre });

  /** Paciente de la fila: existente o por crear (una sola vez por nombre). */
  const refPaciente = (clave: string, datos: PacienteNuevo): { ref: Ref; nuevo: boolean } => {
    const id = resolverPaciente(clave, datos.telefono);
    if (id) return { ref: { id }, nuevo: false };
    if (!pacientesNuevos.has(clave)) pacientesNuevos.set(clave, datos);
    return { ref: { nuevo: clave }, nuevo: true };
  };

  /** CSV unificado (con HOJA si hay más de una). */
  const encabezadosUnion = () => {
    if (hojas.length === 1) return hojas[0].encabezados;
    const union: string[] = [];
    for (const h of hojas) for (const e of h.encabezados) if (e && !union.includes(e)) union.push(e);
    return union;
  };
  const alinear = (lista: FilaRechazada[]) => {
    if (hojas.length === 1) return lista;
    const union = encabezadosUnion();
    return lista.map((r) => {
      const hoja = hojas.find((h) => h.nombre === r.hoja)!;
      return { ...r, valores: union.map((e) => { const j = hoja.encabezados.indexOf(e); return j >= 0 ? r.valores[j] ?? '' : ''; }) };
    });
  };
  const csvRechazos = () => generarCsvRechazos(encabezadosUnion(), alinear(rechazos), hojas.length > 1);
  const csvDuplicados = () => generarCsvRechazos(encabezadosUnion(), alinear(duplicados), hojas.length > 1);
  const listaRechazos = () =>
    rechazos
      .slice()
      .sort((a, b) => (a.hoja || '').localeCompare(b.hoja || '') || a.fila - b.fila)
      .map((r) => ({ fila: r.fila, hoja: r.hoja, motivo: r.motivo }));

  /* ══════════ CONSULTAS ══════════ */
  if (tipo === 'consultas') {
    const hoja = hojas[0];
    const headers = hoja.encabezados.map((h) => normalizeText(h));
    const col = (...nombres: string[]) => headers.findIndex((h) => nombres.some((n) => h === n || h.startsWith(n)));
    const idx = {
      fecha: col('fecha'),
      ingreso: col('hora de ingreso'),
      egreso: col('hora de egreso'),
      telefono: col('numero de telefono'),
      doctor: col('doctor'),
      nombre: col('nombre de paciente'),
      sexo: col('sexo'),
      fnac: col('fecha de nacimiento'),
      edad: col('edad'),
      consulta: col('consulta'),
      diagnostico: col('diagnostico'),
      tipoVisita: col('tipo de consulta'),
      est1: col('estudio 1', 'estudio1'),
      est2: col('estudio2', 'estudio 2'),
      est3: col('estudio3', 'estudio 3'),
      procedimiento: col('procedimiento'),
      aseguradora: col('aseguranza'),
      metodoPago: col('metodo de pago'),
      costo: col('costo consulta'),
    };
    if (idx.fecha < 0 || idx.nombre < 0) {
      return NextResponse.json({ error: 'No se encontraron las columnas FECHA y NOMBRE DE PACIENTE' }, { status: 400 });
    }
    const get = (valores: Array<string | number>, i: number) => (i >= 0 ? texto(valores[i]) : '');
    const crudo = (valores: Array<string | number>, i: number) => (i >= 0 ? valores[i] ?? '' : '');

    const { data: aseguranzas } = await supabase.from('aseguranzas').select('id, nombre');
    const asegNorm = new Map<string, string>((aseguranzas || []).map((a: { id: string; nombre: string }) => [normalizeText(a.nombre), a.id]));

    interface Pend {
      fila: Hoja['filas'][number];
      fecha: string;
      hora_inicio: string | null;
      hora_fin: string | null;
      nombre: string;
      clave: string;
      paciente: Ref;
      pacienteNuevo: boolean;
      doctor: Ref;
      doctorTexto: string | null;
      doctorNuevo: boolean;
      v: Array<string | number>;
    }
    const validas: Pend[] = [];

    for (const fila of hoja.filas) {
      const v = fila.valores;
      const nombreV = validarNombrePaciente(get(v, idx.nombre));
      if (!nombreV.ok) { rechazar(hoja, fila, nombreV.motivo); continue; }
      const fechaTxt = crudo(v, idx.fecha);
      if (String(fechaTxt).trim() === '') { rechazar(hoja, fila, 'Falta la fecha'); continue; }
      const fecha = parseFechaImport(fechaTxt);
      if (!fecha) { rechazar(hoja, fila, `Fecha no válida («${texto(fechaTxt)}»). Usa AAAA-MM-DD o DD/MM/AAAA`); continue; }
      const ingresoTxt = crudo(v, idx.ingreso);
      const horaInicio = parseHoraImport(ingresoTxt);
      if (String(ingresoTxt).trim() !== '' && !horaInicio) { rechazar(hoja, fila, `Hora de ingreso no válida («${texto(ingresoTxt)}»)`); continue; }
      const egresoTxt = crudo(v, idx.egreso);
      const horaFin = parseHoraImport(egresoTxt);
      if (String(egresoTxt).trim() !== '' && !horaFin) { rechazar(hoja, fila, `Hora de egreso no válida («${texto(egresoTxt)}»)`); continue; }

      const doctorTexto = get(v, idx.doctor) || null;
      const doc = refDoctor(resolverDoctor(doctorTexto), doctoresNuevos);
      if (doc.motivo) { rechazar(hoja, fila, doc.motivo); continue; }

      const edadNum = parseInt(get(v, idx.edad), 10);
      const pac = refPaciente(nombreV.clave, {
        nombre_completo: nombreV.nombre,
        telefono: get(v, idx.telefono).slice(0, 20) || null,
        sexo: normalizarSexo(get(v, idx.sexo)),
        fecha_nacimiento: parseFechaImport(crudo(v, idx.fnac)),
        edad: Number.isFinite(edadNum) && edadNum >= 0 && edadNum <= 120 ? edadNum : null,
      });
      validas.push({
        fila, fecha, hora_inicio: horaInicio, hora_fin: horaFin, nombre: nombreV.nombre, clave: nombreV.clave,
        paciente: pac.ref, pacienteNuevo: pac.nuevo, doctor: doc.ref, doctorTexto, doctorNuevo: !!doc.nuevo, v,
      });
    }

    // Duplicados contra la BD (mismas fechas) y dentro del archivo.
    const fechas = Array.from(new Set(validas.map((f) => f.fecha)));
    let existentes: Array<{ fecha: string; hora_inicio: string | null; pacientes: unknown }>;
    try {
      existentes = (
        await Promise.all(
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
        )
      ).flat();
    } catch (err) {
      return errorInterno(err, 'agenda.import.duplicados');
    }
    const nombreDe = (p: unknown) => {
      const x = Array.isArray(p) ? p[0] : p;
      return (x as { nombre_completo?: string | null } | null)?.nombre_completo || '';
    };
    const claveConsulta = (fecha: string, hora: string | null, clavePaciente: string) => `${fecha}|${(hora || '').slice(0, 5)}|${clavePaciente}`;
    const enBd = new Set(existentes.map((c) => claveConsulta(c.fecha, c.hora_inicio, claveTexto(nombreDe(c.pacientes)))));
    const enArchivo = new Map<string, number>();
    const porInsertar: Pend[] = [];
    for (const p of validas) {
      const k = claveConsulta(p.fecha, p.hora_inicio, p.clave);
      if (enBd.has(k)) { omitirDuplicado(hoja, p.fila, 'Ya existe en el sistema (mismo paciente, fecha y hora)'); continue; }
      const previa = enArchivo.get(k);
      if (previa) { omitirDuplicado(hoja, p.fila, `Duplicada dentro del archivo (igual a la fila ${previa})`); continue; }
      enArchivo.set(k, p.fila.numero);
      porInsertar.push(p);
    }
    // Solo se crean los pacientes/doctores de filas que sí se van a insertar
    const usadosPac = new Set(porInsertar.flatMap((p) => (p.paciente && 'nuevo' in p.paciente ? [p.paciente.nuevo] : [])));
    const usadosDoc = new Set(porInsertar.flatMap((p) => (p.doctor && 'nuevo' in p.doctor ? [p.doctor.nuevo] : [])));
    pacientesNuevos.forEach((_, k) => { if (!usadosPac.has(k)) pacientesNuevos.delete(k); });
    doctoresNuevos.forEach((_, k) => { if (!usadosDoc.has(k)) doctoresNuevos.delete(k); });

    const resumen = {
      total: totalFilas,
      aImportar: porInsertar.length,
      duplicadas: duplicados.length,
      conError: rechazos.length,
      doctoresNuevos: Array.from(doctoresNuevos.values()),
      pacientesNuevos: pacientesNuevos.size,
    };

    if (!confirmar) {
      return NextResponse.json({
        preview: true,
        tipo: 'consultas',
        resumen,
        filas: porInsertar.slice(0, MAX_FILAS_PREVIEW).map((p): FilaPreview => ({
          fila: p.fila.numero,
          fecha: p.fecha,
          hora: p.hora_inicio,
          paciente: p.nombre,
          doctor: p.doctorTexto,
          paciente_nuevo: p.pacienteNuevo,
          doctor_nuevo: p.doctorNuevo,
        })),
        rechazos: listaRechazos(),
        rechazosCsv: csvRechazos(),
        duplicadosCsv: csvDuplicados(),
      });
    }

    // Confirmación: doctores → pacientes → consultas
    const [docs, pacs, conteo] = await Promise.all([
      crearDoctores(supabase, doctoresNuevos),
      crearPacientes(supabase, pacientesNuevos),
      supabase.from('consultas').select('id', { count: 'exact', head: true }),
    ]);
    if (conteo.error) return errorInterno(conteo.error, 'agenda.import.folios');
    let seq = conteo.count || 0;
    const year = new Date().getFullYear().toString().slice(-2);
    const METODO_PAGO_MAP: Record<string, string> = {
      efectivo: 'EFECTIVO', tarjeta: 'TARJETA', 'tarjeta de credito': 'TARJETA',
      'tarjeta de debito': 'TARJETA', transferencia: 'TRANSFERENCIA',
    };

    const filasConsulta: Array<{ p: Pend; row: Record<string, unknown> }> = [];
    for (const p of porInsertar) {
      const pacienteId = idDe(p.paciente, pacs.ids);
      if (!pacienteId) {
        rechazar(hoja, p.fila, (p.paciente && 'nuevo' in p.paciente && pacs.fallos.get(p.paciente.nuevo)) || 'No se pudo crear el paciente');
        continue;
      }
      const doctorId = idDe(p.doctor, docs.ids);
      if (doctorId === undefined) {
        rechazar(hoja, p.fila, (p.doctor && 'nuevo' in p.doctor && docs.fallos.get(p.doctor.nuevo)) || 'No se pudo crear el doctor');
        continue;
      }
      const v = p.v;
      const costo = parseCosto(get(v, idx.costo));
      const metodoTxt = get(v, idx.metodoPago);
      const asegTxt = get(v, idx.aseguradora);
      seq += 1;
      filasConsulta.push({
        p,
        row: {
          folio: `CON-${year}-${String(seq).padStart(5, '0')}`,
          paciente_id: pacienteId,
          doctor_id: doctorId,
          fecha: p.fecha,
          hora_inicio: p.hora_inicio,
          hora_fin: p.hora_fin && p.hora_inicio && p.hora_fin > p.hora_inicio ? p.hora_fin : null,
          tipo_consulta: (get(v, idx.consulta) || 'CONSULTA').toUpperCase(),
          tipo_visita: get(v, idx.tipoVisita).toUpperCase().includes('PRIMERA') ? 'PRIMERA_VEZ' : 'SUBSECUENTE',
          diagnostico: get(v, idx.diagnostico) || null,
          estudio_1: get(v, idx.est1) || null,
          estudio_2: get(v, idx.est2) || null,
          estudio_3: get(v, idx.est3) || null,
          procedimiento: get(v, idx.procedimiento) || null,
          metodo_pago: metodoTxt ? METODO_PAGO_MAP[normalizeText(metodoTxt)] || null : null,
          aseguranza_id: asegTxt ? asegNorm.get(normalizeText(asegTxt)) || null : null,
          costo_total: costo,
          estatus: 'AGENDADA',
          estatus_pago: costo > 0 ? 'PENDIENTE_PAGO' : 'PAGADO',
          // Registro histórico de entradas/salidas: puede traer horarios empalmados reales.
          permite_empalme: true,
        },
      });
    }

    let importadas = 0;
    const resultados = await insertarEnLotes(supabase, 'consultas', filasConsulta.map((x) => x.row), 'id');
    resultados.forEach((r, i) => {
      if (r.ok) importadas++;
      else rechazar(hoja, filasConsulta[i].p.fila, mensajeSeguro(r.error, 'agenda.import', 'No se pudo guardar'));
    });

    await supabase.from('agenda_import_log').insert({
      usuario_id: auth.user.id,
      archivo_nombre: archivoNombre,
      total_filas: totalFilas,
      filas_ok: importadas,
      filas_rechazadas: rechazos.length + duplicados.length,
      detalle_rechazados: listaRechazos(),
    });

    return NextResponse.json({
      preview: false,
      tipo: 'consultas',
      importadas,
      omitidasDuplicadas: duplicados.length,
      errores: rechazos.length,
      doctoresCreados: docs.ids.size,
      pacientesCreados: pacs.ids.size,
      rechazos: listaRechazos(),
      rechazosCsv: csvRechazos(),
      duplicadosCsv: csvDuplicados(),
    });
  }

  /* ══════════ CIRUGÍAS (hoja CIRUGIA + APLAZADOS) ══════════ */

  interface PendCx {
    hoja: Hoja;
    fila: Hoja['filas'][number];
    clave: string;
    nombre: string;
    paciente: Ref;
    pacienteNuevo: boolean;
    doctor: Ref;
    doctorTexto: string | null;
    doctorNuevo: boolean;
    dedupe: string;
    data: Record<string, unknown>;
  }
  const validasCx: PendCx[] = [];
  const val = (o: Record<string, string | number>, k: string) => texto(o[k]);

  for (const hoja of hojas) {
    const esAplazados = hoja.nombre === 'APLAZADOS';
    for (const fila of hoja.filas) {
      const o = fila.obj;
      const nombreV = validarNombrePaciente(val(o, 'NOMBRE PX'));
      if (!nombreV.ok) { rechazar(hoja, fila, nombreV.motivo); continue; }

      let fecha: string | null = null;
      let hora: string | null = null;
      if (!esAplazados) {
        const fechaTxt = o['FECHA'] ?? '';
        fecha = parseFechaImport(fechaTxt);
        if (String(fechaTxt).trim() !== '' && !fecha) {
          rechazar(hoja, fila, `Fecha no válida («${texto(fechaTxt)}»). Usa AAAA-MM-DD o DD/MM/AAAA; déjala vacía para aplazada`);
          continue;
        }
        const horaTxt = o['HORA CX'] ?? '';
        hora = parseHoraImport(horaTxt);
        if (String(horaTxt).trim() !== '' && !hora) { rechazar(hoja, fila, `Hora no válida («${texto(horaTxt)}»)`); continue; }
      }

      const ojoTxt = val(o, 'OJO');
      const ojo2Txt = val(o, 'OJO_2');
      const ojo = normalizeOjo(ojoTxt) || normalizeOjo(ojo2Txt);
      if ((ojoTxt && !normalizeOjo(ojoTxt)) || (ojo2Txt && !normalizeOjo(ojo2Txt))) {
        rechazar(hoja, fila, `Ojo no válido («${ojoTxt || ojo2Txt}»). Usa OD, OI/OS u OU`);
        continue;
      }

      const doctorTexto = esAplazados ? null : val(o, 'CIRUJANO') || null;
      const doc = refDoctor(resolverDoctor(doctorTexto), doctoresNuevos);
      if (doc.motivo) { rechazar(hoja, fila, doc.motivo); continue; }

      const edadNum = parseInt(val(o, 'EDAD'), 10);
      const pac = refPaciente(nombreV.clave, {
        nombre_completo: nombreV.nombre,
        telefono: (val(o, 'TELEFONO') || val(o, 'TELÉFONO')).slice(0, 20) || null,
        sexo: normalizarSexo(val(o, 'SEXO')),
        fecha_nacimiento: parseFechaImport(o['FECHA NAC.'] ?? ''),
        edad: Number.isFinite(edadNum) && edadNum >= 0 && edadNum <= 120 ? edadNum : null,
      });

      const procedimiento = val(o, 'PROCEDIMIENTO') || null;
      const notasBase = val(o, 'NOTAS') || null;
      const suspendida = !esAplazados && !!notasBase && notasBase.toUpperCase().includes('SUSPENDIDO');
      const ojo2 = normalizeOjo(ojo2Txt);
      let notas = notasBase;
      if (suspendida) notas = null;
      else if (ojo2 && ojo && ojo2 !== ojo) notas = notas ? `${notas} (2º ojo: ${ojo2})` : `(2º ojo: ${ojo2})`;

      const estado = esAplazados ? 'aplazada' : suspendida ? 'cancelada' : fecha ? 'agendada' : 'aplazada';
      const dedupe = fecha
        ? `F|${nombreV.clave}|${fecha}|${(hora || '').slice(0, 5)}`
        : `A|${nombreV.clave}|${claveTexto(procedimiento || '')}`;

      validasCx.push({
        hoja, fila, clave: nombreV.clave, nombre: nombreV.nombre,
        paciente: pac.ref, pacienteNuevo: pac.nuevo, doctor: doc.ref, doctorTexto, doctorNuevo: !!doc.nuevo, dedupe,
        data: {
          nombre_paciente: nombreV.nombre,
          expediente: val(o, 'No. Expediente') || null,
          fecha,
          hora,
          jornada: esAplazados ? null : val(o, 'JORNADA') || null,
          diagnostico: val(o, 'DIAGNOSTICO') || null,
          procedimiento,
          ojo,
          lio: val(o, 'LIO') || val(o, 'LIO_2') || null,
          marca_lio: esAplazados ? null : val(o, 'MARCA') || val(o, 'MARCA_2') || null,
          tiempo_estimado: esAplazados ? null : val(o, 'TIEMPO ESTIMADO CX') || null,
          tiempo_estancia: esAplazados ? null : val(o, 'TIEMPO DE ESTANCIA') || null,
          estado,
          notas: esAplazados ? null : notas,
          ...(estado === 'aplazada'
            ? { procedencia: val(o, 'PROCEDENCIA') || null, motivo_aplazamiento: val(o, 'MOTIVO') || null }
            : {}),
        },
      });
    }
  }

  // Duplicados: cirugías de las fechas del archivo + aplazadas sin fecha.
  const fechasArchivo = Array.from(new Set(validasCx.map((f) => f.data.fecha as string | null).filter((f): f is string => !!f)));
  const haySinFecha = validasCx.some((f) => !f.data.fecha);
  type Existente = { nombre_paciente: string | null; fecha: string | null; hora: string | null; procedimiento: string | null };
  let existentesCx: Existente[];
  try {
    const [porFecha, sinFecha] = await Promise.all([
      Promise.all(
        trozos(fechasArchivo, 60).map((grupo) =>
          leerPaginado<Existente>((d, h) =>
            supabase
              .from('agenda_cirugias')
              .select('nombre_paciente, fecha, hora, procedimiento')
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
              .select('nombre_paciente, fecha, hora, procedimiento')
              .is('fecha', null)
              .order('id', { ascending: true })
              .range(d, h) as unknown as PromiseLike<{ data: Existente[] | null; error: unknown }>
          )
        : Promise.resolve([] as Existente[]),
    ]);
    existentesCx = [...porFecha.flat(), ...sinFecha];
  } catch (err) {
    return errorInterno(err, 'agenda.import.duplicados');
  }
  const enBdCx = new Set(
    existentesCx.map((e) =>
      e.fecha
        ? `F|${claveTexto(e.nombre_paciente || '')}|${e.fecha}|${(e.hora || '').slice(0, 5)}`
        : `A|${claveTexto(e.nombre_paciente || '')}|${claveTexto(e.procedimiento || '')}`
    )
  );
  const enArchivoCx = new Map<string, string>();
  const porInsertarCx: PendCx[] = [];
  for (const p of validasCx) {
    if (enBdCx.has(p.dedupe)) {
      omitirDuplicado(p.hoja, p.fila, p.data.fecha ? 'Ya existe en el sistema (mismo paciente, fecha y hora)' : 'Ya existe como aplazada (mismo paciente y procedimiento)');
      continue;
    }
    const previa = enArchivoCx.get(p.dedupe);
    if (previa) { omitirDuplicado(p.hoja, p.fila, `Duplicada dentro del archivo (igual a ${previa})`); continue; }
    enArchivoCx.set(p.dedupe, hojas.length > 1 ? `${p.hoja.nombre} fila ${p.fila.numero}` : `la fila ${p.fila.numero}`);
    porInsertarCx.push(p);
  }
  const usadosPac = new Set(porInsertarCx.flatMap((p) => (p.paciente && 'nuevo' in p.paciente ? [p.paciente.nuevo] : [])));
  const usadosDoc = new Set(porInsertarCx.flatMap((p) => (p.doctor && 'nuevo' in p.doctor ? [p.doctor.nuevo] : [])));
  pacientesNuevos.forEach((_, k) => { if (!usadosPac.has(k)) pacientesNuevos.delete(k); });
  doctoresNuevos.forEach((_, k) => { if (!usadosDoc.has(k)) doctoresNuevos.delete(k); });

  const resumenCx = {
    total: totalFilas,
    aImportar: porInsertarCx.length,
    aplazadas: porInsertarCx.filter((p) => p.data.estado === 'aplazada').length,
    duplicadas: duplicados.length,
    conError: rechazos.length,
    doctoresNuevos: Array.from(doctoresNuevos.values()),
    pacientesNuevos: pacientesNuevos.size,
  };

  if (!confirmar) {
    return NextResponse.json({
      preview: true,
      tipo: 'cirugias',
      resumen: resumenCx,
      filas: porInsertarCx.slice(0, MAX_FILAS_PREVIEW).map((p): FilaPreview => ({
        fila: p.fila.numero,
        fecha: (p.data.fecha as string | null) ?? null,
        hora: (p.data.hora as string | null) ?? null,
        paciente: p.nombre,
        doctor: p.doctorTexto,
        estado: p.data.estado as string,
        paciente_nuevo: p.pacienteNuevo,
        doctor_nuevo: p.doctorNuevo,
      })),
      rechazos: listaRechazos(),
      rechazosCsv: csvRechazos(),
      duplicadosCsv: csvDuplicados(),
    });
  }

  const [docs, pacs] = await Promise.all([crearDoctores(supabase, doctoresNuevos), crearPacientes(supabase, pacientesNuevos)]);
  const filasCx: Array<{ p: PendCx; row: Record<string, unknown> }> = [];
  for (const p of porInsertarCx) {
    const pacienteId = idDe(p.paciente, pacs.ids);
    if (!pacienteId) {
      rechazar(p.hoja, p.fila, (p.paciente && 'nuevo' in p.paciente && pacs.fallos.get(p.paciente.nuevo)) || 'No se pudo crear el paciente');
      continue;
    }
    const doctorId = idDe(p.doctor, docs.ids);
    if (doctorId === undefined) {
      rechazar(p.hoja, p.fila, (p.doctor && 'nuevo' in p.doctor && docs.fallos.get(p.doctor.nuevo)) || 'No se pudo crear el doctor');
      continue;
    }
    filasCx.push({ p, row: { ...p.data, paciente_id: pacienteId, doctor_id: doctorId } });
  }

  let importadas = 0;
  let aplazadasImportadas = 0;
  const resultados = await insertarEnLotes(supabase, 'agenda_cirugias', filasCx.map((x) => x.row), 'id, doctor_id');
  const doctorRows: Array<Record<string, unknown>> = [];
  resultados.forEach((r, i) => {
    const { p } = filasCx[i];
    if (r.ok) {
      if (p.data.estado === 'aplazada') aplazadasImportadas++;
      else importadas++;
      if (r.row.doctor_id) {
        doctorRows.push({ cirugia_id: r.row.id, doctor_id: r.row.doctor_id, rol: 'CIRUJANO_PRINCIPAL', porcentaje_participacion: 100 });
      }
    } else {
      rechazar(p.hoja, p.fila, mensajeSeguro(r.error, 'agenda.import', 'No se pudo guardar'));
    }
  });
  for (const lote of trozos(doctorRows, LOTE_INSERT)) {
    const { error } = await supabase.from('agenda_cirugia_doctores').insert(lote);
    if (error) handleSupabaseError(error, 'agenda.import.doctores');
  }

  await supabase.from('agenda_import_log').insert({
    usuario_id: auth.user.id,
    archivo_nombre: archivoNombre,
    total_filas: totalFilas,
    filas_ok: importadas + aplazadasImportadas,
    filas_rechazadas: rechazos.length + duplicados.length,
    detalle_rechazados: listaRechazos(),
  });

  return NextResponse.json({
    preview: false,
    tipo: 'cirugias',
    importadas,
    aplazadasImportadas,
    omitidasDuplicadas: duplicados.length,
    errores: rechazos.length,
    doctoresCreados: docs.ids.size,
    pacientesCreados: pacs.ids.size,
    rechazos: listaRechazos(),
    rechazosCsv: csvRechazos(),
    duplicadosCsv: csvDuplicados(),
  });
}
