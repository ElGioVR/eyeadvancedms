/**
 * Normalización, validación y resolución de doctores/pacientes para la
 * importación masiva de consultas y cirugías (sin duplicados).
 *
 * Reglas:
 * - El alias del doctor no distingue mayúsculas, acentos ni espacios: «Luis»,
 *   «LUIS» y «luis » son el mismo doctor. Los doctores nuevos se guardan con el
 *   alias en MAYÚSCULAS.
 * - Los títulos (DR, DRA, DOCTOR…) no cuentan para comparar: «IRINA» encuentra a
 *   «DRA IRINA». Si el texto coincide con palabras completas de UN solo doctor
 *   («BAYARDO» → «DR BAYARDO GARZA») también se usa; si coincide con varios es
 *   ambiguo y la fila se rechaza (nunca se adivina).
 * - Pacientes: misma clave (sin acentos/mayúsculas/espacios); el teléfono solo
 *   desempata entre homónimos ya existentes.
 */

/** Colapsa espacios y recorta. */
export function limpiarEspacios(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Clave de comparación: MAYÚSCULAS, sin acentos ni signos, espacios simples. */
export function claveTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITULOS = new Set(['DR', 'DRA', 'DRS', 'DOCTOR', 'DOCTORA', 'MED', 'MEDICO']);

/** Clave del doctor: como claveTexto pero sin títulos al inicio. */
export function claveDoctor(s: string): string {
  const tokens = claveTexto(s).split(' ').filter(Boolean);
  while (tokens.length > 1 && TITULOS.has(tokens[0])) tokens.shift();
  return tokens.join(' ');
}

const MARCADORES = new Set([
  'NA', 'N A', 'SN', 'S N', 'SIN', 'SIN DATO', 'SIN DATOS', 'SIN NOMBRE', 'NINGUNO', 'NINGUNA',
  'PENDIENTE', 'POR DEFINIR', 'POR ASIGNAR', 'DESCONOCIDO', 'DESCONOCIDA', 'X', 'XX', 'XXX',
  'NO', 'NULL', 'UNDEFINED', 'PRUEBA', 'TEST', 'OTRO', 'VARIOS',
]);

const SIMBOLOS_NO_VALIDOS = /[0-9@#$%&*=+<>{}[\]|\\_~^;:!?¿¡"]/;

export type Validacion<T> = ({ ok: true } & T) | { ok: false; motivo: string };

/**
 * Valida el texto del doctor del archivo. Con varios cirujanos («BAYARDO/IRINA»)
 * se toma el primero, como antes.
 */
export function validarAliasDoctor(texto: string): Validacion<{ alias: string; clave: string }> {
  const principal = limpiarEspacios(limpiarEspacios(texto).split('/')[0] || '');
  if (!principal) return { ok: false, motivo: 'Falta el doctor' };
  if (principal.length > 60) return { ok: false, motivo: `Alias de doctor demasiado largo («${principal.slice(0, 30)}…»)` };
  if (SIMBOLOS_NO_VALIDOS.test(principal)) {
    return { ok: false, motivo: `El alias del doctor tiene números o símbolos («${principal}»)` };
  }
  const letras = (principal.match(/\p{L}/gu) || []).length;
  const clave = claveDoctor(principal);
  if (letras < 2 || !clave || MARCADORES.has(clave) || TITULOS.has(clave)) {
    return { ok: false, motivo: `Alias de doctor no válido («${principal}»)` };
  }
  return { ok: true, alias: principal.toUpperCase(), clave };
}

/** Valida el nombre del paciente: nombre y apellido, solo letras. */
export function validarNombrePaciente(texto: string): Validacion<{ nombre: string; clave: string }> {
  const nombre = limpiarEspacios(texto);
  if (!nombre) return { ok: false, motivo: 'Falta el nombre del paciente' };
  if (nombre.length > 255) return { ok: false, motivo: 'Nombre del paciente demasiado largo' };
  if (SIMBOLOS_NO_VALIDOS.test(nombre)) {
    return { ok: false, motivo: `El nombre del paciente tiene números o símbolos («${nombre}»)` };
  }
  const clave = claveTexto(nombre);
  if (!clave || MARCADORES.has(clave)) return { ok: false, motivo: `Nombre de paciente no válido («${nombre}»)` };
  const palabras = nombre.split(' ').filter((p) => (p.match(/\p{L}/gu) || []).length >= 1);
  if (palabras.length < 2) {
    return { ok: false, motivo: `Nombre de paciente incompleto: se requiere nombre y apellido («${nombre}»)` };
  }
  return { ok: true, nombre, clave };
}

/* ─────────── Doctores ─────────── */

export interface DoctorExistente {
  id: string;
  alias: string;
  activo: boolean;
}

export type ResolucionDoctor =
  | { tipo: 'existente'; id: string; alias: string }
  | { tipo: 'nuevo'; alias: string; clave: string }
  | { tipo: 'rechazo'; motivo: string };

export function crearResolverDoctores(doctores: DoctorExistente[]) {
  const porClave = new Map<string, DoctorExistente[]>();
  for (const d of doctores) {
    const k = claveDoctor(d.alias || '');
    if (!k) continue;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k)!.push(d);
  }
  const activos = doctores.filter((d) => d.activo);
  const tokensDe = new Map(activos.map((d) => [d.id, new Set(claveDoctor(d.alias || '').split(' '))]));
  const memo = new Map<string, ResolucionDoctor>();

  /** null = celda vacía (sin doctor). */
  return (texto: string | null | undefined): ResolucionDoctor | null => {
    if (!texto || !limpiarEspacios(texto)) return null;
    const v = validarAliasDoctor(texto);
    if (!v.ok) return { tipo: 'rechazo', motivo: v.motivo };
    const previo = memo.get(v.clave);
    if (previo) return previo;

    let r: ResolucionDoctor;
    const exactos = porClave.get(v.clave) || [];
    const exactosActivos = exactos.filter((d) => d.activo);
    if (exactosActivos.length === 1) {
      r = { tipo: 'existente', id: exactosActivos[0].id, alias: exactosActivos[0].alias };
    } else if (exactosActivos.length > 1) {
      r = { tipo: 'rechazo', motivo: `Hay ${exactosActivos.length} doctores activos con el alias «${v.alias}»: unifícalos en Personal médico` };
    } else if (exactos.length > 0) {
      r = { tipo: 'rechazo', motivo: `El doctor «${exactos[0].alias}» está inactivo: reactívalo en Personal médico` };
    } else {
      // Coincidencia por palabras completas («BAYARDO» → «DR BAYARDO GARZA»)
      const buscados = v.clave.split(' ');
      const candidatos = buscados.every((t) => t.length >= 3)
        ? activos.filter((d) => buscados.every((t) => tokensDe.get(d.id)!.has(t)))
        : [];
      if (candidatos.length === 1) {
        r = { tipo: 'existente', id: candidatos[0].id, alias: candidatos[0].alias };
      } else if (candidatos.length > 1) {
        r = {
          tipo: 'rechazo',
          motivo: `Doctor ambiguo «${v.alias}»: coincide con ${candidatos.map((c) => c.alias).join(', ')}. Escribe el alias completo`,
        };
      } else {
        r = { tipo: 'nuevo', alias: v.alias, clave: v.clave };
      }
    }
    memo.set(v.clave, r);
    return r;
  };
}

/* ─────────── Pacientes ─────────── */

export interface PacienteExistente {
  id: string;
  nombre_completo: string | null;
  telefono: string | null;
  created_at?: string | null;
}

/** Últimos 10 dígitos del teléfono (o null). */
export function telefono10(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const t = tel.replace(/\D/g, '').slice(-10);
  return t.length === 10 ? t : null;
}

/**
 * Busca un paciente existente por nombre normalizado. Entre homónimos desempata
 * por teléfono; si no, usa el más antiguo (no se crea otro registro).
 */
export function crearResolverPacientes(existentes: PacienteExistente[]) {
  const porClave = new Map<string, PacienteExistente[]>();
  for (const p of existentes) {
    const k = claveTexto(p.nombre_completo || '');
    if (!k) continue;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k)!.push(p);
  }
  porClave.forEach((lista) => lista.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))));
  return (clave: string, telefono: string | null): string | null => {
    const lista = porClave.get(clave);
    if (!lista || lista.length === 0) return null;
    if (lista.length === 1) return lista[0].id;
    const tel = telefono10(telefono);
    const porTel = tel ? lista.filter((p) => telefono10(p.telefono) === tel) : [];
    return (porTel[0] || lista[0]).id;
  };
}

