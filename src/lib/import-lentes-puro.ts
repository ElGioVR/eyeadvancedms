import { claveTexto } from '@/lib/import-agenda';

/*
 * Lectura de la columna LIO del Excel de cirugías (sin dependencias de servidor).
 * Ejemplos reales: "23.00 CLAREON", "ISERT 21.0/CT LUCIA 22.5", "CLAREON 22.5".
 * El "/" separa primero y segundo lente; el poder es el número decimal de la pieza.
 */
export interface LenteLeido {
  orden: 'PRIMERO' | 'SEGUNDO' | 'RESPALDO';
  poder: number | null;
  marca: string;
}

const ORDENES = ['PRIMERO', 'SEGUNDO', 'RESPALDO'] as const;

export function parsearLio(texto: string | null | undefined, marcaColumna?: string | null): LenteLeido[] {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  const segmentos = limpio.split('/').map((s) => s.trim()).filter(Boolean).slice(0, ORDENES.length);
  const marcaCol = (marcaColumna ?? '').trim();
  return segmentos.map((seg, i) => {
    const poderMatch = seg.match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
    const poder = poderMatch ? Number(poderMatch[1].replace(',', '.')) : null;
    let marca = seg.replace(/(\d{1,2}(?:[.,]\d{1,2})?)/, '').replace(/\s+/g, ' ').trim();
    if (!marca && segmentos.length === 1) marca = marcaCol;
    return { orden: ORDENES[i], poder: Number.isFinite(poder as number) ? poder : null, marca };
  });
}

/** Clave para emparejar marca y poder con inventario. */
export function claveLente(marca: string, poder: number | null): string {
  return `${claveTexto(marca)}|${poder == null ? '' : poder.toFixed(2)}`;
}

/* ───────────────────────── Lectura estricta (importación v2) ─────────────────────────
 * Interpreta la celda LIO junto con MARCA/NOTAS del Excel de cirugías y decide, con la
 * misma lógica del formulario, qué pasa con cada lente:
 *   · hay pieza libre en inventario  → ASIGNAR   (se compromete la pieza)
 *   · no hay pieza libre             → SOLICITAR (plan de resurtimiento)
 *   · MARCA/NOTAS dicen «pago lente» → COMPRA_DIRECTA
 *   · sin poder, sin marca o con texto que no es un lente → no se guarda y queda
 *     marcado en «Por completar».
 */

export interface LenteImport {
  orden: 'PRIMERO' | 'SEGUNDO' | 'RESPALDO';
  /** Marca/fabricante tal como viene en el archivo (puede estar vacía). */
  marca: string;
  /** Código de modelo tórico (T2, T3…) cuando viene en la celda. */
  modelo: string | null;
  poder: number | null;
  torico: boolean;
  cilindro: number | null;
}

export interface InterpretacionLio {
  lentes: LenteImport[];
  /** MARCA/NOTAS indican que el lente lo paga/compra el paciente. */
  compraDirecta: boolean;
  /** Texto de la celda LIO que NO es un lente (p. ej. «Lunes 28 4 pm»). */
  textoNoLente: string | null;
  /** Qué falta definir (para «Por completar» y avisos de la vista previa). */
  pendientes: string[];
}

