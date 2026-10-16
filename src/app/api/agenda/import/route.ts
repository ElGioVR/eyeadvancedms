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
  detectarOrdenFechas,
  fechasInvertidasPorExcel,
  parseHoraImport,
  normalizarTelefonoImport,
  corregirHoraFin,
  anestesiaImport,
  fechaNacimientoCoherente,
  tipoConsultaImport,
  validarNombrePaciente,
  valorCelda,
  type DoctorExistente,
  type FilaRechazada,
  type PacienteExistente,
  type ResolucionDoctor,
} from '@/lib/import-agenda';
import { ruta } from '@/lib/api/ruta';
import { liberarLentes, guardarPlanLentes } from '@/lib/cirugia-lentes';
import {
  interpretarLio,
  planificarLentes,
  etiquetaModoLente,
  type InterpretacionLio,
  type LentePlanImport,
  type PiezaInventario,
} from '@/lib/import-lentes-puro';
import { requiereLente } from '@/lib/por-completar';
import { exigirLimite } from '@/lib/api/limites';

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

const METODO_PAGO_MAP: Record<string, string> = {
  efectivo: 'EFECTIVO', tarjeta: 'TARJETA', 'tarjeta de credito': 'TARJETA',
  'tarjeta de debito': 'TARJETA', transferencia: 'TRANSFERENCIA',
};
/** Valores que significan «sin método de pago» (no es un dato desconocido). */
const SIN_METODO = new Set(['no aplica', 'n/a', 'na', 'sin pago', 'pendiente', '-', '']);

/** «Fila 5, fila 9 y 3 más» para listas de avisos. */
function listaFilas(filas: number[], max = 6): string {
  const uno = filas.slice(0, max).map((n) => `fila ${n}`).join(', ');
  return filas.length > max ? `${uno} y ${filas.length - max} más` : uno;
}

/** Una hoja leída: encabezados originales + filas (valores crudos y por encabezado). */
interface Hoja {
  nombre: string;
  encabezados: string[];
  filas: Array<{ numero: number; valores: Array<string | number>; obj: Record<string, string | number> }>;
  /** Filas con datos solo en columnas SIN encabezado (tablas auxiliares al lado): se ignoran. */
  ignoradas: number;
}

function hojaDesdeMatriz(nombre: string, matriz: Array<Array<string | number>>): Hoja {
  const encabezados = (matriz[0] || []).map((h) => String(h ?? '').trim());
  // Claves en MAYÚSCULAS: «Fecha» y «FECHA» son la misma columna.
  const claves = dedupeHeaders(encabezados.map((h) => h.toUpperCase()));
  const filas: Hoja['filas'] = [];
  let ignoradas = 0;
  matriz.slice(1).forEach((valores, i) => {
    if (valores.every((v) => String(v ?? '').trim() === '')) return; // fila vacía
    // Solo cuentan las columnas con encabezado: catálogos o notas al costado no son filas de datos.
    if (encabezados.every((h, j) => !h || String(valores[j] ?? '').trim() === '')) { ignoradas++; return; }
    const obj: Record<string, string | number> = {};
    claves.forEach((h, j) => { if (h) obj[h] = valores[j] ?? ''; });
    filas.push({ numero: i + 2, valores, obj });
  });
  return { nombre, encabezados, filas, ignoradas };
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
      .select('id, nombre_completo, telefono, created_at, sexo, fecha_nacimiento, edad, numero_expediente')
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
  /** No. Exp del archivo (solo si no lo tiene otro paciente). */
  numero_expediente?: string | null;
}

/** Datos generales vacíos de pacientes ya existentes que el archivo sí trae. */
type CompletarPaciente = Partial<Pick<PacienteNuevo, 'telefono' | 'sexo' | 'fecha_nacimiento' | 'edad' | 'numero_expediente'>>;

/** Completa (solo campos vacíos) los datos generales de pacientes existentes. Devuelve cuántos. */
async function aplicarCompletarPacientes(supabase: Admin, mapa: Map<string, CompletarPaciente>): Promise<number> {
  let n = 0;
  await mapConLimite(Array.from(mapa.entries()), 6, async ([id, cambios]) => {
    const { error } = await supabase.from('pacientes').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      // Expediente repetido (índice único): se guarda lo demás.
      if (cambios.numero_expediente && error.code === '23505') {
        const { numero_expediente: _e, ...resto } = cambios;
        if (Object.keys(resto).length) {
          const r = await supabase.from('pacientes').update({ ...resto, updated_at: new Date().toISOString() }).eq('id', id);
          if (!r.error) n++;
        }
      } else handleSupabaseError(error, 'agenda.import.completar-paciente');
      return;
    }
    n++;
  });
  return n;
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
    const { numero_expediente, ...resto } = p;
    return { ...resto, ...(numero_expediente ? { numero_expediente } : {}), pendiente_completar: faltantesPaciente(p).length > 0 };
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

/* ─────────── Servicios de las consultas (consulta_conceptos) ─────────── */

type TipoConcepto = 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO';
interface ServicioCat { id: string; nombre: string; costo: number }
interface CatalogosServicios {
  /** «aseguranza|tipo|nombre normalizado» → servicio propio de la aseguradora. */
  propios: Map<string, ServicioCat>;
  /** «tipo|nombre normalizado» → servicio del catálogo general. */
  generico: Map<string, ServicioCat>;
}