/** Sexo del archivo → valor de BD (o null). */
export function normalizarSexo(v: string | null | undefined): 'MASCULINO' | 'FEMENINO' | null {
  const k = claveTexto(v || '');
  if (!k) return null;
  if (['M', 'MASCULINO', 'H', 'HOMBRE', 'MASC', 'VARON'].includes(k)) return 'MASCULINO';
  if (['F', 'FEMENINO', 'MUJER', 'FEM'].includes(k)) return 'FEMENINO';
  return null;
}

/* ─────────── Celdas y CSV ─────────── */

/**
 * Valor de una celda de exceljs listo para parsear: fechas → «YYYY-MM-DD»,
 * horas (fecha base 1899) → «HH:MM:SS», texto enriquecido/fórmulas → texto.
 */
export function valorCelda(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    const iso = v.toISOString();
    if (v.getUTCFullYear() < 1900) return iso.slice(11, 19);
    return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  }
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text?: string }>; text?: unknown; result?: unknown; error?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text || '').join('');
    if (o.result !== undefined) return valorCelda(o.result);
    if (o.text !== undefined) return valorCelda(o.text);
    if (o.error !== undefined) return '';
    // Fórmula sin resultado guardado: no hay valor que leer.
    if ('formula' in o || 'sharedFormula' in o) return '';
  }
  return String(v);
}