const DIAS_RE = /^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\b/;
const RUIDO_MARCA = /^(X|XX|N\/?A|NA|SI|NO|-+|\.+)$/;
const NUM = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)`;
/** Errores de captura frecuentes → nombre correcto. */
const ALIAS_MARCA: Record<string, string> = { ISER: 'Isert', ISET: 'Isert', AUTONOMIE: 'Autonomy', AUTONOMI: 'Autonomy', CLAREN: 'Clareon', CLAREON: 'Clareon' };
const PODER_MIN = 5;
const PODER_MAX = 40;

const aNumero = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Lee un segmento de la celda LIO («Isert 21.0», «MX60 22.5 x 1.25», «24.00 T2»…). */
export function leerSegmentoLio(segmento: string): Omit<LenteImport, 'orden'> | null {
  let t = segmento.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  let torico = false;
  let cilindro: number | null = null;
  let modelo: string | null = null;

  // Código tórico T0–T9 (Clareon/Alcon): se conserva como modelo.
  const tcode = t.match(/(?:^|\s)(T[0-9])(?=\s|$)/i);
  if (tcode) { torico = true; modelo = tcode[1].toUpperCase(); t = t.replace(tcode[0], ' '); }
  // «cyl 1.25», «1.25 cyl», «2.25 cil», «cilindro 1.5»
  const cil = t.match(new RegExp(String.raw`(?:CYL|CIL|CILINDRO)\.?\s*${NUM}`, 'i')) || t.match(new RegExp(String.raw`${NUM}\s*(?:CYL|CIL)\b`, 'i'));
  if (cil) { torico = true; const c = aNumero(cil[1]); cilindro = c && c > 0 ? c : null; t = t.replace(cil[0], ' '); }
  // «x 1.25» / «X 1.50-1.25» (cilindro de la familia MX60T, TorZCU…)
  const por = t.match(new RegExp(String.raw`(?:^|\s)[xX]\s*${NUM}(?:\s*-\s*\d{1,2}(?:[.,]\d{1,2})?)?`));
  if (por) { torico = true; cilindro = aNumero(por[1]); t = t.replace(por[0], ' '); }
  if (/TORIC/i.test(t)) { torico = true; t = t.replace(/TORICO|TORIC/gi, ' '); }

  const pm = t.match(new RegExp(String.raw`(?:^|[^A-Za-z0-9.,])${NUM}(?![0-9A-Za-z]|[.,]\d)`));
  let poder = pm ? aNumero(pm[1]) : null;
  if (pm) { const ini = (pm.index ?? 0) + pm[0].length - pm[1].length; t = `${t.slice(0, ini)} ${t.slice(ini + pm[1].length)}`; }
  if (poder != null && (poder < PODER_MIN || poder > PODER_MAX)) poder = null;

  const marca = t
    .replace(/(?<![A-Za-z0-9])[+]?\s*\d+(?:[.,]\d+)?\s*D?\b/g, ' ')
    .replace(/\b(D|DIOPTRIAS|LENTE|LIO|CALCULAR|CALCULO|CITAR|PEND\.?|PENDIENTE)\b\.?/gi, ' ')
    .replace(/[,;()@°+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (poder == null && !marca && !torico) return null;
  return { marca: ALIAS_MARCA[claveTexto(marca)] ?? marca, modelo, poder, torico, cilindro };
}

export function interpretarLio(
  lio: string | null | undefined,
  marcaColumna?: string | null,
  notas?: string | null,
): InterpretacionLio {
  const original = (lio ?? '').replace(/\s+/g, ' ').trim();
  const claves = claveTexto(`${marcaColumna ?? ''} ${notas ?? ''} ${original}`);
  const compraDirecta = /\bPAGO (DEL )?LENTE\b|\bCOMPRA DIRECTA\b|\bCOMPRA (DEL )?LENTE\b/.test(claves);
  const requiereTorico = /REQUIERE TORIC|PEND TORIC|PENDIENTE TORIC|CITAR REQUIERE/.test(claves);
  const res: InterpretacionLio = { lentes: [], compraDirecta, textoNoLente: null, pendientes: [] };

  if (!original) {
    if (requiereTorico) res.pendientes.push('lente tórico por calcular');
    return res;
  }
  const c = claveTexto(original);
  if (DIAS_RE.test(c) && !/\d{1,2}[.,]\d/.test(original)) {
    res.textoNoLente = original;
    res.pendientes.push(`la celda LIO trae un horario («${original}»), no un lente`);
    return res;
  }
  const soloCalculo = /^(CITAR )?(CALCULO|CALCULAR|PEND|PENDIENTE)\b/.test(c) && !/\d{1,2}[.,]\d/.test(original);

  const segmentos = original.split('/').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const leidos = soloCalculo ? [] : segmentos.map(leerSegmentoLio);
  // «A/B» = primero + respaldo; con tres, primero + segundo + respaldo.
  const ordenes: LenteImport['orden'][] = leidos.length === 2 ? ['PRIMERO', 'RESPALDO'] : ['PRIMERO', 'SEGUNDO', 'RESPALDO'];
  const marcaCol = (marcaColumna ?? '').trim();
  const marcaColValida = marcaCol && !RUIDO_MARCA.test(marcaCol.toUpperCase()) && !/\d/.test(marcaCol) && !/PAGO|COMPRA|CITAR|TORIC/i.test(marcaCol);
  leidos.forEach((l, i) => {
    if (!l) return;
    const marca = l.marca || (leidos.length === 1 && marcaColValida ? marcaCol : '');
    res.lentes.push({ ...l, marca, orden: ordenes[i] });
  });

  if (soloCalculo) res.pendientes.push('cálculo del lente pendiente');
  if (requiereTorico && !soloCalculo && !res.lentes.some((l) => l.torico)) res.pendientes.push('lente tórico por calcular');
  for (const l of res.lentes) {
    const nombre = l.orden === 'PRIMERO' ? 'primer lente' : l.orden === 'SEGUNDO' ? 'segundo lente' : 'lente de respaldo';
    if (l.poder == null) res.pendientes.push(`${nombre}: falta el poder (D)`);
    if (!l.marca) res.pendientes.push(`${nombre}: falta la marca/modelo`);
    if (l.torico && l.cilindro == null && !l.modelo) res.pendientes.push(`${nombre}: tórico sin cilindro`);
  }
  if (!soloCalculo && res.lentes.length === 0 && !res.pendientes.length) res.pendientes.push(`no se reconoció el lente («${original}»)`);
  return res;
}

/* ───────────────────────── Plan de lentes (stock → asignar/solicitar) ───────────────────────── */

export interface PiezaInventario {
  id: string;
  marca: string | null;
  modelo: string | null;
  potencia: number | null;
  stock: number;
}

export interface LentePlanImport {
  orden: LenteImport['orden'];
  modo: 'ASIGNAR' | 'SOLICITAR' | 'COMPRA_DIRECTA' | 'SIN_TRAMITE';
  torico: boolean;
  marca: boolean;
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  cilindro: number | null;
  inventario_item_id: string | null;
}

const compacto = (s: string | null | undefined) => claveTexto(s ?? '').replace(/ /g, '');

/** ¿La pieza corresponde a la marca escrita en el archivo? (todas sus palabras de 3+ letras) */
export function piezaCoincideConMarca(pieza: Pick<PiezaInventario, 'marca' | 'modelo'>, marcaArchivo: string): boolean {
  const palabras = claveTexto(marcaArchivo).split(' ').filter((p) => p.length >= 3);
  if (palabras.length === 0) return false;
  const pajar = compacto(`${pieza.marca ?? ''} ${pieza.modelo ?? ''}`);
  return palabras.every((p) => pajar.includes(p));
}

/** Nombres comerciales con su escritura correcta; el resto va en Título (y con números en MAYÚSCULAS). */
const NOMBRE_COMERCIAL: Record<string, string> = { 'CT LUCIA': 'CT Lucia', ISERT: 'iSert', CLAREON: 'Clareon', PANOPTIX: 'PanOptix', AUTONOMY: 'Autonomy' };
const titulo = (s: string) =>
  NOMBRE_COMERCIAL[claveTexto(s)] ??
  s.toLowerCase().replace(/(^|\s)(\S+)/g, (_m, a: string, w: string) => a + (/\d/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));

export interface ResultadoPlanLentes {
  plan: LentePlanImport[];
  /** Lentes que no se guardan (se avisa en «Por completar»). */
  sinGuardar: string[];
}

/**
 * Decide el modo de cada lente. `libres` (id de pieza → piezas sin comprometer) se descuenta
 * al asignar, para que dos cirugías del mismo archivo no se queden con la misma pieza.
 * `reservar=false` (cirugías aún sin fecha): todo va a SOLICITAR, sin comprometer inventario.
 */
export function planificarLentes(
  interp: InterpretacionLio,
  piezas: PiezaInventario[],
  libres: Map<string, number>,
  reservar: boolean,
): ResultadoPlanLentes {
  const plan: LentePlanImport[] = [];
  const sinGuardar: string[] = [];
  for (const l of interp.lentes) {
    const etiqueta = `${l.marca || 'sin marca'} ${l.poder ?? '?'}`.trim();
    if (!l.marca) { sinGuardar.push(`${l.orden.toLowerCase()}: ${etiqueta} (falta marca/modelo)`); continue; }
    const delMismoModelo = piezas.filter((p) => piezaCoincideConMarca(p, l.marca));
    const canon = delMismoModelo[0];
    const fabricante = canon?.marca?.trim() || titulo(l.marca);
    const modelo = l.modelo ?? (canon?.modelo?.trim() || null);
    const base = { orden: l.orden, torico: l.torico, marca: true, fabricante, modelo, cilindro: l.torico ? l.cilindro : null };

    if (interp.compraDirecta) {
      plan.push({ ...base, modo: 'COMPRA_DIRECTA', poder_d: l.poder, inventario_item_id: null });
      continue;
    }
    if (l.poder == null) { sinGuardar.push(`${l.orden.toLowerCase()}: ${l.marca} (falta el poder)`); continue; }
    if (l.torico && l.cilindro == null && !l.modelo) { sinGuardar.push(`${l.orden.toLowerCase()}: ${l.marca} ${l.poder} (tórico sin cilindro)`); continue; }

    const pieza = reservar
      ? delMismoModelo.find((p) => p.potencia != null && Math.abs(p.potencia - l.poder!) < 0.005 && (libres.get(p.id) ?? 0) > 0)
      : undefined;
    if (pieza) {
      libres.set(pieza.id, (libres.get(pieza.id) ?? 0) - 1);
      plan.push({ ...base, fabricante: pieza.marca?.trim() || fabricante, modelo: l.modelo ?? (pieza.modelo?.trim() || null), modo: 'ASIGNAR', poder_d: l.poder, inventario_item_id: pieza.id });
    } else {
      plan.push({ ...base, modo: 'SOLICITAR', poder_d: l.poder, inventario_item_id: null });
    }
  }
  return { plan, sinGuardar };
}

export function etiquetaModoLente(m: LentePlanImport['modo']): string {
  return m === 'ASIGNAR' ? 'Asignar' : m === 'SOLICITAR' ? 'Solicitar' : m === 'SIN_TRAMITE' ? 'Solo registro (historial)' : 'Compra directa';
}
