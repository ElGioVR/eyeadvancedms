/*
 * Exportación de un registro (cirugía, consulta, paciente) a PDF, Excel o Word.
 * Se genera en el navegador a partir de las mismas filas que muestra la pantalla.
 * PDF: jspdf + jspdf-autotable · Excel: exceljs · Word: docx.
 */

export interface FilaExport {
  seccion?: string;
  campo: string;
  valor: string;
}

export interface DocumentoExport {
  titulo: string;
  subtitulo?: string;
  filas: FilaExport[];
  nombreArchivo: string;
}

export type FormatoExport = 'pdf' | 'xlsx' | 'docx';

export async function exportarDocumento(doc: DocumentoExport, formato: FormatoExport): Promise<void> {
  const limpio: DocumentoExport = {
    ...doc,
    filas: doc.filas.map((f) => ({ ...f, valor: f.valor || '—' })),
  };
  if (formato === 'pdf') return descargar(await aPdf(limpio), `${limpio.nombreArchivo}.pdf`);
  if (formato === 'xlsx') return descargar(await aExcel(limpio), `${limpio.nombreArchivo}.xlsx`);
  return descargar(await aWord(limpio), `${limpio.nombreArchivo}.docx`);
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function aPdf(doc: DocumentoExport): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  pdf.setFontSize(14);
  pdf.text(doc.titulo, 40, 50);
  if (doc.subtitulo) {
    pdf.setFontSize(10);
    pdf.text(doc.subtitulo, 40, 66);
  }
  const cuerpo: string[][] = [];
  let seccionAnterior = '';
  for (const f of doc.filas) {
    if (f.seccion && f.seccion !== seccionAnterior) {
      cuerpo.push([{ content: f.seccion, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [235, 240, 245] } } as unknown as string, '']);
      seccionAnterior = f.seccion;
    }
    cuerpo.push([f.campo, f.valor]);
  }
  autoTable(pdf, {
    startY: doc.subtitulo ? 80 : 65,
    head: [['Campo', 'Valor']],
    body: cuerpo,
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 170 } },
    headStyles: { fillColor: [41, 98, 160] },
  });
  return pdf.output('blob');
}

async function aExcel(doc: DocumentoExport): Promise<Blob> {
  const ExcelJS = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Detalle');
  hoja.columns = [
    { header: 'Sección', key: 'seccion', width: 26 },
    { header: 'Campo', key: 'campo', width: 30 },
    { header: 'Valor', key: 'valor', width: 60 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const f of doc.filas) hoja.addRow({ seccion: f.seccion ?? '', campo: f.campo, valor: f.valor });
  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function aWord(doc: DocumentoExport): Promise<Blob> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, WidthType } = docx;
  const celda = (texto: string, negrita = false) =>
    new TableCell({ children: [new Paragraph({ children: [new docx.TextRun({ text: texto, bold: negrita })] })] });
  const filas: InstanceType<typeof TableRow>[] = [new TableRow({ children: [celda('Campo', true), celda('Valor', true)], tableHeader: true })];
  let seccionAnterior = '';
  for (const f of doc.filas) {
    if (f.seccion && f.seccion !== seccionAnterior) {
      seccionAnterior = f.seccion;
      filas.push(new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new docx.TextRun({ text: f.seccion, bold: true })] })] })] }));
    }
    filas.push(new TableRow({ children: [celda(f.campo), celda(f.valor)] }));
  }
  const documento = new Document({
    sections: [{
      children: [
        new Paragraph({ text: doc.titulo, heading: HeadingLevel.HEADING_1 }),
        ...(doc.subtitulo ? [new Paragraph({ text: doc.subtitulo })] : []),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas }),
      ],
    }],
  });
  return Packer.toBlob(documento);
}
