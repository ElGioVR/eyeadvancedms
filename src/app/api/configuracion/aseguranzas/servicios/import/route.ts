import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
  }

  if (!aseguranzaId) {
    return NextResponse.json({ error: 'aseguranza_id es requerido' }, { status: 400 });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Archivo demasiado máximo 5MB' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return NextResponse.json({ error: 'Formato no soportado. Usa .xlsx, .xls o .csv' }, { status: 400 });
  }

  try {
    const ExcelJS = (await import('exceljs')).default;

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await (workbook.xlsx as any).load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
    }

    // Read headers from first row
    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim();
    });

    // Expected columns: nombre, tipo, costo, porcentaje_cobertura
    const nombreIdx = headers.findIndex(h => h.toLowerCase().includes('nombre'));
    const tipoIdx = headers.findIndex(h => h.toLowerCase().includes('tipo'));
    const costoIdx = headers.findIndex(h => h.toLowerCase().includes('costo'));
    const coberturaIdx = headers.findIndex(h => h.toLowerCase().includes('cobertura'));

    if (nombreIdx < 0) {
      return NextResponse.json({ error: 'Falta columna "nombre" en el archivo' }, { status: 400 });
    }

    // Parse rows
    const rows: Array<{ nombre: string; tipo: string; costo: number; porcentaje_cobertura: number; errores: string[] }> = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const nombre = String(row.getCell(nombreIdx).value || '').trim();
      if (!nombre) return;

      const tipo = String(row.getCell(tipoIdx).value || 'ESTUDIO').trim().toUpperCase();
      const costo = parseFloat(String(row.getCell(costoIdx).value || '0')) || 0;
      const cobertura = parseFloat(String(row.getCell(coberturaIdx).value || '0')) || 0;

      const errores: string[] = [];
      if (!['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'].includes(tipo)) {
        errores.push(`Tipo "${tipo}" no válido (debe ser ESTUDIO, PROCEDIMIENTO o CONSULTA)`);
      }
      if (costo < 0) errores.push('Costo no puede ser negativo');
      if (cobertura < 0 || cobertura > 100) errores.push('Cobertura debe ser 0-100');

      rows.push({ nombre, tipo, costo, porcentaje_cobertura: cobertura, errores });
    });

    if (!confirm) {
      // Preview mode: return rows + duplicates check
      const supabase = getSupabaseAdmin();
      const norms = rows.map(r => normalize(r.nombre));
      const { data: existing } = await supabase
        .from('aseguranza_servicios')
        .select('nombre_norm')
        .eq('aseguranza_id', aseguranzaId);

      const existingSet = new Set((existing || []).map(e => e.nombre_norm));

      const preview = rows.map(r => ({
        ...r,
        duplicado: existingSet.has(normalize(r.nombre)),
      }));

      const validCount = preview.filter(r => r.errores.length === 0).length;
      const duplicateCount = preview.filter(r => r.duplicado).length;
      const errorCount = preview.filter(r => r.errores.length > 0).length;

      return NextResponse.json({
        preview: true,
        total: rows.length,
        validos: validCount,
        duplicados: duplicateCount,
        errores: errorCount,
        rows: preview,
      });
    }

    // Confirm mode: insert
    const supabase = getSupabaseAdmin();
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    const rechazados: Array<{ nombre: string; motivo: string }> = [];

    for (const row of rows) {
      if (row.errores.length > 0) {
        rechazados.push({ nombre: row.nombre, motivo: row.errores.join('; ') });
        failed++;
        continue;
      }

      const { error } = await supabase.from('aseguranza_servicios').upsert({
        aseguranza_id: aseguranzaId,
        tipo: row.tipo,
        nombre: row.nombre,
        nombre_norm: normalize(row.nombre),
        costo: row.costo,
        porcentaje_cobertura: row.porcentaje_cobertura,
        activo: true,
      }, { onConflict: 'aseguranza_id,tipo,nombre_norm' });

      if (error) {
        rechazados.push({ nombre: row.nombre, motivo: error.message });
        failed++;
      } else {
        inserted++;
      }
    }

    return NextResponse.json({
      preview: false,
      insertados: inserted,
      omitidos: skipped,
      errores: failed,
      rechazados,
    });

  } catch (err) {
    return NextResponse.json({ error: 'Error procesando archivo' }, { status: 500 });
  }
}