export function campoCsv(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface FilaRechazada {
  /** Número de fila en el archivo (encabezado = 1). */
  fila: number;
  motivo: string;
  /** Valores originales de la fila, en el orden de `encabezados`. */
  valores: string[];
  hoja?: string;
}

/**
 * CSV para corregir y volver a importar: FILA, MOTIVO DEL RECHAZO y las columnas
 * originales (el importador ignora las dos primeras).
 */
export function generarCsvRechazos(encabezados: string[], filas: FilaRechazada[], conHoja = false): string | null {
  if (filas.length === 0) return null;
  const cab = [...(conHoja ? ['HOJA'] : []), 'FILA', 'MOTIVO DEL RECHAZO', ...encabezados];
  const lineas = filas
    .slice()
    .sort((a, b) => (a.hoja || '').localeCompare(b.hoja || '') || a.fila - b.fila)
    .map((f) =>
      [...(conHoja ? [f.hoja || ''] : []), f.fila, f.motivo, ...encabezados.map((_, i) => f.valores[i] ?? '')]
        .map(campoCsv)
        .join(',')
    );
  return [cab.map(campoCsv).join(','), ...lineas].join('\r\n');
}

/* ─────────── Fechas y horas ─────────── */

/** Orden de fechas numéricas ambiguas («05/09/2026»): día/mes (México) o mes/día (Excel en inglés). */
export type OrdenFecha = 'dmy' | 'mdy';

const MESES: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};
const DIAS_SEMANA = new Set([
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
  'lun', 'mie', 'jue', 'vie', 'sab', 'dom',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
]);

/** Año de 2 dígitos con la regla de Excel: 00–29 → 20xx, 30–99 → 19xx. */
const anio4 = (y: string) => (y.length <= 2 ? (+y <= 29 ? 2000 + +y : 1900 + +y) : +y);

const fechaValida = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2100
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
};

const RE_NUMERICA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?=$|[\sT,])/;

/**
 * Detecta el orden de una columna de fechas numéricas: si alguna fecha solo
 * cabe como mes/día («9/15/2026») y ninguna como día/mes («15/9/2026»), la
 * columna es mes/día. Sin evidencia se usa `preferido`.
 */
export function detectarOrdenFechas(valores: unknown[], preferido: OrdenFecha = 'dmy'): OrdenFecha {
  let dmy = 0;
  let mdy = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(RE_NUMERICA);
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy++;
    else if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  if (mdy > 0 && dmy === 0) return 'mdy';
  if (dmy > 0 && mdy === 0) return 'dmy';
  return preferido;
}

/**
 * En un .xlsx, si la columna tiene fechas escritas como texto mes/día
 * («7/22/2026») es porque Excel (configurado día/mes, es-MX) no las pudo
 * convertir; las que sí convirtió («8/1/2026» → 8 de enero) quedaron con día y
 * mes invertidos. Devuelve cuántas celdas de fecha hay que invertir (0 = nada).
 */
export function fechasInvertidasPorExcel(valores: unknown[]): number {
  let mdyTexto = 0;
  let dmyTexto = 0;
  let invertibles = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    const n = s.match(RE_NUMERICA);
    if (n) {
      if (+n[2] > 12 && +n[1] <= 12) mdyTexto++;
      else if (+n[1] > 12 && +n[2] <= 12) dmyTexto++;
      continue;
    }
    const iso = s.match(/^\d{4}-(\d{2})-(\d{2})/);
    if (iso && +iso[2] <= 12 && iso[1] !== iso[2]) invertibles++;
  }
  return mdyTexto > 0 && dmyTexto === 0 ? invertibles : 0;
}

