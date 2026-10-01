/**
 * Catálogo de modelos de LIO (cat_modelos_lio, mig. 1800000000360).
 *
 * Fuente: lo administra la clínica (Configuración → Modelos de LIO), sembrado
 * con los LIO de su propio inventario. La ESCRS no publica un catálogo
 * descargable y las condiciones de IOLCon prohíben copiar sus datos a otro
 * software; se pueden CONSULTAR ahí para verificar cada alta.
 */

export const DISENOS_LIO = [
  { value: 'MONOFOCAL', label: 'Monofocal' },
  { value: 'TRIFOCAL', label: 'Trifocal' },
  { value: 'MULTIFOCAL', label: 'Multifocal (otro)' },
  { value: 'EDOF', label: 'EDOF' },
  { value: 'OTRO', label: 'Otro' },
] as const;
export type DisenoLio = (typeof DISENOS_LIO)[number]['value'];
export const VALORES_DISENO_LIO = DISENOS_LIO.map((d) => d.value) as [DisenoLio, ...DisenoLio[]];

export interface ModeloLio {
  id: string;
  fabricante: string;
  modelo: string;
  diseno: DisenoLio;
  torico: boolean;
  verificado: boolean;
  origen: 'MANUAL' | 'INVENTARIO' | 'CSV';
  notas: string | null;
  activo: boolean;
}

export interface FilaModeloLio {
  fabricante: string;
  modelo: string;
  diseno: DisenoLio;
  torico: boolean;
}

export function etiquetaModeloLio(m: Pick<ModeloLio, 'fabricante' | 'modelo' | 'torico'>): string {
  return `${m.fabricante} — ${m.modelo}${m.torico && !/toric/i.test(m.modelo) ? ' (tórico)' : ''}`;
}

/** Modelos compatibles con el tipo de LIO elegido en la cirugía (diseño × tórico). */
export function filtrarModelosPorTipo<T extends Pick<ModeloLio, 'diseno' | 'torico' | 'activo'>>(
  modelos: T[],
  diseno: string | null | undefined,
  torico: boolean | null | undefined
): T[] {
  return modelos.filter(
    (m) => m.activo && (!diseno || m.diseno === diseno) && (torico === null || torico === undefined || m.torico === torico)
  );
}

const quitarAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function normalizarDiseno(v: string): DisenoLio | null {
  const t = quitarAcentos(v);
  if (!t) return null;
  if (t.startsWith('mono')) return 'MONOFOCAL';
  if (t.startsWith('tri')) return 'TRIFOCAL';
  if (t.startsWith('multi') || t.startsWith('bifo')) return 'MULTIFOCAL';
  if (t.startsWith('edof') || t.includes('profundidad')) return 'EDOF';
  if (t.startsWith('otro')) return 'OTRO';
  return null;
}

function normalizarBool(v: string): boolean | null {
  const t = quitarAcentos(v);
  if (['si', 'sí', 's', 'true', '1', 'x', 'yes', 'torico', 'toric'].includes(t)) return true;
  if (['no', 'n', 'false', '0', '', 'no torico'].includes(t)) return false;
  return null;
}

/** Divide una línea CSV respetando comillas dobles. */
function dividirLinea(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else comillas = !comillas;
    } else if (c === sep && !comillas) {
      out.push(actual); actual = '';
    } else actual += c;
  }
  out.push(actual);
  return out.map((x) => x.trim());
}

/**
 * CSV → filas válidas + errores por línea. Encabezados (cualquier orden,
 * sin acentos ni mayúsculas obligatorias): fabricante, modelo, diseno, torico.
 * Separador «,» o «;» (Excel en español).
 */
export function parsearCsvModelosLio(texto: string): { filas: FilaModeloLio[]; errores: string[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return { filas: [], errores: ['El archivo está vacío'] };
  const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const enc = dividirLinea(lineas[0], sep).map(quitarAcentos);
  const idx = {
    fabricante: enc.findIndex((h) => h === 'fabricante' || h === 'marca'),
    modelo: enc.findIndex((h) => h === 'modelo'),
    diseno: enc.findIndex((h) => h === 'diseno' || h === 'tipo'),
    torico: enc.findIndex((h) => h === 'torico'),
  };
  const faltan = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => k);
  if (faltan.length) return { filas: [], errores: [`Faltan columnas: ${faltan.join(', ')} (se esperan fabricante, modelo, diseno, torico)`] };

  const filas: FilaModeloLio[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  lineas.slice(1).forEach((linea, i) => {
    const n = i + 2;
    const c = dividirLinea(linea, sep);
    const fabricante = c[idx.fabricante] || '';
    const modelo = c[idx.modelo] || '';
    const diseno = normalizarDiseno(c[idx.diseno] || '');
    const torico = normalizarBool(c[idx.torico] || '');
    if (!fabricante || !modelo) return void errores.push(`Línea ${n}: fabricante y modelo son obligatorios`);
    if (fabricante.length > 120 || modelo.length > 160) return void errores.push(`Línea ${n}: texto demasiado largo`);
    if (!diseno) return void errores.push(`Línea ${n}: diseño no reconocido «${c[idx.diseno] || ''}» (monofocal, trifocal, multifocal, edof, otro)`);
    if (torico === null) return void errores.push(`Línea ${n}: tórico debe ser sí/no`);
    const clave = `${fabricante.toLowerCase()}|${modelo.toLowerCase()}|${torico}`;
    if (vistos.has(clave)) return void errores.push(`Línea ${n}: repetida en el archivo`);
    vistos.add(clave);
    filas.push({ fabricante, modelo, diseno, torico });
  });
  return { filas, errores };
}

export const PLANTILLA_CSV_MODELOS_LIO = 'fabricante,modelo,diseno,torico\nAlcon,Clareon PanOptix Toric CNATT2,trifocal,si\n';

/** Enlaces de consulta (no se copian sus datos). */
export const URL_ESCRS_IOL = 'https://iolcalculator.escrs.org/';
export const URL_IOLCON = 'https://iolcon.org/';

const compacto = (t: string | null | undefined) => quitarAcentos(t || '').replace(/[^a-z0-9]/g, '');

/**
 * ¿La pieza del inventario corresponde al modelo del catálogo?
 * Fabricante: uno contiene al otro (ignora espacios, «+», «&», acentos).
 * Modelo: el código/nombre de la pieza está contenido en el del catálogo o al revés.
 */
export function coincideConModelo(
  item: { marca: string | null | undefined; modelo: string | null | undefined },
  modelo: { fabricante: string; modelo: string }
): boolean {
  const fi = compacto(item.marca);
  const fm = compacto(modelo.fabricante);
  const mi = compacto(item.modelo);
  const mm = compacto(modelo.modelo);
  if (!fi || !fm || !mi || !mm) return false;
  const fab = fi.includes(fm) || fm.includes(fi);
  const mod = mm.includes(mi) || mi.includes(mm);
  return fab && mod;
}
