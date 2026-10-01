/**
 * Catálogos fijos del formulario de cirugía (Modificaciones agenda, punto I).
 */

/** Anestesia (columna agenda_cirugias.anestesia, mig. 1800000000340). */
export const ANESTESIAS = [
  { value: 'LOCAL_SEDACION', label: 'Local con sedación' },
  { value: 'LOCAL', label: 'Local' },
  { value: 'GENERAL', label: 'General' },
] as const;
export type Anestesia = (typeof ANESTESIAS)[number]['value'];
export const VALORES_ANESTESIA = ANESTESIAS.map((a) => a.value) as [Anestesia, ...Anestesia[]];

export function etiquetaAnestesia(valor: string | null | undefined): string | null {
  return ANESTESIAS.find((a) => a.value === valor)?.label ?? null;
}

/**
 * Ojo: la clínica usa la notación OD / OS / OU. En BD se conserva el código
 * 'OI' (filtros primer/segundo ojo, importaciones, reportes); solo cambia lo
 * que se muestra.
 */
export const OJOS_CIRUGIA = [
  { value: 'OD', label: 'OD - Ojo derecho' },
  { value: 'OI', label: 'OS - Ojo izquierdo' },
  { value: 'OU', label: 'OU - Ambos ojos' },
] as const;

export function etiquetaOjo(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return codigo.toUpperCase() === 'OI' ? 'OS' : codigo;
}

/** Tipos de documento de apoyo; «Otro» permite texto libre. */
export const TIPOS_DOCUMENTO_APOYO = [
  'Consulta de medicina interna',
  'Exámenes complementarios',
  'Estudios de gabinete',
  'Consentimiento informado',
] as const;
export const TIPO_DOCUMENTO_OTRO = 'Otro';
export const TIPO_MEDICINA_INTERNA = TIPOS_DOCUMENTO_APOYO[0];

/* ───────── Tipo de LIO (punto I.2) ───────── */

export type LioDiseno = 'MONOFOCAL' | 'TRIFOCAL';

/** Las 4 opciones del documento: diseño × toricidad (columnas lio_diseno + lio_torico). */
export const TIPOS_LIO = [
  { value: 'MONOFOCAL_TORICO', label: 'Monofocal tórico', diseno: 'MONOFOCAL', torico: true },
  { value: 'MONOFOCAL_NO_TORICO', label: 'Monofocal no tórico', diseno: 'MONOFOCAL', torico: false },
  { value: 'TRIFOCAL_TORICO', label: 'Trifocal tórico', diseno: 'TRIFOCAL', torico: true },
  { value: 'TRIFOCAL_NO_TORICO', label: 'Trifocal no tórico', diseno: 'TRIFOCAL', torico: false },
] as const satisfies ReadonlyArray<{ value: string; label: string; diseno: LioDiseno; torico: boolean }>;

export type TipoLio = (typeof TIPOS_LIO)[number]['value'];

export function tipoLioDe(diseno: string | null | undefined, torico: boolean | null | undefined): (typeof TIPOS_LIO)[number] | undefined {
  if (!diseno || torico === null || torico === undefined) return undefined;
  return TIPOS_LIO.find((t) => t.diseno === diseno && t.torico === torico);
}

/**
 * ¿El procedimiento implica implante de LIO (facoemulsificación + LIO)?
 * Heurística por nombre del catálogo: "FACO", "FACOEMULSIFICACIÓN", "+ LIO",
 * "CATARATA". Solo decide si se ofrece el bloque de tipo de LIO; no bloquea.
 */
export function esProcedimientoConLio(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  const n = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /\bFACO|\bLIO\b|CATARATA|FACOEMULSIFICACION/.test(n);
}

/* ───────── Personal de apoyo no médico (punto I.2) ───────── */

export const ROLES_PERSONAL = [
  { value: 'instrumentista', label: 'Instrumentista' },
  { value: 'enfermero', label: 'Enfermero(a)' },
  { value: 'circulante', label: 'Circulante' },
] as const;
export type RolPersonal = (typeof ROLES_PERSONAL)[number]['value'];
export const VALORES_ROL_PERSONAL = ROLES_PERSONAL.map((r) => r.value) as [RolPersonal, ...RolPersonal[]];
