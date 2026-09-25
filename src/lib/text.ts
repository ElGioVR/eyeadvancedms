/** Utilidades de texto compartidas (antes duplicadas en 9+ archivos). */

/** Minúsculas, sin acentos, espacios colapsados y sin espacios extremos. */
export function normalizeNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CsvFila extends Array<string> {}

/** Parser CSV: campos entre comillas ("" = comilla literal), separador , o ; */
export function parseCsv(text: string): string[][] {
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

/** Bytes → "22.72 KB" */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/** Iniciales desde un nombre: "Juan Pérez" → "JP" (máx 2). */
export function getInitials(name: string | null | undefined, fallback = '??'): string {
  if (!name) return fallback;
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
