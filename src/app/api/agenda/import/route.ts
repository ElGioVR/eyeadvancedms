import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import type { Worksheet } from 'exceljs';

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

/** Lee un File como texto con fallback Windows-1252 (Excel es-MX) */
async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
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
  return v;
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

async function findDoctor(supabase: ReturnType<typeof getSupabaseAdmin>, texto: unknown): Promise<DoctorRef | null> {
  if (!texto) return null;
  const buscar = String(texto).trim();
  if (!buscar) return null;

  const { data: doctores } = await supabase.from('doctores').select('id, alias').eq('activo', true);
  if (!doctores || doctores.length === 0) return null;

  const buscarLower = buscar.toLowerCase();
  // Primer cirujano antes de "/" (BAYARDO/IRINA → BAYARDO)
  const principal = buscarLower.split('/')[0]?.trim() || buscarLower;

  const exacto = doctores.find((d) => {
    const a = d.alias.toLowerCase();
    return a === principal || a.includes(principal) || principal.includes(a);
  });
  if (exacto) return exacto;

  const porApellido = doctores.find((d: DoctorRef) => {
    const apellidos = d.alias.toLowerCase().split(' ');
    return apellidos.some((a: string) => a.length > 3 && principal.includes(a));
  });
  return porApellido || null;
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
  const tipo = (formData.get('tipo') as string | null) === 'consultas' ? 'consultas' : 'cirugias';

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó un archivo' }, { status: 400 });
  }

  // Límites para evitar DoS por memoria en archivos enormes
  const MAX_SIZE_IMPORT = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE_IMPORT) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máximo 5MB)' }, { status: 400 });
  }
  const MAX_FILAS_IMPORT = 2000;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['xlsx', 'csv'].includes(ext)) {
    return NextResponse.json({ error: 'Formato no soportado. Usa .xlsx o .csv' }, { status: 400 });
  }

  /* ══════════ IMPORT DE CONSULTAS (ENTRADA Y SALIDA.csv) ══════════ */
  if (tipo === 'consultas') {
    let matriz: string[][];

    if (ext === 'csv') {
      const text = await readFileText(file);
      matriz = parseCsv(text);
    } else {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const ws = workbook.worksheets[0];
      if (!ws) return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
      matriz = [];
      ws.eachRow((row) => {
        const fila: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => fila.push(String(cell.value ?? '')));
        matriz.push(fila);
      });
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

    // Cache de doctores y aseguranzas
    const { data: doctores } = await supabase.from('doctores').select('id, alias').eq('activo', true);
    const { data: aseguranzas } = await supabase.from('aseguranzas').select('id, nombre');

    const filas: ConsultaFila[] = [];
    let filasOmitidas = 0;

    for (const fila of matriz.slice(1)) {
      const nombre = get(fila, idx.nombre);
      const fechaStr = get(fila, idx.fecha);
      if (!nombre || !fechaStr) { filasOmitidas++; continue; }

      const fecha = parseFechaLargaEn(fechaStr) || parseFecha(fechaStr);
      if (!fecha) { filasOmitidas++; continue; }

      filas.push({
        fecha,
        hora_inicio: parseHora(get(fila, idx.ingreso)),
        hora_fin: parseHora(get(fila, idx.egreso)),
        telefono: get(fila, idx.telefono) || null,
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

    // Match doctor/aseguranza por fila (preview)
    const asegNorm = new Map<string, string>((aseguranzas || []).map((a: { id: string; nombre: string }) => [normalizeText(a.nombre), a.id]));
    const filasEnriquecidas = filas.map((f) => ({
      ...f,
      _doctor: f.doctor_alias ? findDoctor(supabase, f.doctor_alias) : Promise.resolve(null),
    }));
    const conDoctores = await Promise.all(
      filasEnriquecidas.map(async (f) => ({ ...f, _doctorRef: await f._doctor }))
    );

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

    /* Confirm: upsert pacientes + insert consultas */
    const METODO_PAGO_MAP: Record<string, string> = {
      'EFECTIVO': 'EFECTIVO', 'TARJETA': 'TARJETA', 'TARJETA DE CREDITO': 'TARJETA',
      'TARJETA DE DEBITO': 'TARJETA', 'TRANSFERENCIA': 'TRANSFERENCIA',
    };

    const { count: consultasCount } = await supabase
      .from('consultas')
      .select('id', { count: 'exact', head: true });
    let seq = consultasCount || 0;
    const year = new Date().getFullYear().toString().slice(-2);

    // Duplicados: (fecha, hora_inicio, paciente) existentes
    const fechasSet = new Set(conDoctores.map((f) => f.fecha));
    // Dedupe por (fecha, hora_inicio, nombre paciente normalizado)
    const { data: consultasExistentes } = await supabase
      .from('consultas')
      .select('fecha, hora_inicio, pacientes:paciente_id (nombre_completo)')
      .in('fecha', Array.from(fechasSet));
    const dupSet = new Set(
      (consultasExistentes || []).map((c) =>
        `${c.fecha}|${(c.hora_inicio || '').slice(0, 5)}|${normalizeText((c as any).pacientes?.nombre_completo || '')}`
      )
    );

    const pacienteCache = new Map<string, string>();
    let insertadas = 0;
    let omitidasDuplicadas = 0;
    let errores = 0;
    const rechazados: Array<{ nombre: string; fecha?: string | null; motivo: string }> = [];

    for (const f of conDoctores) {
      const dupKey = `${f.fecha}|${(f.hora_inicio || '').slice(0, 5)}|${normalizeText(f.nombre_paciente)}`;
      if (dupSet.has(dupKey)) { omitidasDuplicadas++; continue; }

      // Paciente: por teléfono → por nombre+fnac → crear
      let pacienteId = pacienteCache.get(f.nombre_paciente.toLowerCase()) || null;
      if (!pacienteId && f.telefono) {
        const tel = f.telefono.replace(/\D/g, '').slice(-10);
        if (tel.length === 10) {
          const { data: p } = await supabase.from('pacientes').select('id').eq('telefono', tel).maybeSingle();
          if (p) { pacienteId = p.id; pacienteCache.set(f.nombre_paciente.toLowerCase(), p.id); }
        }
      }
      if (!pacienteId) {
        const { data: p } = await supabase
          .from('pacientes')
          .select('id')
          .ilike('nombre_completo', f.nombre_paciente)
          .maybeSingle();
        if (p) { pacienteId = p.id; pacienteCache.set(f.nombre_paciente.toLowerCase(), p.id); }
      }
      if (!pacienteId) {
        const sexo = f.sexo?.startsWith('M') ? 'MASCULINO' : f.sexo?.startsWith('F') ? 'FEMENINO' : null;
        const { data: nuevo, error: pError } = await supabase
          .from('pacientes')
          .insert({
            nombre_completo: f.nombre_paciente,
            telefono: f.telefono,
            sexo,
            fecha_nacimiento: f.fecha_nacimiento,
          })
          .select('id')
          .maybeSingle();
        if (pError || !nuevo) {
          errores++;
          rechazados.push({ nombre: f.nombre_paciente, fecha: f.fecha, motivo: 'No se pudo crear el paciente' });
          continue;
        }
        pacienteId = nuevo.id;
        pacienteCache.set(f.nombre_paciente.toLowerCase(), nuevo.id);
      }

      seq += 1;
      const folio = `CON-${year}-${String(seq).padStart(5, '0')}`;
      const metodo = f.metodo_pago ? METODO_PAGO_MAP[normalizeText(f.metodo_pago)] || null : null;
      const horaFin = f.hora_fin && f.hora_inicio && f.hora_fin > f.hora_inicio ? f.hora_fin : null;
      const asegId = f.aseguradora ? asegNorm.get(normalizeText(f.aseguradora)) || null : null;

      const { error } = await supabase.from('consultas').insert({
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
      });

      if (error) {
        errores++;
        rechazados.push({ nombre: f.nombre_paciente, fecha: f.fecha, motivo: error.message });
      } else {
        insertadas++;
        dupSet.add(dupKey);
      }
    }

    await supabase.from('agenda_import_log').insert({
      usuario_id: auth.user.id,
      archivo_nombre: file.name.replace(/[^\w\-. ]/g, '_').slice(0, 120),
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

  if (ext === 'csv') {
    const text = await readFileText(file);
    const matriz = parseCsv(text);
    if (matriz.length < 2) {
      return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
    }
    const headers = dedupeHeaders(matriz[0]);
    cirugiaRows = matriz.slice(1).map((fila) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = fila[i] ?? ''; });
      return obj;
    });
  } else {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    function sheetToJson(worksheet: Worksheet | undefined): Record<string, unknown>[] {
      if (!worksheet) return [];
      const rows: Record<string, unknown>[] = [];
      const rawHeaders: string[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            rawHeaders[colNumber] = String(cell.value || '').trim();
          });
          return;
        }
        const obj: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const h = dedupeHeaders(rawHeaders)[colNumber];
          if (h) obj[h] = cell.value;
        });
        rows.push(obj);
      });
      return rows;
    }

    cirugiaRows = sheetToJson(workbook.getWorksheet('CIRUGIA') || workbook.worksheets[0]);
    aplazadosRows = sheetToJson(workbook.getWorksheet('APLAZADOS'));
  }

  if (cirugiaRows.length === 0 && aplazadosRows.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene datos válidos' }, { status: 400 });
  }
  if (cirugiaRows.length + aplazadosRows.length > MAX_FILAS_IMPORT) {
    return NextResponse.json({ error: `El archivo tiene más de ${MAX_FILAS_IMPORT} filas. Divídelo en partes.` }, { status: 400 });
  }

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
      const match = await findDoctor(supabase, cirujano);
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

  const existingCirugias = await supabase
    .from('agenda_cirugias')
    .select('nombre_paciente, fecha, hora');

  const existingSet = new Set(
    (existingCirugias.data || []).map(
      (e) => `${(e.nombre_paciente || '').toLowerCase().trim()}|${e.fecha}|${e.hora}`
    )
  );

  const cirugiaBatch: Array<Record<string, unknown>> = [];
  for (const fila of filasCirugia) {
    const key = `${(fila.nombre_paciente || '').toLowerCase()}|${fila.fecha}|${fila.hora}`;
    const filaOriginal = [
      fila.fecha, fila.nombre_paciente, null, fila.hora, fila.jornada, null, null, null, null,
      fila.diagnostico, fila.procedimiento, fila.ojo, fila.lio, fila.marca_lio,
      fila.tiempo_estimado, fila.tiempo_estancia, fila._cirujano_texto, fila.notas,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');

    if (existingSet.has(key)) {
      yaExistentes.push({ fila: insertadas + insertadasAplazadas + 1, nombre: fila.nombre_paciente, fecha: fila.fecha as string, fila_original: filaOriginal });
      continue;
    }

    const { _cirujano_texto: _c, _doctor_alias: _d, ...insertData } = fila;
    cirugiaBatch.push(insertData);
  }

  if (cirugiaBatch.length > 0) {
    const { data: insertedCirugias, error } = await supabase
      .from('agenda_cirugias')
      .insert(cirugiaBatch)
      .select('id, doctor_id');
    if (error) {
      erroresInsercion += cirugiaBatch.length;
      for (const fila of cirugiaBatch) {
        rechazados.push({ fila: insertadas + insertadasAplazadas + 1, motivo: error.message, nombre: fila.nombre_paciente as string, fecha: fila.fecha as string, fila_original: '' });
      }
    } else {
      insertadas = cirugiaBatch.length;
      for (const fila of cirugiaBatch) {
        const key = `${(fila.nombre_paciente as string || '').toLowerCase()}|${fila.fecha}|${fila.hora}`;
        existingSet.add(key);
      }
      const doctorRows = (insertedCirugias || [])
        .filter((r) => r.doctor_id)
        .map((r) => ({ cirugia_id: r.id, doctor_id: r.doctor_id, rol: 'CIRUJANO_PRINCIPAL', porcentaje_participacion: 100 }));
      if (doctorRows.length > 0) {
        await supabase.from('agenda_cirugia_doctores').insert(doctorRows);
      }
    }
  }

  if (filasAplazadas.length > 0) {
    const { error } = await supabase.from('agenda_cirugias').insert(filasAplazadas);
    if (error) {
      erroresInsercion += filasAplazadas.length;
    } else {
      insertadasAplazadas = filasAplazadas.length;
    }
  }

  await supabase.from('agenda_import_log').insert({
    usuario_id: auth.user.id,
      archivo_nombre: file.name.replace(/[^\w\-. ]/g, '_').slice(0, 120),
    total_filas: filasCirugia.length + filasAplazadas.length,
    filas_ok: insertadas + insertadasAplazadas,
    filas_rechazadas: rechazados.length + yaExistentes.length + erroresCount.cirugia + erroresCount.aplazada,
    detalle_rechazados: rechazados,
  });

  let rechazadosCsv: string | null = null;
  if (rechazados.length > 0) {
    const header = 'Fila,Motivo,Paciente,Fecha,fila_original\n';
    const rows = rechazados.map((r) => `${r.fila},"${r.motivo}","${r.nombre}","${r.fecha || ''}","${r.fila_original.replace(/"/g, '""')}"`).join('\n');
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
