import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';
import { exigirLimite } from '@/lib/api/limites';

// Importación de matrices grandes: parseo + inserts por lotes.
export const maxDuration = 60;

const MAX_SIZE = 5 * 1024 * 1024; // 5MB (archivo)
const MAX_BODY = MAX_SIZE + 256 * 1024; // archivo + campos del multipart
const MAX_FILAS = 5000;
const MAX_NOMBRE = 500;
const MAX_MONTO = 99_999_999.99;
const LOTE_INSERT = 500;
const LOTE_LECTURA = 1000;
const CONCURRENCIA = 8;
const TIPOS = ['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Parser CSV mínimo: soporta campos entre comillas y separador , o ; */
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

/** Texto de una celda de ExcelJS (fórmulas, texto enriquecido, hipervínculos, fechas). */
function textoCelda(valor: unknown): string {
  if (valor == null) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const v = valor as Record<string, unknown>;
    if ('result' in v) return textoCelda(v.result);
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: unknown }>).map((t) => String(t.text ?? '')).join('');
    }
    if ('text' in v) return String(v.text ?? '');
    return '';
  }
  return String(valor);
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
  if (matriz.length - 1 > MAX_FILAS) {
    return { rows: [], error: `El archivo excede el máximo de ${MAX_FILAS} filas` };
  }

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

    const tipo = (tipoIdx >= 0 ? get(tipoIdx) : 'ESTUDIO').toUpperCase().slice(0, 40);
    const costo = parseFloat(get(costoIdx) || '0') || 0;
    const cobertura = parseFloat(get(coberturaIdx) || '0') || 0;

    const errores: string[] = [];
    if (nombre.length > MAX_NOMBRE) errores.push(`Nombre demasiado largo (máximo ${MAX_NOMBRE} caracteres)`);
    if (!TIPOS.includes(tipo)) {
      errores.push(`Tipo "${tipo}" no válido (debe ser ESTUDIO, PROCEDIMIENTO o CONSULTA)`);
    }
    if (costo < 0) errores.push('Costo no puede ser negativo');
    if (costo > MAX_MONTO) errores.push('Costo fuera de rango');
    if (cobertura < 0 || cobertura > 100) errores.push('Cobertura debe ser 0-100');

    rows.push({ nombre: nombre.slice(0, MAX_NOMBRE), tipo, costo, porcentaje_cobertura: cobertura, errores });
  }
  return { rows };
}

