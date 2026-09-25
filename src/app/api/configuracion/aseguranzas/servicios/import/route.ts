import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Parser CSV mínimo: soporta campos entre comillas y separador , o ; */
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

interface ParsedRow {
  nombre: string;
  tipo: string;
  costo: number;
  porcentaje_cobertura: number;
  errores: string[];
}

function construirRowsDesdeMatriz(matriz: string[][]): { rows: ParsedRow[]; error?: string } {
  if (matriz.length === 0) return { rows: [], error: 'El archivo no contiene datos' };

  const headers = matriz[0].map((h) => String(h || '').trim().toLowerCase());
  const nombreIdx = headers.findIndex((h) => h.includes('nombre'));
  const tipoIdx = headers.findIndex((h) => h.includes('tipo'));
  const costoIdx = headers.findIndex((h) => h.includes('costo'));
  const coberturaIdx = headers.findIndex((h) => h.includes('cobertura'));

  if (nombreIdx < 0) {
    return { rows: [], error: 'Falta columna "nombre" en el archivo. Columnas esperadas: nombre, tipo, costo, porcentaje_cobertura' };
  }

  const rows: ParsedRow[] = [];
  for (let r = 1; r < matriz.length; r++) {
    const fila = matriz[r];
    const get = (idx: number) => (idx >= 0 ? String(fila[idx] ?? '').trim() : '');
    const nombre = get(nombreIdx);
    if (!nombre) continue;

    const tipo = (tipoIdx >= 0 ? get(tipoIdx) : 'ESTUDIO').toUpperCase();
    const costo = parseFloat(get(costoIdx) || '0') || 0;
    const cobertura = parseFloat(get(coberturaIdx) || '0') || 0;

    const errores: string[] = [];
    if (!['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'].includes(tipo)) {
      errores.push(`Tipo "${tipo}" no válido (debe ser ESTUDIO, PROCEDIMIENTO o CONSULTA)`);
    }
    if (costo < 0) errores.push('Costo no puede ser negativo');
    if (cobertura < 0 || cobertura > 100) errores.push('Cobertura debe ser 0-100');

    rows.push({ nombre, tipo, costo, porcentaje_cobertura: cobertura, errores });
  }
  return { rows };
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const aseguranzaId = formData.get('aseguranza_id') as string | null;
  const confirm = formData.get('confirm') === 'true';
  const modo = (formData.get('modo') as string | null) === 'reemplazar' ? 'reemplazar' : 'agregar';

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
  }

  if (!aseguranzaId) {
    return NextResponse.json({ error: 'aseguranza_id es requerido' }, { status: 400 });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máximo 5MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'csv'].includes(ext || '')) {
    return NextResponse.json({ error: 'Formato no soportado. Usa .xlsx o .csv (descarga la plantilla)' }, { status: 400 });
  }

  try {
    let rows: ParsedRow[] = [];

    if (ext === 'csv') {
      const text = await file.text();
      const parsed = construirRowsDesdeMatriz(parseCsv(text));
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      rows = parsed.rows;
    } else {
      const ExcelJS = (await import('exceljs')).default;
      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = new ExcelJS.Workbook();
      await (workbook.xlsx as any).load(buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
      }
      const matriz: string[][] = [];
      worksheet.eachRow((row) => {
        const fila: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          fila.push(String(cell.value ?? '').trim());
        });
        matriz.push(fila);
      });
      const parsed = construirRowsDesdeMatriz(matriz);
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      rows = parsed.rows;
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('aseguranza_servicios')
      .select('nombre_norm')
      .eq('aseguranza_id', aseguranzaId);
    const existingSet = new Set((existing || []).map((e) => e.nombre_norm));

    if (!confirm) {
      // Preview: conteos + detalle de filas problemáticas
      const preview = rows.map((r) => ({
        ...r,
        duplicado: existingSet.has(normalize(r.nombre)),
      }));

      const validCount = preview.filter((r) => r.errores.length === 0).length;
      const duplicateCount = preview.filter((r) => r.duplicado).length;
      const errorCount = preview.filter((r) => r.errores.length > 0).length;

      return NextResponse.json({
        preview: true,
        modo,
        total: rows.length,
        validos: validCount,
        duplicados: duplicateCount,
        errores: errorCount,
        rows: preview,
      });
    }

    // Confirm mode
    let insertados = 0;
    let omitidos = 0;
    let failed = 0;
    const rechazados: Array<{ nombre: string; motivo: string }> = [];

    if (modo === 'reemplazar') {
      // Limpiar todos los servicios de la aseguranza y cargar los del archivo
      const { error: deleteError } = await supabase
        .from('aseguranza_servicios')
        .delete()
        .eq('aseguranza_id', aseguranzaId);
      if (deleteError) {
        return NextResponse.json({ error: 'Error al limpiar los servicios existentes' }, { status: 500 });
      }
      existingSet.clear();
    }

    const pendientes: ParsedRow[] = [];
    for (const row of rows) {
      if (row.errores.length > 0) {
        rechazados.push({ nombre: row.nombre, motivo: row.errores.join('; ') });
        failed++;
        continue;
      }
      const norm = normalize(row.nombre);
      if (existingSet.has(norm)) {
        // Duplicado: no se ingresa de nuevo
        omitidos++;
        continue;
      }
      pendientes.push(row);
      existingSet.add(norm); // evita duplicados dentro del mismo archivo
    }

    for (const row of pendientes) {
      const { error } = await supabase
        .from('aseguranza_servicios')
        .insert({
          aseguranza_id: aseguranzaId,
          tipo: row.tipo,
          nombre: row.nombre,
          nombre_norm: normalize(row.nombre),
          costo: row.costo,
          porcentaje_cobertura: row.porcentaje_cobertura,
          activo: true,
        });
      if (error) {
        rechazados.push({ nombre: row.nombre, motivo: error.message });
        failed++;
      } else {
        insertados++;
      }
    }

    return NextResponse.json({
      preview: false,
      modo,
      insertados,
      omitidos,
      errores: failed,
      rechazados,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Error procesando archivo. Verifica que sea .xlsx o .csv válido' }, { status: 500 });
  }
}