async function cargarCatalogosServicios(supabase: Admin): Promise<CatalogosServicios> {
  const propios = new Map<string, ServicioCat>();
  const generico = new Map<string, ServicioCat>();
  try {
    const filas = await leerPaginado<{ id: string; aseguranza_id: string; nombre: string; costo: number | string | null; tipo: string }>((d, h) =>
      supabase.from('aseguranza_servicios').select('id, aseguranza_id, nombre, costo, tipo').eq('activo', true).order('id', { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: { id: string; aseguranza_id: string; nombre: string; costo: number | string | null; tipo: string }[] | null; error: unknown }>
    );
    for (const f of filas) propios.set(`${f.aseguranza_id}|${f.tipo}|${claveTexto(f.nombre)}`, { id: f.id, nombre: f.nombre, costo: Number(f.costo) || 0 });
  } catch { /* sin catálogo de aseguradoras: se usa el general */ }
  const tablas: Array<[TipoConcepto, string]> = [['CONSULTA', 'catalogo_consultas'], ['ESTUDIO', 'catalogo_estudios'], ['PROCEDIMIENTO', 'catalogo_procedimientos']];
  await Promise.all(tablas.map(async ([tipo, tabla]) => {
    try {
      const filas = await leerPaginado<{ id: string; nombre: string; costo: number | string | null }>((d, h) =>
        supabase.from(tabla).select('id, nombre, costo').eq('activo', true).order('id', { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: { id: string; nombre: string; costo: number | string | null }[] | null; error: unknown }>
      );
      for (const f of filas) generico.set(`${tipo}|${claveTexto(f.nombre)}`, { id: f.id, nombre: f.nombre, costo: Number(f.costo) || 0 });
    } catch { /* catálogo general aún no creado */ }
  }));
  return { propios, generico };
}

function buscarServicio(cat: CatalogosServicios, aseguranzaId: string | null, tipo: TipoConcepto, nombres: string[]): ServicioCat | null {
  for (const n of nombres) {
    const k = claveTexto(n);
    const s = (aseguranzaId ? cat.propios.get(`${aseguranzaId}|${tipo}|${k}`) : undefined) ?? cat.generico.get(`${tipo}|${k}`);
    if (s) return s;
  }
  return null;
}

const NOMBRES_CONSULTA: Record<'PRIMERA_VEZ' | 'SUBSECUENTE', string[]> = {
  PRIMERA_VEZ: ['Primera consulta', 'Consulta primera vez', 'Consulta', 'Primera vez'],
  SUBSECUENTE: ['Consulta subsecuente', 'Subsecuente', 'Consulta de seguimiento', 'Revisión'],
};

/** Conceptos clínicos de una consulta importada (mismo formato que el alta normal). */
function construirConceptos(
  cat: CatalogosServicios,
  d: {
    consultaId: string;
    aseguranzaId: string | null;
    doctorId: string | null;
    indicadoPorId: string | null;
    tipo: { tipo_consulta: TipoConcepto; tipo_visita: 'PRIMERA_VEZ' | 'SUBSECUENTE' };
    estudios: string[];
    procedimiento: string | null;
    cantidad: number;
    costo: number;
  },
): { filas: Array<Record<string, unknown>>; noEncontrados: string[] } {
  const noEncontrados: string[] = [];
  const filas: Array<Record<string, unknown>> = [];
  const agregar = (tipo: TipoConcepto, texto: string, nombres: string[], cantidad: number) => {
    const sv = buscarServicio(cat, d.aseguranzaId, tipo, nombres);
    if (!sv) noEncontrados.push(texto);
    filas.push({
      consulta_id: d.consultaId,
      doctor_id: d.doctorId,
      indicado_por_id: d.indicadoPorId ?? d.doctorId,
      tipo_concepto: tipo,
      concepto_id: sv?.id ?? null,
      texto_original: sv?.nombre ?? texto,
      precio_aplicado: sv?.costo ?? 0,
      cantidad,
      ojo: null,
    });
  };
  if (d.tipo.tipo_consulta === 'CONSULTA') {
    const etiqueta = d.tipo.tipo_visita === 'SUBSECUENTE' ? 'Consulta subsecuente' : 'Primera consulta';
    agregar('CONSULTA', etiqueta, NOMBRES_CONSULTA[d.tipo.tipo_visita], 1);
  }
  for (const e of d.estudios) agregar('ESTUDIO', e, [e], 1);
  if (d.procedimiento) agregar('PROCEDIMIENTO', d.procedimiento, [d.procedimiento], d.cantidad);
  // Un solo servicio sin precio en catálogo: el costo del archivo es el de ese servicio.
  if (filas.length === 1 && Number(filas[0].precio_aplicado) === 0 && d.costo > 0) {
    filas[0].precio_aplicado = Math.round((d.costo / Number(filas[0].cantidad)) * 100) / 100;
  }
  return { filas, noEncontrados };
}

const etiquetaTipoImport = (t: { tipo_consulta: string; tipo_visita: string }) =>
  t.tipo_consulta === 'ESTUDIO' ? 'Estudios' : t.tipo_consulta === 'PROCEDIMIENTO' ? 'Procedimiento' : t.tipo_visita === 'SUBSECUENTE' ? 'Subsecuente' : 'Primera consulta';

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
  /** Tipo de consulta u ojo/procedimiento de la cirugía. */
  detalle?: string;
  /** Lo que quedará en «Por completar»: hora, doctor, aseguradora, ojo, anestesia, lente… */
  faltantes?: string[];
  /** Cirugías: plan de lentes que se guardará («1º Isert 21 → Asignar · Resp. CT Lucia 22.5 → Solicitar»). */
  lentes?: string;
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const limite = await exigirLimite('importacion', auth.user.id);
  if (limite) return limite;
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
  // Comentarios clínica (oct 2026): importar también las filas que parecen duplicadas.
  const incluirDuplicados = formData.get('incluir_duplicados') === 'true';
  // Completar existentes: en cirugías ya guardadas con el mismo paciente/fecha/ojo/procedimiento,
  // llena SOLO hora (si está vacía o 00:00) y anestesia (si está vacía). Nunca sobrescribe.
  const completarExistentes = formData.get('completar_existentes') === 'true';
  // C1: decisión por fila para conflictos con lo ya guardado: { "<fila>": REAGENDA | REINTERVENCION | AGREGAR | OMITIR }
  let decisiones: Record<string, string> = {};
  const decisionesTxt = formData.get('decisiones');
  if (typeof decisionesTxt === 'string' && decisionesTxt) {
    try {
      const parsed = JSON.parse(decisionesTxt) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) decisiones = parsed as Record<string, string>;
    } catch { /* decisiones mal formadas: se tratan como pendientes */ }
  }
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
  if (extRaw === 'xls') {
    return NextResponse.json(
      { error: 'Los archivos .xls (Excel 97-2003) no se pueden leer. Ábrelo en Excel y usa «Guardar como» → Libro de Excel (.xlsx)' },
      { status: 400 }
    );
  }
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
        // Nombres de hoja sin distinguir mayúsculas ni espacios sobrantes («CONSULTADOS »).
        const porNombre = (n: string) => workbook.worksheets.find((w) => w.name.trim().toUpperCase() === n);
        const principal = leerHoja(porNombre('CIRUGIA') || porNombre('CIRUGÍA') || workbook.worksheets[0], 'CIRUGIA');
        const aplazados = leerHoja(porNombre('APLAZADOS'), 'APLAZADOS');
        const consultados = leerHoja(porNombre('CONSULTADOS'), 'CONSULTADOS');
        hojas = [principal, aplazados, consultados].filter((h): h is Hoja => !!h);
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
  const pacientePorId = new Map(pacientes.map((p) => [p.id, p]));
  const normExp = (t: string | null | undefined) => (t ?? '').trim().toUpperCase();
  const expedientesUsados = new Set(pacientes.map((p) => normExp(p.numero_expediente)).filter(Boolean));
  /** Expediente del archivo si nadie más lo tiene (índice único); lo reserva. */
  const tomarExpediente = (exp: string | null | undefined): string | null => {
    const k = normExp(exp);
    if (!k || k.length > 50 || expedientesUsados.has(k)) return null;
    expedientesUsados.add(k);
    return (exp ?? '').trim();
  };
  // Pacientes ya registrados con datos generales vacíos que el archivo trae (sexo, nacimiento…).
  const completarPacientes = new Map<string, CompletarPaciente>();

  // Estado común a ambos tipos
  const rechazos: FilaRechazada[] = [];
  const duplicados: FilaRechazada[] = [];
  const doctoresNuevos = new Map<string, string>(); // clave → alias MAYÚSCULAS
  const avisos: string[] = [];
  for (const h of hojas) {
    if (h.ignoradas > 0) avisos.push(`${h.nombre}: ${h.ignoradas} fila${h.ignoradas === 1 ? '' : 's'} con datos solo en columnas sin encabezado (tablas o catálogos al costado) se ignoraron.`);
  }
  const pacientesNuevos = new Map<string, PacienteNuevo>(); // clave → datos
  const valoresTexto = (valores: Array<string | number>) => valores.map((v) => String(v ?? ''));
  const rechazar = (hoja: Hoja, fila: Hoja['filas'][number], motivo: string) =>
    rechazos.push({ fila: fila.numero, motivo, valores: valoresTexto(fila.valores), hoja: hoja.nombre });
  const omitirDuplicado = (hoja: Hoja, fila: Hoja['filas'][number], motivo: string) =>
    duplicados.push({ fila: fila.numero, motivo, valores: valoresTexto(fila.valores), hoja: hoja.nombre });

  /** Paciente de la fila: existente o por crear (una sola vez por nombre). */
  const refPaciente = (clave: string, datos: PacienteNuevo): { ref: Ref; nuevo: boolean } => {
    const id = resolverPaciente(clave, datos.telefono);
    if (id) {
      const ex = pacientePorId.get(id);
      if (ex) {
        const c: CompletarPaciente = { ...(completarPacientes.get(id) ?? {}) };
        if (!ex.sexo && datos.sexo && !c.sexo) c.sexo = datos.sexo;
        if (!ex.fecha_nacimiento && datos.fecha_nacimiento && !c.fecha_nacimiento) c.fecha_nacimiento = datos.fecha_nacimiento;
        if (ex.edad == null && datos.edad != null && c.edad == null) c.edad = datos.edad;
        if (!ex.telefono && datos.telefono && !c.telefono) c.telefono = datos.telefono;
        if (!ex.numero_expediente && datos.numero_expediente && !c.numero_expediente) {
          const exp = tomarExpediente(datos.numero_expediente);
          if (exp) c.numero_expediente = exp;
        }
        if (Object.keys(c).length) completarPacientes.set(id, c);
      }
      return { ref: { id }, nuevo: false };
    }
    if (!pacientesNuevos.has(clave)) {
      pacientesNuevos.set(clave, { ...datos, numero_expediente: tomarExpediente(datos.numero_expediente) });
    }
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
    // Coincidencia exacta primero («consulta») y luego por prefijo («costo consulta» no cuenta).
    const col = (...nombres: string[]) => {
      const exacto = headers.findIndex((h) => nombres.some((n) => h === n));
      return exacto >= 0 ? exacto : headers.findIndex((h) => nombres.some((n) => h.startsWith(n)));
    };
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
      medicoIc: col('medico ic'),
      operador: col('operador'),
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
      tipo: ReturnType<typeof tipoConsultaImport>;
      /** Médico que indicó el servicio (solo si ya existe en el sistema). */
      indicadoPorId: string | null;
      cantidad: number;
      correcciones: string[];
      descartes: string[];
    }
    const validas: Pend[] = [];
    let filasVacias = 0;
    const hoyIso = new Date().toISOString().slice(0, 10);
    // Orden día/mes o mes/día por columna (Excel en inglés exporta 9/15/2026).
    const ordenFecha = detectarOrdenFechas(hoja.filas.map((f) => crudo(f.valores, idx.fecha)));
    const invertidas = ext === 'xlsx' ? fechasInvertidasPorExcel(hoja.filas.map((f) => crudo(f.valores, idx.fecha))) : 0;
    if (invertidas > 0) avisos.push(`La columna FECHA mezcla fechas escritas como texto mes/día («7/22/2026») con celdas de fecha que Excel guardó día/mes. Se leyeron ${invertidas} celdas como mes/día (01/08/2026 → 1 de agosto). Revisa las fechas antes de confirmar.`);
    const ordenFnac = detectarOrdenFechas(
      hoja.filas.map((f) => crudo(f.valores, idx.fnac)),
      idx.fnac >= 0 && /\bmes\b.*\bdia\b|mm\/dd/.test(headers[idx.fnac]) ? 'mdy' : 'dmy'
    );

    for (const fila of hoja.filas) {
      const v = fila.valores;
      // Fila con solo la fecha (separador del día): no es una cita ni un error.
      if (!get(v, idx.nombre) && hoja.encabezados.every((h, j) => !h || j === idx.fecha || String(v[j] ?? '').trim() === '')) { filasVacias++; continue; }
      const nombreV = validarNombrePaciente(get(v, idx.nombre));
      if (!nombreV.ok) { rechazar(hoja, fila, nombreV.motivo); continue; }
      const fechaTxt = crudo(v, idx.fecha);
      if (String(fechaTxt).trim() === '') { rechazar(hoja, fila, 'Falta la fecha'); continue; }
      const fecha = parseFechaImport(fechaTxt, ordenFecha, invertidas > 0);
      if (!fecha) { rechazar(hoja, fila, `Fecha no válida («${texto(fechaTxt)}»). Usa DD/MM/AAAA, AAAA-MM-DD o «1 sep 2026»`); continue; }
      const ingresoTxt = crudo(v, idx.ingreso);
      const horaInicio = parseHoraImport(ingresoTxt);
      if (String(ingresoTxt).trim() !== '' && !horaInicio) { rechazar(hoja, fila, `Hora de ingreso no válida («${texto(ingresoTxt)}»)`); continue; }
      const egresoTxt = crudo(v, idx.egreso);
      const horaFinLeida = parseHoraImport(egresoTxt);
      if (String(egresoTxt).trim() !== '' && !horaFinLeida) { rechazar(hoja, fila, `Hora de egreso no válida («${texto(egresoTxt)}»)`); continue; }
      const correcciones: string[] = [];
      const descartes: string[] = [];
      // Egreso antes del ingreso: se corrige un error de AM/PM o se descarta (antes se perdía en silencio).
      const fin = corregirHoraFin(horaInicio, horaFinLeida);
      if (fin.corregida) correcciones.push(`egreso «${texto(egresoTxt)}» → ${fin.hora!.slice(0, 5)}`);
      if (fin.descartada) descartes.push(horaInicio ? `egreso «${texto(egresoTxt)}» (termina antes de iniciar)` : 'egreso sin hora de ingreso');
      const horaFin = fin.hora;

      const doctorTexto = get(v, idx.doctor) || null;
      const doc = refDoctor(resolverDoctor(doctorTexto), doctoresNuevos);
      if (doc.motivo) { rechazar(hoja, fila, doc.motivo); continue; }

      const edadNum = parseInt(get(v, idx.edad), 10);
      const edad = Number.isFinite(edadNum) && edadNum >= 0 && edadNum <= 120 ? edadNum : null;
      const fnac = fechaNacimientoCoherente(parseFechaImport(crudo(v, idx.fnac), ordenFnac), edad, hoyIso);
      if (fnac.descartada) descartes.push(`fecha de nacimiento «${texto(crudo(v, idx.fnac))}» (no cuadra con la edad)`);
      const telefono = normalizarTelefonoImport(get(v, idx.telefono));
      if (get(v, idx.telefono) && !telefono) descartes.push(`teléfono «${get(v, idx.telefono)}»`);
      const pac = refPaciente(nombreV.clave, {
        nombre_completo: nombreV.nombre,
        telefono,
        sexo: normalizarSexo(get(v, idx.sexo)),
        fecha_nacimiento: fnac.fecha,
        edad,
      });
      // «MEDICO IC» (quien indicó el estudio): solo si ya es un doctor del sistema; nunca se crea.
      const ic = resolverDoctor(get(v, idx.medicoIc) || null);
      const operador = parseInt(get(v, idx.operador), 10);
      validas.push({
        fila, fecha, hora_inicio: horaInicio, hora_fin: horaFin, nombre: nombreV.nombre, clave: nombreV.clave,
        paciente: pac.ref, pacienteNuevo: pac.nuevo, doctor: doc.ref, doctorTexto, doctorNuevo: !!doc.nuevo, v,
        tipo: tipoConsultaImport(get(v, idx.consulta), get(v, idx.tipoVisita), !!get(v, idx.procedimiento), !!get(v, idx.est1)),
        indicadoPorId: ic && ic.tipo === 'existente' ? ic.id : null,
        cantidad: Number.isFinite(operador) && operador >= 1 && operador <= 6 ? operador : 1,
        correcciones, descartes,
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

    // Avisos de calidad de las filas que sí se importan (para revisar antes de confirmar).
    const corregidas = porInsertar.filter((p) => p.correcciones.length);
    if (corregidas.length) avisos.push(`Horas corregidas por error de AM/PM: ${corregidas.slice(0, 6).map((p) => `fila ${p.fila.numero} (${p.correcciones.join(', ')})`).join('; ')}${corregidas.length > 6 ? ` y ${corregidas.length - 6} más` : ''}.`);
    const descartadas = porInsertar.filter((p) => p.descartes.length);
    if (descartadas.length) avisos.push(`Datos descartados por no ser válidos (la cita sí se importa): ${descartadas.slice(0, 6).map((p) => `fila ${p.fila.numero} → ${p.descartes.join(', ')}`).join('; ')}${descartadas.length > 6 ? ` y ${descartadas.length - 6} más` : ''}.`);
    if (filasVacias > 0) avisos.push(`${filasVacias} fila${filasVacias === 1 ? '' : 's'} con solo la fecha y sin paciente se ignoraron.`);
    const sinHora = porInsertar.filter((p) => !p.hora_inicio);
    if (sinHora.length) avisos.push(`${sinHora.length} consulta${sinHora.length === 1 ? '' : 's'} sin hora de ingreso (${listaFilas(sinHora.map((p) => p.fila.numero))}): quedan en «Por completar».`);
    const asegDesconocidas = new Set<string>();
    const metodosDesconocidos = new Set<string>();
    for (const p of porInsertar) {
      const a = get(p.v, idx.aseguradora);
      if (a && !asegNorm.has(normalizeText(a))) asegDesconocidas.add(a);
      const m = get(p.v, idx.metodoPago);
      if (m && !SIN_METODO.has(normalizeText(m)) && !METODO_PAGO_MAP[normalizeText(m)]) metodosDesconocidos.add(m);
    }
    if (asegDesconocidas.size) avisos.push(`Aseguradoras que no existen en el sistema (esas consultas quedan sin aseguradora y en «Por completar»): ${Array.from(asegDesconocidas).join(', ')}. Créalas en Configuración o corrige el archivo.`);
    if (metodosDesconocidos.size) avisos.push(`Métodos de pago no reconocidos (se guardan sin método): ${Array.from(metodosDesconocidos).join(', ')}.`);

    const faltantesDe = (p: Pend): string[] => {
      const f: string[] = [];
      if (!p.hora_inicio) f.push('hora');
      if (!p.doctor) f.push('doctor');
      const a = get(p.v, idx.aseguradora);
      if (!a || !asegNorm.has(normalizeText(a))) f.push('aseguradora');
      return f;
    };
    const resumen = {
      total: totalFilas,
      aImportar: porInsertar.length,
      duplicadas: duplicados.length,
      conError: rechazos.length,
      doctoresNuevos: Array.from(doctoresNuevos.values()),
      pacientesNuevos: pacientesNuevos.size,
      porCompletar: porInsertar.filter((p) => faltantesDe(p).length > 0).length,
      faltantes: porInsertar.reduce<Record<string, number>>((acc, p) => {
        for (const k of faltantesDe(p)) acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
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
          detalle: etiquetaTipoImport(p.tipo),
          faltantes: faltantesDe(p),
        })),
        rechazos: listaRechazos(),
        avisos,
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
          tipo_consulta: p.tipo.tipo_consulta,
          tipo_visita: p.tipo.tipo_visita,
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
    const conceptosRows: Array<Record<string, unknown>> = [];
    const noEncontrados = new Set<string>();
    const catalogos = await cargarCatalogosServicios(supabase);
    resultados.forEach((r, i) => {
      if (!r.ok) {
        rechazar(hoja, filasConsulta[i].p.fila, mensajeSeguro(r.error, 'agenda.import', 'No se pudo guardar'));
        return;
      }
      importadas++;
      const { p, row } = filasConsulta[i];
      const cons = construirConceptos(catalogos, {
        consultaId: r.row.id as string,
        aseguranzaId: (row.aseguranza_id as string | null) ?? null,
        doctorId: row.doctor_id as string | null,
        indicadoPorId: p.indicadoPorId,
        tipo: p.tipo,
        estudios: [get(p.v, idx.est1), get(p.v, idx.est2), get(p.v, idx.est3)].filter(Boolean),
        procedimiento: get(p.v, idx.procedimiento) || null,
        cantidad: p.cantidad,
        costo: Number(row.costo_total) || 0,
      });
      conceptosRows.push(...cons.filas);
      cons.noEncontrados.forEach((n) => noEncontrados.add(n));
    });
    if (conceptosRows.length) {
      // Los conceptos (servicios) alimentan costos y honorarios; si fallan, la consulta queda y se avisa.
      const rc = await insertarEnLotes(supabase, 'consulta_conceptos', conceptosRows, 'id', ['indicado_por_id']);
      const fallidos = rc.filter((x) => !x.ok).length;
      if (fallidos) avisos.push(`${fallidos} servicio${fallidos === 1 ? '' : 's'} de las consultas no se pudo registrar; revisa esas consultas.`);
    }
    if (noEncontrados.size) avisos.push(`Servicios que no están en el catálogo (se guardaron con el texto del archivo y precio 0): ${Array.from(noEncontrados).slice(0, 8).join('; ')}${noEncontrados.size > 8 ? ` y ${noEncontrados.size - 8} más` : ''}.`);

    const pacientesCompletadosC = await aplicarCompletarPacientes(supabase, completarPacientes);
    if (pacientesCompletadosC > 0) avisos.push(`${pacientesCompletadosC} paciente${pacientesCompletadosC === 1 ? '' : 's'} ya registrado${pacientesCompletadosC === 1 ? '' : 's'} se completó${pacientesCompletadosC === 1 ? '' : 'ron'} con datos generales del archivo (solo datos vacíos).`);
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
      porCompletar: resumen.porCompletar,
      omitidasDuplicadas: duplicados.length,
      errores: rechazos.length,
      doctoresCreados: docs.ids.size,
      pacientesCreados: pacs.ids.size,
      rechazos: listaRechazos(),
      avisos,
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
    ojoDia: string;
    data: Record<string, unknown>;
    /** Lectura estricta de la celda LIO (+ MARCA y NOTAS). */
    interp: InterpretacionLio;
    plan: LentePlanImport[];
    sinGuardar: string[];
    faltantes: string[];
  }
  const validasCx: PendCx[] = [];
  const val = (o: Record<string, string | number>, ...claves: string[]) => {
    for (const k of claves) { const t = texto(o[k]); if (t) return t; }
    return '';
  };
  const todasFilas = hojas.flatMap((h) => h.filas);
  const ordenFechaCx = detectarOrdenFechas(todasFilas.map((f) => f.obj['FECHA']));
  const invertidasCx = ext === 'xlsx' ? fechasInvertidasPorExcel(todasFilas.map((f) => f.obj['FECHA'])) : 0;
  if (invertidasCx > 0) avisos.push(`La columna FECHA mezcla fechas escritas como texto mes/día («7/22/2026») con celdas de fecha que Excel guardó día/mes. Se leyeron ${invertidasCx} celdas como mes/día (01/08/2026 → 1 de agosto). Revisa las fechas antes de confirmar.`);
  const ordenFnacCx = detectarOrdenFechas(todasFilas.map((f) => f.obj['FECHA NAC.']));
  const hoyIsoCx = new Date().toISOString().slice(0, 10);
  const CAMPO_SUSPENDIDA = /SUSPENDID[OA]|CANCELAD[OA]/i;

  // Pacientes con cirugía ya agendada en la hoja CIRUGIA: sus filas de CONSULTADOS no son «por programar».
  const agendadosEnArchivo = new Set<string>();
  for (const h of hojas) {
    if (h.nombre !== 'CIRUGIA') continue;
    for (const f of h.filas) {
      const n = validarNombrePaciente(val(f.obj, 'NOMBRE PX'));
      if (!n.ok || CAMPO_SUSPENDIDA.test(val(f.obj, 'NOTAS')) || !val(f.obj, 'FECHA')) continue;
      agendadosEnArchivo.add(`${n.clave}|${normalizeOjo(val(f.obj, 'OJO')) || ''}`);
      agendadosEnArchivo.add(`${n.clave}|*`);
    }
  }
  const sinProcedimientoConsultados: number[] = [];
  let filasVaciasCx = 0;
  const notasArchivo: string[] = [];
  const fechasNacDescartadas: number[] = [];

  /** Una cirugía/aplazada lista para validar (una por ojo en CONSULTADOS). */
  interface EntradaCx {
    hoja: Hoja;
    fila: Hoja['filas'][number];
    o: Record<string, string | number>;
    esAplazada: boolean;
    esConsultados: boolean;
    ojoTxt: string;
    ojo2Txt: string;
    lioTxt: string;
    marcaTxt: string;
  }
  const entradas: EntradaCx[] = [];
  for (const hoja of hojas) {
    const esAplazados = hoja.nombre === 'APLAZADOS';
    const esConsultados = hoja.nombre === 'CONSULTADOS';
    for (const fila of hoja.filas) {
      const o = fila.obj;
      // Filas sin paciente: solo la fecha (horario libre) o solo un texto suelto (nota del archivo) no son errores.
      const otrosDatos = hoja.encabezados.some((h, j) => h && !['FECHA', 'FECHA CONSULTA', 'NOMBRE PX'].includes(h.toUpperCase()) && String(fila.valores[j] ?? '').trim() !== '');
      if (!otrosDatos) {
        const nombreSuelto = val(o, 'NOMBRE PX');
        if (!nombreSuelto) { filasVaciasCx++; continue; }
        if (!validarNombrePaciente(nombreSuelto).ok) { notasArchivo.push(`${hoja.nombre} fila ${fila.numero}: «${nombreSuelto}»`); continue; }
      }
      if (esConsultados) {
        // Una entrada por ojo: «1ER OJO» + LIO y «2DO OJO» + LIO_2 (cada uno es una cirugía por programar).
        const ojos = [
          { ojo: val(o, '1ER OJO'), lio: val(o, 'LIO') },
          { ojo: val(o, '2DO OJO'), lio: val(o, 'LIO_2') },
        ].filter((x) => x.ojo || x.lio);
        for (const x of ojos.length ? ojos : [{ ojo: '', lio: '' }]) {
          entradas.push({ hoja, fila, o, esAplazada: true, esConsultados: true, ojoTxt: x.ojo, ojo2Txt: '', lioTxt: x.lio, marcaTxt: '' });
        }
      } else {
        entradas.push({
          hoja, fila, o, esAplazada: esAplazados, esConsultados: false,
          ojoTxt: val(o, 'OJO'), ojo2Txt: val(o, 'OJO_2'),
          lioTxt: val(o, 'LIO', 'LIO_2'),
          marcaTxt: esAplazados ? '' : val(o, 'MARCA', 'MARCA_2'),
        });
      }
    }
  }

  let filasPorCompletar = 0;
  const horaAnestesiaSobrante: number[] = [];
  for (const { hoja, fila, o, esAplazada: esAplazados, esConsultados, ojoTxt, ojo2Txt, lioTxt, marcaTxt } of entradas) {
      const nombreV = validarNombrePaciente(val(o, 'NOMBRE PX'));
      if (esConsultados && !val(o, 'PROCEDIMIENTO')) {
        // Paciente consultado sin procedimiento definido (estudios pendientes): aún no hay cirugía que programar.
        if (nombreV.ok && !sinProcedimientoConsultados.includes(fila.numero)) sinProcedimientoConsultados.push(fila.numero);
        continue;
      }
      if (!nombreV.ok) { rechazar(hoja, fila, nombreV.motivo); continue; }

      let fecha: string | null = null;
      let hora: string | null = null;
      let horaPendiente: string | null = null;
      if (!esAplazados) {
        const fechaTxt = o['FECHA'] ?? '';
        fecha = parseFechaImport(fechaTxt, ordenFechaCx, invertidasCx > 0);
        if (String(fechaTxt).trim() !== '' && !fecha) {
          rechazar(hoja, fila, `Fecha no válida («${texto(fechaTxt)}»). Usa DD/MM/AAAA, AAAA-MM-DD o «1 sep 2026»; déjala vacía para aplazada`);
          continue;
        }
        const horaTxt = o['HORA CX'] ?? '';
        hora = parseHoraImport(horaTxt);
        // Error menor: la fila entra sin hora y queda marcada para completar.
        if (String(horaTxt).trim() !== '' && !hora) horaPendiente = texto(horaTxt);
      }

      const ojo = normalizeOjo(ojoTxt) || normalizeOjo(ojo2Txt);
      // Celda de ojo con espacios o signos sueltos (« ») = vacía; un texto real no reconocido sí se rechaza.
      if ((/\p{L}/u.test(ojoTxt) && !normalizeOjo(ojoTxt)) || (/\p{L}/u.test(ojo2Txt) && !normalizeOjo(ojo2Txt))) {
        rechazar(hoja, fila, `Ojo no válido («${ojoTxt || ojo2Txt}»). Usa OD, OI/OS u OU`);
        continue;
      }

      const doctorTexto = esAplazados ? null : val(o, 'CIRUJANO') || null;
      const doc = refDoctor(resolverDoctor(doctorTexto), doctoresNuevos);
      if (doc.motivo) { rechazar(hoja, fila, doc.motivo); continue; }

      const edadNum = parseInt(val(o, 'EDAD'), 10);
      const edad = Number.isFinite(edadNum) && edadNum >= 0 && edadNum <= 120 ? edadNum : null;
      const fnac = fechaNacimientoCoherente(parseFechaImport(o['FECHA NAC.'] ?? '', ordenFnacCx), edad, hoyIsoCx);
      if (fnac.descartada && !fechasNacDescartadas.includes(fila.numero)) fechasNacDescartadas.push(fila.numero);
      const pac = refPaciente(nombreV.clave, {
        nombre_completo: nombreV.nombre,
        telefono: normalizarTelefonoImport(val(o, 'TELEFONO', 'TELÉFONO')),
        sexo: normalizarSexo(val(o, 'SEXO')),
        fecha_nacimiento: fnac.fecha,
        edad,
        numero_expediente: val(o, 'No. Expediente', 'NO. EXPEDIENTE', 'NO. EXP', 'No. Exp') || null,
      });

      const procedimiento = val(o, 'PROCEDIMIENTO', 'CIRUGÍA', 'CIRUGIA') || null;
      const notasBase = val(o, 'NOTAS') || null;
      const suspendida = !esAplazados && !!notasBase && CAMPO_SUSPENDIDA.test(notasBase);
      const ojo2 = normalizeOjo(ojo2Txt);
      const notasExtra: string[] = [];
      if (!suspendida && notasBase) notasExtra.push(notasBase);
      if (!suspendida && ojo2 && ojo && ojo2 !== ojo) notasExtra.push(`(2º ojo: ${ojo2})`);
      if (horaPendiente && !suspendida) {
        notasExtra.push(`Por completar: hora no válida («${horaPendiente}»)`);
        filasPorCompletar += 1;
      }

      // Anestesia: solo valores reales; lo demás (nombres de proveedores, etc.) va a notas.
      const anest = esAplazados ? { valor: null, sobrante: null } : anestesiaImport(val(o, 'ANESTESIA'));
      if (anest.sobrante && !suspendida) { notasExtra.push(`Anestesia (archivo): ${anest.sobrante}`); horaAnestesiaSobrante.push(fila.numero); }

      // LIO: lectura estricta. Un texto que no es lente (horarios) no se guarda como LIO.
      const interp = interpretarLio(lioTxt, marcaTxt, notasBase);
      if (interp.textoNoLente) notasExtra.push(`Nota en columna LIO: ${interp.textoNoLente}`);
      const marcaRuido = !marcaTxt || /^(x+|n\/?a|-+)$/i.test(marcaTxt);
      const marcaEsMarca = !marcaRuido && !/\d|PAGO|COMPRA|CITAR|TORIC/i.test(marcaTxt);
      if (!marcaRuido && !marcaEsMarca && !suspendida) notasExtra.push(`Marca/nota: ${marcaTxt}`);
      const notas = notasExtra.length ? notasExtra.join(' · ') : null;

      const estado = esAplazados ? 'aplazada' : suspendida ? 'cancelada' : fecha ? 'agendada' : 'aplazada';
      const ojoClave = ojo || '';
      const dedupe = fecha
        ? `F|${nombreV.clave}|${fecha}|${ojoClave}|${claveTexto(procedimiento || '')}`
        : `A|${nombreV.clave}|${ojoClave}|${claveTexto(procedimiento || '')}`;
      const ojoDia = fecha ? `O|${nombreV.clave}|${fecha}|${ojoClave}` : '';

      if (esConsultados && (agendadosEnArchivo.has(`${nombreV.clave}|${ojoClave}`) || (!ojoClave && agendadosEnArchivo.has(`${nombreV.clave}|*`)))) {
        omitirDuplicado(hoja, fila, 'Ya tiene cirugía agendada en la hoja CIRUGIA: no se importa como pendiente de programar');
        continue;
      }

      const fechaConsulta = esConsultados ? parseFechaImport(o['FECHA CONSULTA'] ?? '', 'dmy') : null;
      const estatusConsulta = esConsultados ? val(o, 'ESTATUS') : '';
      const motivoAplazamiento = esConsultados
        ? ['Pendiente de programar', fechaConsulta ? `consultado el ${fechaConsulta.split('-').reverse().join('/')}` : '', estatusConsulta ? `estatus: ${estatusConsulta}` : ''].filter(Boolean).join(' · ')
        : val(o, 'MOTIVO') || null;

      validasCx.push({
        hoja, fila, clave: nombreV.clave, nombre: nombreV.nombre,
        paciente: pac.ref, pacienteNuevo: pac.nuevo, doctor: doc.ref, doctorTexto, doctorNuevo: !!doc.nuevo, dedupe, ojoDia,
        interp, plan: [], sinGuardar: [], faltantes: [],
        data: {
          nombre_paciente: nombreV.nombre,
          expediente: val(o, 'No. Expediente', 'NO. EXPEDIENTE', 'NO. EXP', 'No. Exp') || null,
          fecha,
          hora,
          jornada: esAplazados ? null : val(o, 'JORNADA') || null,
          diagnostico: val(o, 'DIAGNOSTICO') || null,
          procedimiento,
          ojo,
          lio: interp.textoNoLente ? null : lioTxt || null,
          marca_lio: esAplazados || !marcaEsMarca ? null : marcaTxt,
          tiempo_estimado: esAplazados ? null : val(o, 'TIEMPO ESTIMADO CX', 'TIEMPO CX') || null,
          tiempo_estancia: esAplazados ? null : val(o, 'TIEMPO DE ESTANCIA', 'TIEMPO ESTANCIA') || null,
          anestesia: anest.valor,
          estado,
          notas,
          // PROCEDENCIA se guarda siempre (antes solo en aplazadas: las agendadas quedaban sin ella).
          procedencia: val(o, 'PROCEDENCIA') || null,
          ...(estado === 'aplazada' ? { motivo_aplazamiento: motivoAplazamiento } : {}),
        },
      });
  }

  if (filasVaciasCx > 0) avisos.push(`${filasVaciasCx} fila${filasVaciasCx === 1 ? '' : 's'} con solo la fecha (horarios sin paciente) se ignoraron.`);
  if (notasArchivo.length > 0) avisos.push(`Notas sueltas del archivo (no son pacientes, no se importan): ${notasArchivo.slice(0, 5).join('; ')}${notasArchivo.length > 5 ? ` y ${notasArchivo.length - 5} más` : ''}.`);
  if (sinProcedimientoConsultados.length > 0) avisos.push(`CONSULTADOS: ${sinProcedimientoConsultados.length} paciente${sinProcedimientoConsultados.length === 1 ? '' : 's'} sin procedimiento definido (estudios pendientes, interconsulta…) no se importaron como pendientes de programar (${listaFilas(sinProcedimientoConsultados)}).`);
  if (fechasNacDescartadas.length > 0) avisos.push(`Fechas de nacimiento descartadas por ser futuras o no cuadrar con la edad (${listaFilas(fechasNacDescartadas)}). El paciente se importa con la edad.`);
  if (horaAnestesiaSobrante.length > 0) avisos.push(`ANESTESIA trae texto que no es un tipo de anestesia (${listaFilas(horaAnestesiaSobrante)}): se guardó en notas y la anestesia queda por completar.`);
  if (filasPorCompletar > 0) avisos.push(`${filasPorCompletar} fila${filasPorCompletar === 1 ? '' : 's'} se importaron sin hora porque la hora no es válida. Quedaron marcadas «Por completar» en notas; corrige la hora en la agenda.`);

  // Duplicados: cirugías de las fechas del archivo + aplazadas sin fecha.
  const fechasArchivo = Array.from(new Set(validasCx.map((f) => f.data.fecha as string | null).filter((f): f is string => !!f)));
  const haySinFecha = validasCx.some((f) => !f.data.fecha);
  type Existente = {
    id: string; nombre_paciente: string | null; fecha: string | null; hora: string | null; procedimiento: string | null; ojo: string | null; anestesia: string | null;
    diagnostico?: string | null; procedencia?: string | null; expediente?: string | null; tiempo_estimado?: string | null; tiempo_estancia?: string | null;
    lio?: string | null; marca_lio?: string | null; doctor_id?: string | null; estado?: string | null;
  };
  // Columnas que «Completar cirugías ya guardadas» llena si están vacías.
  const CAMPOS_COMPLETABLES = ['hora', 'anestesia', 'diagnostico', 'procedencia', 'expediente', 'tiempo_estimado', 'tiempo_estancia', 'lio', 'marca_lio'] as const;
  const COLS_EXISTENTE = `id, nombre_paciente, fecha, hora, procedimiento, ojo, anestesia, estado${completarExistentes ? ', diagnostico, procedencia, expediente, tiempo_estimado, tiempo_estancia, lio, marca_lio, doctor_id' : ''}`;
  let existentesCx: Existente[];
  try {
    const [porFecha, sinFecha] = await Promise.all([
      Promise.all(
        trozos(fechasArchivo, 60).map((grupo) =>
          leerPaginado<Existente>((d, h) =>
            supabase
              .from('agenda_cirugias')
              .select(COLS_EXISTENTE)
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
              .select(COLS_EXISTENTE)
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
  const claveExistente = (e: Existente) =>
    e.fecha
      ? `F|${claveTexto(e.nombre_paciente || '')}|${e.fecha}|${e.ojo || ''}|${claveTexto(e.procedimiento || '')}`
      : `A|${claveTexto(e.nombre_paciente || '')}|${claveTexto(e.procedimiento || '')}`;
  const enBdCx = new Set(existentesCx.map(claveExistente));
  const existentePorClave = new Map<string, Existente>();
  for (const e of existentesCx) if (!existentePorClave.has(claveExistente(e))) existentePorClave.set(claveExistente(e), e);
  const actualizarCx: Array<{ id: string; cambios: Record<string, unknown>; fila: Hoja['filas'][number]; hoja: Hoja; p: PendCx; lentes: boolean }> = [];
  // Mismo paciente, fecha y ojo (cualquier procedimiento): posible reagenda o reintervención.
  const enBdOjoDia = new Set(
    existentesCx.filter((e) => e.fecha).map((e) => `O|${claveTexto(e.nombre_paciente || '')}|${e.fecha}|${e.ojo || ''}`)
  );
  const enArchivoOjoDia = new Set<string>();
  const enArchivoCx = new Map<string, string>();
  const porInsertarCx: PendCx[] = [];
  // C1: conflicto con lo ya guardado (mismo paciente + fecha + ojo) → la clínica decide por fila.
  const pendientesDecision: Array<{ p: PendCx; existenteId: string | null; tipo: 'MISMO_PROCEDIMIENTO' | 'OTRO_PROCEDIMIENTO' }> = [];
  const reagendaDe = new Map<PendCx, string>(); // fila nueva → cirugía anterior que pasa a REAGENDADA
  const existenteOjoDia = new Map<string, string>();
  for (const e of existentesCx) {
    if (!e.fecha) continue;
    const k = `O|${claveTexto(e.nombre_paciente || '')}|${e.fecha}|${e.ojo || ''}`;
    if (!existenteOjoDia.has(k)) existenteOjoDia.set(k, e.id);
  }
  for (const p of validasCx) {
    if (completarExistentes && enBdCx.has(p.dedupe)) {
      // Re-subir el mismo Excel completa lo que faltó en la primera carga (solo campos vacíos;
      // nunca se sobrescribe lo capturado). Documento «Agenda de cirugía», 16 oct 2026.
      const ex = existentePorClave.get(p.dedupe);
      const cambios: Record<string, unknown> = {};
      if (ex) {
        const exR = ex as Record<string, unknown>;
        for (const campo of CAMPOS_COMPLETABLES) {
          const nuevo = p.data[campo];
          const actual = exR[campo];
          const vacio = actual === null || actual === undefined || String(actual).trim() === '' || (campo === 'hora' && String(actual).slice(0, 5) === '00:00');
          if (vacio && nuevo !== null && nuevo !== undefined && String(nuevo).trim() !== '') cambios[campo] = nuevo;
        }
        // Cirujano: solo si ya existe en el sistema (no se crean doctores al completar).
        if (!ex.doctor_id && p.doctor && 'id' in p.doctor) cambios.doctor_id = p.doctor.id;
      }
      // Lentes: se revisan al confirmar (solo si la cirugía no tiene ninguno guardado).
      const conLente = !!ex && ex.estado !== 'cancelada' && p.interp.lentes.length > 0;
      if (ex && (Object.keys(cambios).length > 0 || conLente)) {
        actualizarCx.push({ id: ex.id, cambios, fila: p.fila, hoja: p.hoja, p, lentes: conLente });
      } else {
        omitirDuplicado(p.hoja, p.fila, 'Ya existe en el sistema y no hay datos nuevos que completar');
      }
      continue;
    }
    const previa = enArchivoCx.get(p.dedupe);
    if (previa && !incluirDuplicados) { omitirDuplicado(p.hoja, p.fila, `Duplicada dentro del archivo (igual a ${previa})`); continue; }

    const idMismo = existentePorClave.get(p.dedupe)?.id ?? null;
    const idOjoDia = p.data.fecha ? (existenteOjoDia.get(p.ojoDia) ?? null) : null;
    const enBd = enBdCx.has(p.dedupe) || (!!p.data.fecha && enBdOjoDia.has(p.ojoDia));
    const decision = decisiones[String(p.fila.numero)];
    if (enBd && !incluirDuplicados) {
      if (!decision) {
        pendientesDecision.push({ p, existenteId: idMismo ?? idOjoDia, tipo: idMismo ? 'MISMO_PROCEDIMIENTO' : 'OTRO_PROCEDIMIENTO' });
        if (!confirmar) continue;
        omitirDuplicado(p.hoja, p.fila, 'Pendiente de decisión: no se importó (elige reagenda, reintervención, agregar u omitir en la vista previa)');
        continue;
      }
      if (decision === 'OMITIR') { omitirDuplicado(p.hoja, p.fila, 'Omitida por decisión de la clínica'); continue; }
      if (decision === 'REAGENDA' && (idMismo ?? idOjoDia)) {
        reagendaDe.set(p, (idMismo ?? idOjoDia) as string);
        (p.data as Record<string, unknown>).tipo_caso = 'REAGENDA';
      } else if (decision === 'REINTERVENCION') {
        (p.data as Record<string, unknown>).tipo_caso = 'REINTERVENCION';
      }
      // AGREGAR (o REAGENDA sin cirugía previa): se importa tal cual.
    } else if (enBd) {
      avisos.push(`Fila ${p.fila.numero}: importada como duplicado a petición de la clínica (mismo paciente, fecha, ojo y procedimiento).`);
    }
    if (!decision && p.data.fecha && enArchivoOjoDia.has(p.ojoDia)) {
      (p.data as Record<string, unknown>).tipo_caso = 'REINTERVENCION';
      avisos.push(`Fila ${p.fila.numero}: ya hay otra cirugía del mismo ojo ese día con distinto procedimiento en el archivo; se importó como reintervención.`);
    }
    enArchivoOjoDia.add(p.ojoDia);
    enArchivoCx.set(p.dedupe, hojas.length > 1 ? `${p.hoja.nombre} fila ${p.fila.numero}` : `la fila ${p.fila.numero}`);
    porInsertarCx.push(p);
  }
  const usadosPac = new Set(porInsertarCx.flatMap((p) => (p.paciente && 'nuevo' in p.paciente ? [p.paciente.nuevo] : [])));
  const usadosDoc = new Set(porInsertarCx.flatMap((p) => (p.doctor && 'nuevo' in p.doctor ? [p.doctor.nuevo] : [])));
  pacientesNuevos.forEach((_, k) => { if (!usadosPac.has(k)) pacientesNuevos.delete(k); });
  doctoresNuevos.forEach((_, k) => { if (!usadosDoc.has(k)) doctoresNuevos.delete(k); });

  // Lentes: stock libre → ASIGNAR, sin stock → SOLICITAR, «pago lente» → COMPRA_DIRECTA.
  const inventario = await cargarInventarioLentes(supabase);
  if (!inventario.ok) avisos.push('No se pudo leer el inventario de lentes: todos los lentes se enviarán a «Solicitar». Revisa el inventario y asigna las piezas que sí existan.');
  for (const p of porInsertarCx) {
    const estadoFila = p.data.estado as string;
    if (estadoFila === 'cancelada') continue;
    const r = planificarLentes(p.interp, inventario.piezas, inventario.libres, estadoFila === 'agendada');
    p.plan = r.plan;
    p.sinGuardar = r.sinGuardar;
    const f: string[] = [];
    if (estadoFila === 'agendada') {
      if (!p.data.hora) f.push('hora');
      if (!p.data.anestesia) f.push('anestesia');
    }
    if (!p.data.ojo) f.push('ojo');
    if (!p.data.procedimiento) f.push('procedimiento');
    if ((requiereLente(p.data.procedimiento as string | null) && p.plan.length === 0) || p.sinGuardar.length > 0 || p.interp.pendientes.length > 0) f.push('lente');
    p.faltantes = f;
  }
  // Cirugías existentes a completar: plan de lentes con la misma regla (se guarda solo si no tienen).
  for (const u of actualizarCx) {
    if (!u.lentes) continue;
    const r = planificarLentes(u.p.interp, inventario.piezas, inventario.libres, true);
    u.p.plan = r.plan;
    if (r.plan.length === 0) u.lentes = false;
  }
  const ABREV_ORDEN = { PRIMERO: '1º', SEGUNDO: '2º', RESPALDO: 'Resp.' } as const;
  const textoLentes = (p: PendCx) =>
    [
      ...p.plan.map((l) => `${ABREV_ORDEN[l.orden]} ${[l.fabricante, l.modelo && !l.fabricante?.includes(l.modelo) ? l.modelo : '', l.poder_d ?? '?'].filter(Boolean).join(' ')}${l.torico ? ' tórico' : ''} → ${etiquetaModoLente(l.modo)}`),
      ...p.sinGuardar.map((x) => `sin guardar: ${x}`),
      ...p.interp.pendientes.filter((x) => !p.sinGuardar.length || !/falta/.test(x)).map((x) => `pendiente: ${x}`),
    ].join(' · ');
  const conteoModo = (m: LentePlanImport['modo']) => porInsertarCx.reduce((n, p) => n + p.plan.filter((l) => l.modo === m).length, 0);
  const conteoFalta = (k: string) => porInsertarCx.filter((p) => p.faltantes.includes(k)).length;
  const sinHoraCx = conteoFalta('hora');
  if (sinHoraCx > 0) avisos.push(`${sinHoraCx} cirugía${sinHoraCx === 1 ? '' : 's'} agendada${sinHoraCx === 1 ? '' : 's'} sin hora (${listaFilas(porInsertarCx.filter((p) => p.faltantes.includes('hora')).map((p) => p.fila.numero))}): quedan en «Por completar».`);

  const resumenCx = {
    total: totalFilas,
    aImportar: porInsertarCx.length,
    aplazadas: porInsertarCx.filter((p) => p.data.estado === 'aplazada').length,
    duplicadas: duplicados.length,
    completables: actualizarCx.length,
    pendientesDecision: pendientesDecision.length,
    conError: rechazos.length,
    doctoresNuevos: Array.from(doctoresNuevos.values()),
    pacientesNuevos: pacientesNuevos.size,
    porCompletar: porInsertarCx.filter((p) => p.faltantes.length > 0).length,
    faltantes: { hora: sinHoraCx, ojo: conteoFalta('ojo'), anestesia: conteoFalta('anestesia'), lente: conteoFalta('lente'), procedimiento: conteoFalta('procedimiento') },
    lentes: { asignar: conteoModo('ASIGNAR'), solicitar: conteoModo('SOLICITAR'), compraDirecta: conteoModo('COMPRA_DIRECTA') },
  };

  if (!confirmar) {
    if (completarPacientes.size > 0) avisos.push(`${completarPacientes.size} paciente${completarPacientes.size === 1 ? '' : 's'} ya registrado${completarPacientes.size === 1 ? '' : 's'} tiene${completarPacientes.size === 1 ? '' : 'n'} datos generales vacíos que el archivo trae: se completarán al confirmar (no se sobrescribe nada).`);
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
        detalle: [p.data.ojo, p.data.procedimiento].filter(Boolean).join(' · ') || undefined,
        faltantes: p.faltantes,
        lentes: textoLentes(p) || undefined,
      })),
      pendientesDecision: pendientesDecision.map((x) => ({
        fila: x.p.fila.numero,
        paciente: x.p.nombre,
        fecha: (x.p.data.fecha as string | null) ?? null,
        hora: (x.p.data.hora as string | null) ?? null,
        ojo: (x.p.data.ojo as string | null) ?? null,
        procedimiento: (x.p.data.procedimiento as string | null) ?? null,
        tipo: x.tipo,
      })),
      rechazos: listaRechazos(),
      avisos,
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
    const anterior = reagendaDe.get(p);
    filasCx.push({ p, row: { ...p.data, paciente_id: pacienteId, doctor_id: doctorId, ...(anterior ? { reagenda_de_id: anterior } : {}) } });
  }

  let importadas = 0;
  let aplazadasImportadas = 0;
  let completadas = 0;
  const reagendadas: string[] = [];
  const resultados = await insertarEnLotes(supabase, 'agenda_cirugias', filasCx.map((x) => x.row), 'id, doctor_id');
  const doctorRows: Array<Record<string, unknown>> = [];
  resultados.forEach((r, i) => {
    const { p } = filasCx[i];
    if (r.ok) {
      const anterior = reagendaDe.get(p);
      if (anterior) reagendadas.push(anterior);
      if (p.data.estado === 'aplazada') aplazadasImportadas++;
      else importadas++;
      if (r.row.doctor_id) {
        doctorRows.push({ cirugia_id: r.row.id, doctor_id: r.row.doctor_id, rol: 'CIRUJANO_PRINCIPAL', porcentaje_participacion: 100 });
      }
    } else {
      rechazar(p.hoja, p.fila, mensajeSeguro(r.error, 'agenda.import', 'No se pudo guardar'));
    }
  });
  // C1: la cirugía anterior de una reagenda pasa a REAGENDADA y libera sus lentes.
  for (const anterior of reagendadas) {
    await liberarLentes(anterior);
    await supabase.from('agenda_cirugias').update({ estado: 'REAGENDADA' }).eq('id', anterior);
  }
  // Cirugías ya guardadas: se completan solo los campos vacíos y, si no tienen lentes, el plan.
  const conLentesGuardados = new Set<string>();
  const idsConLente = actualizarCx.filter((u) => u.lentes).map((u) => u.id);
  for (const grupo of trozos(idsConLente, 200)) {
    const { data: ya } = await supabase.from('cirugia_lentes').select('cirugia_id').in('cirugia_id', grupo).neq('estado', 'LIBERADO');
    (ya || []).forEach((x: { cirugia_id: string }) => conLentesGuardados.add(x.cirugia_id));
  }
  let lentesCompletados = 0;
  for (const u of actualizarCx) {
    let tocada = false;
    if (Object.keys(u.cambios).length > 0) {
      const { error: errUpd } = await supabase.from('agenda_cirugias').update({ ...u.cambios, updated_at: new Date().toISOString() } as never).eq('id', u.id);
      if (errUpd) { rechazar(u.hoja, u.fila, mensajeSeguro(errUpd, 'agenda.import', 'No se pudo completar la cirugía existente')); continue; }
      tocada = true;
    }
    if (u.lentes && !conLentesGuardados.has(u.id)) {
      const r = await guardarPlanLentes(u.id, u.p.plan, { reservarPrimero: true });
      if (r.ok) {
        lentesCompletados++;
        tocada = true;
        const primero = u.p.plan.find((l) => l.orden === 'PRIMERO' && l.modo === 'ASIGNAR' && l.inventario_item_id);
        if (primero) await supabase.from('agenda_cirugias').update({ inventario_item_id: primero.inventario_item_id }).eq('id', u.id);
      } else {
        avisos.push(`Fila ${u.fila.numero}: no se pudo guardar el lente de la cirugía existente (${r.error}). Captúralo en la cirugía.`);
      }
    }
    if (tocada) completadas++;
    else omitirDuplicado(u.hoja, u.fila, 'Ya existe en el sistema y no hay datos nuevos que completar');
  }
  if (completadas > 0) avisos.push(`${completadas} cirugía${completadas === 1 ? '' : 's'} ya existente${completadas === 1 ? '' : 's'} se completó${completadas === 1 ? '' : 'ron'} con los datos del archivo (solo campos vacíos${lentesCompletados ? `; ${lentesCompletados} con su lente` : ''}).`);
  const pacientesCompletados = await aplicarCompletarPacientes(supabase, completarPacientes);
  if (pacientesCompletados > 0) avisos.push(`${pacientesCompletados} paciente${pacientesCompletados === 1 ? '' : 's'} ya registrado${pacientesCompletados === 1 ? '' : 's'} se completó${pacientesCompletados === 1 ? '' : 'ron'} con sexo, fecha de nacimiento, teléfono o expediente del archivo (solo datos vacíos).`);
  // Lentes de cada cirugía (mismo plan que se mostró en la vista previa): asignar / solicitar / compra directa.
  let lentesAsignados = 0;
  let lentesPorSolicitar = 0;
  let lentesCompraDirecta = 0;
  const avisosLentes: string[] = [];
  const idsInsertadas = resultados.map((r, i) => (r.ok ? { id: (r.row as { id: string }).id, p: filasCx[i].p } : null)).filter((x): x is { id: string; p: PendCx } => !!x && x.p.plan.length > 0);
  await mapConLimite(idsInsertadas, 6, async ({ id, p }) => {
    let plan = p.plan;
    let r = await guardarPlanLentes(id, plan, { reservarPrimero: true });
    if (!r.ok) {
      // La pieza ya no está libre (otro usuario la reservó): ese lente pasa a «Solicitar».
      const fallido = r.orden;
      plan = plan.map((l) => (l.orden === fallido && l.modo === 'ASIGNAR' ? { ...l, modo: 'SOLICITAR' as const, inventario_item_id: null } : l));
      await liberarLentes(id);
      r = await guardarPlanLentes(id, plan, { reservarPrimero: true });
      if (r.ok) avisosLentes.push(`Fila ${p.fila.numero}: el ${fallido.toLowerCase()} ya no tenía pieza libre; quedó por solicitar.`);
    }
    if (!r.ok) {
      avisosLentes.push(`Fila ${p.fila.numero}: no se pudo guardar el plan de lentes (${r.error}). Captúralo en la cirugía.`);
      return;
    }
    for (const l of plan) {
      if (l.modo === 'ASIGNAR') lentesAsignados++;
      else if (l.modo === 'SOLICITAR') lentesPorSolicitar++;
      else lentesCompraDirecta++;
    }
    const primero = plan.find((l) => l.orden === 'PRIMERO' && l.modo === 'ASIGNAR' && l.inventario_item_id);
    if (primero) await supabase.from('agenda_cirugias').update({ inventario_item_id: primero.inventario_item_id }).eq('id', id);
  });
  avisos.push(...avisosLentes);
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
    completadas,
    lentes: { asignados: lentesAsignados, porSolicitar: lentesPorSolicitar, compraDirecta: lentesCompraDirecta },
    porCompletar: porInsertarCx.filter((p) => p.faltantes.length > 0).length,
    omitidasDuplicadas: duplicados.length,
    errores: rechazos.length,
    doctoresCreados: docs.ids.size,
    pacientesCreados: pacs.ids.size,
    rechazos: listaRechazos(),
    avisos,
    rechazosCsv: csvRechazos(),
    duplicadosCsv: csvDuplicados(),
  });
}

export const POST = ruta('agenda/import#POST', manejarPOST);

type FilaItemInv = {
  id: string;
  marca?: string | null;
  modelo?: string | null;
  potencia_dioptrias?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  sphere?: number | null;
  stock: number | null;
  estado?: string | null;
  fecha_caducidad?: string | null;
  expiration_date?: string | null;
};

/**
 * Piezas de LIO del inventario y cuántas están libres (stock menos reservas activas de cirugías).
 * Tolera esquema legado (marca/potencia_dioptrias) y nuevo (manufacturer/sphere).
 */
async function cargarInventarioLentes(supabase: Admin): Promise<{ piezas: PiezaInventario[]; libres: Map<string, number>; ok: boolean }> {
  const hoy = new Date().toISOString().slice(0, 10);
  const leer = (columnas: string, filtro: string) =>
    leerPaginado<FilaItemInv>((d, h) =>
      supabase.from('inventario_items').select(columnas).not(filtro, 'is', null).order('id', { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: FilaItemInv[] | null; error: unknown }>
    );
  let items: FilaItemInv[] | null = null;
  try { items = await leer('id, marca, modelo, potencia_dioptrias, stock, estado, fecha_caducidad', 'potencia_dioptrias'); } catch { /* esquema nuevo */ }
  if (!items) {
    try { items = await leer('id, manufacturer, model, sphere, stock, estado, expiration_date', 'sphere'); } catch { items = null; }
  }
  if (!items) return { piezas: [], libres: new Map(), ok: false };

  const reservadas = new Map<string, number>();
  try {
    const filas = await leerPaginado<{ inventario_item_id: string | null }>((d, h) =>
      supabase.from('cirugia_lentes').select('inventario_item_id').eq('estado', 'RESERVADO').not('inventario_item_id', 'is', null).order('id', { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: { inventario_item_id: string | null }[] | null; error: unknown }>
    );
    for (const f of filas) if (f.inventario_item_id) reservadas.set(f.inventario_item_id, (reservadas.get(f.inventario_item_id) ?? 0) + 1);
  } catch { /* sin tabla de reservas: se usa el stock completo */ }

  const piezas: PiezaInventario[] = [];
  const libres = new Map<string, number>();
  for (const it of items) {
    const caduca = it.fecha_caducidad ?? it.expiration_date ?? null;
    const utilizable = (!it.estado || it.estado === 'DISPONIBLE') && (!caduca || String(caduca).slice(0, 10) > hoy);
    const stock = Number(it.stock) || 0;
    piezas.push({
      id: it.id,
      marca: it.marca ?? it.manufacturer ?? null,
      modelo: it.modelo ?? it.model ?? null,
      potencia: it.potencia_dioptrias ?? it.sphere ?? null,
      stock: utilizable ? stock : 0,
    });
    libres.set(it.id, utilizable ? Math.max(0, stock - (reservadas.get(it.id) ?? 0)) : 0);
  }
  return { piezas, libres, ok: true };
}