/** Todos los nombre_norm de la aseguradora (paginado: PostgREST corta en ~1000 filas). */
async function leerExistentes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  aseguranzaId: string,
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let desde = 0; ; desde += LOTE_LECTURA) {
    const { data, error } = await supabase
      .from('aseguranza_servicios')
      .select('nombre_norm')
      .eq('aseguranza_id', aseguranzaId)
      .order('id')
      .range(desde, desde + LOTE_LECTURA - 1);
    if (error) throw error;
    for (const e of data ?? []) set.add(e.nombre_norm as string);
    if (!data || data.length < LOTE_LECTURA) break;
  }
  return set;
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const limite = await exigirLimite('importacion', auth.user.id);
  if (limite) return limite;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAX_BODY) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máximo 5MB)' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Se esperaba un formulario multipart con el archivo' }, { status: 400 });
  }
  const fileRaw = formData.get('file');
  const file = fileRaw && typeof fileRaw !== 'string' ? (fileRaw as File) : null;
  const aseguranzaIdRaw = formData.get('aseguranza_id');
  const aseguranzaId = typeof aseguranzaIdRaw === 'string' ? aseguranzaIdRaw : null;
  const confirm = formData.get('confirm') === 'true';
  const modo = formData.get('modo') === 'reemplazar' ? 'reemplazar' : 'agregar';

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
  }

  if (!aseguranzaId) {
    return NextResponse.json({ error: 'aseguranza_id es requerido' }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(aseguranzaId).success) {
    return NextResponse.json({ error: 'aseguranza_id no válido' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máximo 5MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'csv'].includes(ext || '')) {
    return NextResponse.json({ error: 'Formato no soportado. Usa .xlsx o .csv (descarga la plantilla)' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // La aseguradora y los nombres existentes se leen mientras se parsea el archivo
  // (Promise.resolve: el builder de PostgREST relanza la consulta en cada `.then`)
  const aseguranzaP = Promise.resolve(
    supabase.from('aseguranzas').select('id').eq('id', aseguranzaId).maybeSingle(),
  );
  const existentesP = leerExistentes(supabase, aseguranzaId);
  // Evita rechazos no manejados si el parseo falla antes de esperarlas
  void aseguranzaP.catch(() => undefined);
  void existentesP.catch(() => undefined);

  let rows: ParsedRow[] = [];
  try {
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
      let excedido = false;
      worksheet.eachRow((row) => {
        if (matriz.length > MAX_FILAS) {
          excedido = true;
          return;
        }
        const fila: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          fila.push(textoCelda(cell.value).trim());
        });
        matriz.push(fila);
      });
      if (excedido) {
        return NextResponse.json({ error: `El archivo excede el máximo de ${MAX_FILAS} filas` }, { status: 400 });
      }
      const parsed = construirRowsDesdeMatriz(matriz);
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      rows = parsed.rows;
    }
  } catch (err) {
    console.error('[configuracion.aseguranzas.servicios.import] parseo', err);
    return NextResponse.json({ error: 'Error procesando archivo. Verifica que sea .xlsx o .csv válido' }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
  }

  let existingSet: Set<string>;
  try {
    const [{ data: aseguranza, error: aseguranzaError }, existentes] = await Promise.all([aseguranzaP, existentesP]);
    if (aseguranzaError) throw aseguranzaError;
    if (!aseguranza) {
      return NextResponse.json({ error: 'La aseguradora no existe' }, { status: 404 });
    }
    existingSet = existentes;
  } catch (err) {
    return NextResponse.json(
      { error: mensajeSeguro(err, 'configuracion.aseguranzas.servicios.import', 'Error al leer los servicios existentes') },
      { status: 500 },
    );
  }

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

  // En "reemplazar" la matriz actual se descarta: sólo cuentan duplicados dentro del archivo.
  const vistos = modo === 'reemplazar' ? new Set<string>() : existingSet;

  const pendientes: ParsedRow[] = [];
  for (const row of rows) {
    if (row.errores.length > 0) {
      rechazados.push({ nombre: row.nombre, motivo: row.errores.join('; ') });
      failed++;
      continue;
    }
    const norm = normalize(row.nombre);
    if (vistos.has(norm)) {
      // Duplicado: no se ingresa de nuevo
      omitidos++;
      continue;
    }
    pendientes.push(row);
    vistos.add(norm); // evita duplicados dentro del mismo archivo
  }

  if (modo === 'reemplazar') {
    // No vaciar la matriz si el archivo no trae ninguna fila válida
    if (pendientes.length === 0) {
      return NextResponse.json(
        { error: 'El archivo no contiene filas válidas; la matriz actual no se modificó' },
        { status: 400 },
      );
    }
    // Limpiar todos los servicios de la aseguranza y cargar los del archivo
    const { error: deleteError } = await supabase
      .from('aseguranza_servicios')
      .delete()
      .eq('aseguranza_id', aseguranzaId);
    if (deleteError) {
      console.error('[configuracion.aseguranzas.servicios.import] delete', deleteError);
      return NextResponse.json({ error: 'Error al limpiar los servicios existentes' }, { status: 500 });
    }
  }

  const aRegistro = (row: ParsedRow) => ({
    aseguranza_id: aseguranzaId,
    tipo: row.tipo,
    nombre: row.nombre,
    nombre_norm: normalize(row.nombre),
    costo: row.costo,
    porcentaje_cobertura: row.porcentaje_cobertura,
    activo: true,
  });

  // Inserción por lotes (antes: un INSERT por fila). Los choques con la
  // restricción única (carrera con otra importación) se omiten, no fallan.
  const insertarLote = (lote: ParsedRow[]) =>
    supabase
      .from('aseguranza_servicios')
      .upsert(lote.map(aRegistro), { onConflict: 'aseguranza_id,tipo,nombre_norm', ignoreDuplicates: true })
      .select('id');

  for (let i = 0; i < pendientes.length; i += LOTE_INSERT) {
    const lote = pendientes.slice(i, i + LOTE_INSERT);
    const { data, error } = await insertarLote(lote);
    if (!error) {
      const n = data?.length ?? 0;
      insertados += n;
      omitidos += lote.length - n;
      continue;
    }

    // El lote falló completo: reintentar fila por fila (concurrencia limitada)
    // para reportar exactamente cuáles no se pudieron guardar.
    for (let j = 0; j < lote.length; j += CONCURRENCIA) {
      const grupo = lote.slice(j, j + CONCURRENCIA);
      const resultados = await Promise.all(grupo.map((row) => insertarLote([row])));
      resultados.forEach((res, k) => {
        if (res.error) {
          rechazados.push({
            nombre: grupo[k].nombre,
            motivo: mensajeSeguro(res.error, 'configuracion.aseguranzas.servicios.import', 'No se pudo guardar'),
          });
          failed++;
        } else if ((res.data?.length ?? 0) > 0) {
          insertados++;
        } else {
          omitidos++;
        }
      });
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
}

export const POST = ruta('configuracion/aseguranzas/servicios/import#POST', manejarPOST);