/**
 * Fecha del archivo → «YYYY-MM-DD» o null. Acepta serial de Excel (número o
 * texto), ISO (con o sin hora), d/m/aaaa o m/d/aaaa (con o sin hora; las
 * ambiguas usan `orden`), y fechas con mes en texto en español o inglés:
 * «1-sep-2026», «martes, 1 de septiembre de 2026», «Tuesday, September 1, 2026».
 */
export function parseFechaImport(val: unknown, orden: OrdenFecha = 'dmy', invertirIso = false): string | null {
  if (val === null || val === undefined || val === '') return null;
  const desdeSerial = (n: number) => {
    if (n < 1 || n > 80000) return null;
    const date = new Date(Math.round((n - 25569) * 86400 * 1000));
    return fechaValida(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  };
  if (typeof val === 'number') return desdeSerial(val);
  const str = String(val).replace(/[  ]/g, ' ').trim();
  if (!str) return null;
  // Serial de Excel guardado como texto (CSV): «45901» o «45901.5»
  if (/^\d{5}(\.\d+)?$/.test(str)) return desdeSerial(parseFloat(str));
  const iso = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?=$|[\sT,])/);
  if (iso) {
    // Celda de fecha que Excel guardó con día y mes invertidos (ver fechasInvertidasPorExcel).
    if (invertirIso && +iso[3] <= 12) return fechaValida(+iso[1], +iso[3], +iso[2]);
    return fechaValida(+iso[1], +iso[2], +iso[3]);
  }
  const num = str.match(RE_NUMERICA);
  if (num) {
    const a = +num[1];
    const b = +num[2];
    const y = anio4(num[3]);
    // Si uno de los dos pasa de 12 no hay ambigüedad.
    if (a > 12) return fechaValida(y, b, a);
    if (b > 12) return fechaValida(y, a, b);
    return orden === 'mdy' ? fechaValida(y, a, b) : fechaValida(y, b, a);
  }
  // Mes en texto: se quitan día de la semana, «de», comas y ordinales.
  const tokens = str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[,./-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== 'de' && t !== 'del' && !DIAS_SEMANA.has(t))
    .map((t) => t.replace(/^(\d{1,2})(st|nd|rd|th|o|º)$/, '$1'));
  if (tokens.length >= 3) {
    const [t1, t2, t3] = tokens;
    if (/^\d{1,2}$/.test(t1) && MESES[t2] && /^\d{2}(\d{2})?$/.test(t3)) return fechaValida(anio4(t3), MESES[t2], +t1);
    if (MESES[t1] && /^\d{1,2}$/.test(t2) && /^\d{2}(\d{2})?$/.test(t3)) return fechaValida(anio4(t3), MESES[t1], +t2);
  }
  return null;
}

/**
 * Hora del archivo → «HH:MM:00» o null. Acepta fracción de día de Excel,
 * «10:00AM», «9:30 pm», «10:00 a. m.» (Excel en español), «14:05:00»,
 * «10 AM» y «10:00 hrs».
 */
export function parseHoraImport(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    const frac = val % 1;
    const total = Math.round(frac * 24 * 60) % (24 * 60);
    if (total < 0) return null;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
  }
  const str = String(val)
    .replace(/[  ]/g, ' ')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\b([AP])\s*M\b/, '$1M')
    .replace(/\s*(HRS|HR|H)$/, '')
    .trim();
  const m = str.match(/(?:^|\s|T)(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/);
  if (!m || (m[2] === undefined && !m[3])) return null; // «10» sola no es hora
  let h = parseInt(m[1], 10);
  const min = m[2] === undefined ? 0 : parseInt(m[2], 10);
  if (m[3] && (h < 1 || h > 12)) return null;
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

/* ─────────── Datos por completar ─────────── */

export function faltantesPaciente(p: {
  sexo?: string | null;
  fecha_nacimiento?: string | null;
  edad?: number | null;
  telefono?: string | null;
}): string[] {
  const f: string[] = [];
  if (!p.sexo) f.push('sexo');
  if (!p.fecha_nacimiento && (p.edad === null || p.edad === undefined)) f.push('fecha de nacimiento');
  if (!p.telefono) f.push('teléfono');
  return f;
}

export function faltantesDoctor(d: { nombre?: string | null; apellido?: string | null; especialidad?: string | null }): string[] {
  const f: string[] = [];
  if (!d.nombre) f.push('nombre');
  if (!d.apellido) f.push('apellido');
  if (!d.especialidad) f.push('especialidad');
  return f;
}
