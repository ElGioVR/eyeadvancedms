/**
 * Convierte un reporte CSV (generado por la API) a Excel o PDF en el
 * navegador. Las librerías se cargan bajo demanda (import dinámico) para no
 * pesar en el resto de la app.
 */

export type FormatoDescarga = 'csv' | 'xlsx' | 'pdf';

export const FORMATOS_DESCARGA: Array<{ id: FormatoDescarga; label: string }> = [
  { id: 'csv', label: 'CSV' },
  { id: 'xlsx', label: 'Excel' },
  { id: 'pdf', label: 'PDF' },
];

/** Parser CSV (RFC 4180): comillas, comas y saltos de línea dentro de celdas. */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (enComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') { celda += '"'; i++; } else enComillas = false;
      } else celda += ch;
      continue;
    }
    if (ch === '"') enComillas = true;
    else if (ch === ',') { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda !== '' || fila.length > 0) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c !== ''));
}

/** Quita el apóstrofo que el CSV antepone a celdas que empiezan con = + - @. */
function limpiarCelda(v: string): string {
  return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

/** Número real (montos, edades); teléfonos y folios largos se dejan como texto. */
function comoNumero(v: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  const digitos = v.replace(/[^\d]/g, '');
  if (digitos.length >= 10 || (/^-?0\d/.test(v))) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function guardarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function aExcel(filas: string[][], titulo: string): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(titulo.slice(0, 31) || 'Reporte', { views: [{ state: 'frozen', ySplit: 1 }] });
  const [enc = [], ...datos] = filas;
  hoja.addRow(enc);
  for (const f of datos) hoja.addRow(f.map((c) => { const v = limpiarCelda(c); return comoNumero(v) ?? v; }));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  cab.alignment = { vertical: 'middle', wrapText: true };
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, enc.length) } };
  enc.forEach((h, i) => {
    const largo = Math.max(h.length, ...datos.slice(0, 500).map((f) => limpiarCelda(f[i] ?? '').length));
    hoja.getColumn(i + 1).width = Math.min(45, Math.max(8, largo + 2));
  });
  const buf = await libro.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function aPdf(filas: string[][], titulo: string, subtitulo: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const [enc = [], ...datos] = filas;
  // Muchas columnas → hoja más grande y letra más chica.
  const formato = enc.length > 16 ? 'a3' : 'a4';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: formato });
  doc.setFontSize(14);
  doc.text(titulo, 30, 32);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(subtitulo, 30, 46);
  autoTable(doc, {
    head: [enc],
    body: datos.map((f) => f.map(limpiarCelda)),
    startY: 56,
    margin: { left: 20, right: 20 },
    styles: { fontSize: enc.length > 20 ? 5.5 : 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didDrawPage: () => {
      const pag = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Página ${pag}`, doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 14);
    },
  });
  return doc.output('blob');
}

/**
 * Guarda el reporte en el formato elegido.
 * @param csv     texto CSV devuelto por la API
 * @param nombreBase nombre del archivo sin extensión
 */
export async function descargarReporte(
  csv: string,
  nombreBase: string,
  formato: FormatoDescarga,
  titulo: string,
  subtitulo = '',
): Promise<void> {
  if (formato === 'csv') {
    guardarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${nombreBase}.csv`);
    return;
  }
  const filas = parseCsv(csv);
  if (formato === 'xlsx') guardarBlob(await aExcel(filas, titulo), `${nombreBase}.xlsx`);
  else guardarBlob(await aPdf(filas, titulo, subtitulo), `${nombreBase}.pdf`);
}
