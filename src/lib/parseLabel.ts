export type TipoLenteDetectado = '' | 'LENTE_VISION' | 'LENTE_INTRAOCULAR';

// Mismo catálogo que la columna `tipo_lio` (migración 1800000000050 + 1800000000280).
export type TipoLioDetectado =
  | ''
  | 'MONOFOCAL'
  | 'MULTIFOCAL'
  | 'TORICA'
  | 'EDOF'
  | 'MULTIFOCAL_TORICA'
  | 'OTRO';

export interface ParsedLabel {
  manufacturer: string;
  product_name: string;
  model: string;
  sphere: string;
  cylinder: string;
  add_intermediate: string;
  add_near: string;
  nozzle: string;
  serial_number: string;
  expiration_date: string;
  barcode: string;
  barcode_format: string;
}

/**
 * Fuentes externas al OCR. `barcode`/`barcodeFormat` vienen del decoder
 * (html5-qrcode) sobre la misma foto: el número de serie NO se asume como
 * código de barras.
 */
export interface OpcionesParseEtiqueta {
  barcode?: string | null;
  barcodeFormat?: string | null;
}

const BRANDS = [
  'alcon', 'zeiss', 'essilor', 'varilux', 'hoya', 'rodenstock', 'shamir',
  'nikon', 'seiko', 'miller', 'orion', 'vogue', 'citizen', 'stepper',
  'johnson', 'coopervision', 'bausch', 'safilo', 'ray-ban',
  'crizal', 'smartlife', 'eyry', 'harmony', 'izumi',
];

const BRAND_OCR_FIXES: Record<string, string[]> = {
  'alcon': ['aIcon', 'alcon', 'ALCON', 'Alcon', 'a1con', 'alcon'],
  'zeiss': ['zei ss', 'zeis s', 'ZEISS', 'Zeiss'],
  'essilor': ['essi lor', 'ESSILOR', 'Essilor'],
  'hoya': ['HOYA', 'Hoya'],
  'johnson': ['john son', 'JOHNSON', 'Johnson'],
  'coopervision': ['cooper vision', 'COOPERVISION', 'CooperVision'],
  'bausch': ['BAUSCH', 'Bausch'],
};

const MATERIALS = [
  'policarbonato', 'acrílico', 'acrilico', 'trivex', 'cristal', 'vidrio',
  'resina', 'mr-8', 'mr-174', 'mr-7', '1.67', '1.61', '1.74', '1.50', '1.59',
  'hidrofóbico', 'hidrofobico', 'oleofóbico', 'antirreflejante',
];

const UV_MATERIALS = [
  'uv & blue light filter',
  'uv and blue light filter',
  'uv blue light filter',
  'blue light filter',
  'blue light',
  'uv filter',
  'uv protection',
];

/**
 * Palabras frecuentes en etiquetas de LIO: el OCR las lee con 1-2 letras mal
 * ("Torlc", "PanGptix", "nozzie"). Se corrigen por distancia de edición.
 */
const DICCIONARIO_OCR = [
  'Clareon', 'PanOptix', 'Toric', 'AcrySof', 'Vivity', 'Tecnis', 'Symfony', 'Synergy',
  'Eyhance', 'Alcon', 'nozzle', 'Monofocal', 'Multifocal', 'Trifocal', 'FILTER', 'LIGHT',
  'BLUE', 'Johnson', 'Zeiss', 'enVista', 'RayOne', 'Vivinex', 'Hoya',
];

function distanciaEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

function corregirPalabras(texto: string): string {
  return texto.replace(/[A-Za-z0-9]{4,}/g, (tok) => {
    if (/^\d+$/.test(tok)) return tok;
    const low = tok.toLowerCase();
    let mejor = '';
    let dist = 99;
    for (const w of DICCIONARIO_OCR) {
      const d = distanciaEdicion(low, w.toLowerCase());
      if (d < dist) { dist = d; mejor = w; }
    }
    const tolerancia = tok.length >= 7 ? 2 : 1;
    if (dist === 0) return tok;
    // Solo corrige si comparte la primera letra (evita "CNATT2" → otra palabra)
    const mismaInicial = low[0] === mejor[0].toLowerCase();
    if (dist <= tolerancia && (mismaInicial || tok.length >= 6) && !/\d.*\d/.test(tok)) return mejor;
    return tok;
  });
}

function esNumeroValido(valor: string, min: number, max: number): boolean {
  const n = Number(valor);
  return Number.isFinite(n) && n >= min && n <= max;
}

function normalizeOcrText(text: string): string {
  let t = text;
  t = t.replace(/[\r\n\t]/g, ' ');
  t = t.replace(/[™®©]/g, ' ');
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/["""''`]/g, "'");
  // "I0L", "IoL", "10L", "1OL" → IOL
  t = t.replace(/\b[I1l|][O0o][Ll]\b/g, 'IOL');
  t = t.replace(/\b(Toric|toric|TORIC)\s+[I1l|][O0o][Ll1I]\b/g, '$1 IOL');
  t = corregirPalabras(t);

  // Fechas ANTES de unir dígitos: si no, "SN 26169559 028 2030-01-06" se
  // convertiría en "261695590282030-01-06" y se perderían serie y caducidad.
  t = t.replace(/(\d{4})\s*[-/]\s*(\d{2})\s*[-/]\s*(\d{2})(?!\d)/g, '$1-$2-$3');
  t = t.replace(/(\d{4})\s+(\d{2})\s+(\d{2})(?!\d)/g, '$1-$2-$3');
  t = t.replace(/(\d{2})\s*[-/]\s*(\d{4})/g, '$1/$2');

  // Se protegen para que la unión de dígitos no las contamine.
  const fechas: string[] = [];
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{4}\b/g, (m) => {
    fechas.push(m);
    return `\u0001${fechas.length - 1}\u0001`;
  });

  // Solo fragmentos de OCR: token corto en mayúsculas + token que CONTIENE
  // dígito ("CN ATT2" -> "CNATT2"). No debe unir "IOL Alcon" ni "D CYL":
  // eso rompe la detección de LIO y la lectura de potencia.
  t = t.replace(
    /(^|\s)([A-Z]{1,2})\s{1,2}([A-Z][A-Z0-9\-]*\d[A-Z0-9\-]*)/g,
    '$1$2$3',
  );
  t = t.replace(/(\d)\s{1,2}(\d)/g, '$1$2');
  t = t.replace(/\+\s{1,2}(\d)/g, '+$1');
  t = t.replace(/#\s{1,2}([A-Z0-9])/g, '#$1');
  t = t.replace(/S\s{1,2}N\s{1,2}(\d)/g, 'SN $1');

  t = t.replace(/\u0001(\d+)\u0001/g, (_m, i) => fechas[Number(i)] ?? '');
  return t.trim();
}

function findManufacturer(text: string): string {
  const lower = text.toLowerCase();

  for (const [brand, variants] of Object.entries(BRAND_OCR_FIXES)) {
    for (const variant of variants) {
      if (lower.includes(variant.toLowerCase())) {
        const idx = lower.indexOf(variant.toLowerCase());
        return text.substring(idx, idx + variant.length)
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  }

  for (const brand of BRANDS) {
    if (lower.includes(brand)) {
      const idx = lower.indexOf(brand);
      return text.substring(idx, idx + brand.length)
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return '';
}

function findProductName(text: string, manufacturer: string): string {
  const patterns = [
    // Explicit product name labels
    /(?:product[o\s]?|producto|nombre)\s*[:;\-=]?\s*([A-Za-z][\w\s\-\.]{5,60})/i,
    // Known LIO product names (comprehensive list)
    /\b(Clareon\s+PanOptix\s+Toric\s+IOL|PanOptix\s+Toric\s+IOL|AcrySof\s+IQ\s+PanOptix|Tecnis\s+Symfony|Vivity|AcrySof\s+IQ|Clareon|PanOptix|Symfony|Vivity|Monofocal|Multifocal|Trifocal|Toric|EDOF|Synergy|LARA|Lisa|AT\s+Lisa|AT\s+LARA|enVista|RayOne|Vivinex|iSert|Aspire|MX60|ZFR|ZXT|ZXR)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let name = m[1].trim().replace(/\n/g, ' ');
      // Normalize known product names to proper casing
      const knownProducts: Record<string, string> = {
        'clareon panoptix toric iol': 'Clareon PanOptix Toric IOL',
        'panoptix toric iol': 'PanOptix Toric IOL',
        'acrysof iq panoptix': 'AcrySof IQ PanOptix',
        'tecnis symfony': 'Tecnis Symfony',
        'vivity': 'Vivity',
        'acrysof iq': 'AcrySof IQ',
        'clareon': 'Clareon',
        'panoptix': 'PanOptix',
        'symfony': 'Symfony',
        'synergy': 'Synergy',
        'lara': 'LARA',
        'lisa': 'Lisa',
        'at lisa': 'AT LISA',
        'at lara': 'AT LARA',
        'envista': 'enVista',
        'rayone': 'RayOne',
        'vivinex': 'Vivinex',
        'isert': 'iSert',
        'aspire': 'Aspire',
        'mx60': 'MX60',
        'zfr': 'ZFR',
        'zxt': 'ZXT',
        'zxr': 'ZXR',
        'monofocal': 'Monofocal',
        'multifocal': 'Multifocal',
        'trifocal': 'Trifocal',
        'toric': 'Toric',
        'edof': 'EDOF',
      };
      const lower = name.toLowerCase();
      if (knownProducts[lower]) return knownProducts[lower];
      // Fix common OCR errors
      name = name.replace(/\bIol\b/gi, 'IOL');
      name = name.replace(/\b(iol|add|cyl|sn|uv)\b/gi, (m) => m.toUpperCase());
      if (name.length >= 5) return name;
    }
  }
  // Fallback: take text around manufacturer + next few tokens
  if (manufacturer) {
    const idx = text.toLowerCase().indexOf(manufacturer.toLowerCase());
    if (idx >= 0) {
      const after = text.substring(idx + manufacturer.length).trim();
      const tokens = after.split(/\s+/).slice(0, 5).join(' ');
      if (tokens.length >= 3) {
        let result = manufacturer + ' ' + tokens;
        result = result.replace(/\bIol\b/gi, 'IOL');
        result = result.replace(/\b(iol|add|cyl|sn|uv)\b/gi, (m) => m.toUpperCase());
        return result;
      }
    }
  }
  return '';
}

/** Palabras que parecen código pero no son modelo. */
const NO_MODELO = new Set(['ADD', 'CYL', 'IOL', 'SN', 'UV', 'LOT', 'LOTE', 'REF', 'EXP', 'CAD', 'STERILE', 'FILTER', 'LIGHT', 'BLUE']);

/** Prefijos de modelos conocidos (Alcon, J&J, Zeiss, Hoya, Bausch…). */
const PREFIJOS_MODELO = /^(CN|SN|SA|TF|DF|AU|MN|MA|UF|DA|DE|CC|ZCB|ZCT|ZXR|ZXT|ZFR|ZMB|DIB|DCB|DIU|ICB|DEN|DET|AT|XY|PY|MX|EN|AR|BL|LI|RAO)/;

function findModel(text: string): string {
  const manufacturer = findManufacturer(text).toLowerCase();
  const sinFechas = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  const candidatos: Array<{ modelo: string; puntos: number }> = [];

  // 1) Etiquetado explícito
  const etiquetado = sinFechas.match(/(?:modelo?|model|mod|ref|referencia)\s*[:;#\-=]?\s*([A-Z0-9][A-Z0-9\-]{2,15})/i);
  if (etiquetado) candidatos.push({ modelo: etiquetado[1].toUpperCase(), puntos: 10 });

  // 1b) Modelo conocido cuyo último dígito el OCR leyó como "?" o "Z" (CNATT? → CNATT2)
  for (const m of sinFechas.matchAll(/\b([A-Z]{3,6})[?Z](?=[\s|\]).,;:]|$)/g)) {
    if (PREFIJOS_MODELO.test(m[1]) && /T$/.test(m[1])) candidatos.push({ modelo: `${m[1]}2`, puntos: 2 });
  }

  // 2) Tokens tipo código: letras + dígitos (CNATT2, MN60AC, T422CY, SN6AT3)
  for (const m of sinFechas.matchAll(/#?\b([A-Z][A-Z0-9\-]{2,11})\b/g)) {
    const tok = m[1].replace(/-/g, '');
    if (tok.length < 4 || tok.length > 10) continue;
    if (!/\d/.test(tok) || /^\d+$/.test(tok)) continue;
    if (NO_MODELO.has(tok) || /^ADD\d/.test(tok) || tok.toLowerCase() === manufacturer) continue;
    const letras = (tok.match(/[A-Z]/g) || []).length;
    if (letras < 2) continue;
    let puntos = 1;
    if (PREFIJOS_MODELO.test(tok)) puntos += 3;
    if (m[0].startsWith('#')) puntos += 2;
    if (/^[A-Z]{2,5}\d[A-Z0-9]{0,4}$/.test(tok)) puntos += 1;
    // Muchos ceros/dígitos repetidos suelen ser basura del código de barras
    if (/(\d)\1{2,}/.test(tok) || /0{3,}/.test(tok)) puntos -= 3;
    candidatos.push({ modelo: tok, puntos });
  }
  if (candidatos.length === 0) return '';
  candidatos.sort((a, b) => b.puntos - a.puntos);
  return candidatos[0].puntos > 0 ? candidatos[0].modelo : '';
}

/** Números que pertenecen a otra medida (ADD, CYL) y no son la esfera. */
function quitarOtrasMedidas(text: string): string {
  return text
    .replace(/(?:c[ií]l[ií]n?d?r?i?c?o?|cyl|cil)\s*[:;\-=]?\s*[+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2}/gi, ' ')
    .replace(/[+\-]?\s*\d{1,3}(?:\s*[.,]\s*\d{1,2})?\s*ADD\b/gi, ' ')
    .replace(/(?:add\w*)\s*[:;\-=]?\s*[+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2}/gi, ' ')
    .replace(/(?:eje|axis)\s*[:;\-=]?\s*\d{1,3}/gi, ' ')
    .replace(/(?:[íi]ndice|index)\s*[:;\-=]?\s*\d\.\d{1,2}/gi, ' ');
}

function formatearDioptria(raw: string): string {
  let rawNum = raw.replace(/\s/g, '').replace(',', '.');
  if (!rawNum.includes('.')) rawNum += '.0';
  const sign = /^[+\-]/.test(rawNum) ? rawNum[0] : '';
  const [ent, dec = ''] = rawNum.replace(/^[+\-]/, '').split('.');
  let decimals = dec.substring(0, 2);
  // "23.51" (la "D" leída como 1) → 23.5 ; los LIO van en pasos de 0.25/0.5
  const valor = Number(`${ent}.${decimals}`);
  if (decimals.length === 2 && Math.abs(valor * 4 - Math.round(valor * 4)) > 0.001) {
    const uno = Number(`${ent}.${decimals[0]}`);
    if (Math.abs(uno * 4 - Math.round(uno * 4)) < 0.001) decimals = decimals[0];
  }
  return `${sign}${ent}.${decimals || '0'}`;
}

function findSphere(text: string): string {
  const limpio = quitarOtrasMedidas(text);
  const patterns = [
    /(?:esf[eé]?r?i?c?o?|s\.?e\.?|sphere|sph)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D?/i,
    /(?:potencia|power|pwr)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D?/i,
    // Número con sufijo D (+23.5D) — la forma típica de un LIO
    /([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D\b/i,
    /([+\-]\s*\d{1,3}\s*[.,]\s*\d{1,2})(?:\s|$|[^\d])/,
  ];
  for (const p of patterns) {
    const m = limpio.match(p);
    if (!m) continue;
    const result = formatearDioptria(m[1]);
    if (esNumeroValido(result.replace(/^[+\-]/, ''), 0, 40)) return result;
    return '';
  }
  return '';
}

function findCylinder(text: string): string {
  const patterns = [
    // Explicit cylinder labels
    /(?:c[ií]l[ií]n?d?r?i?c?o?|cyl|cil)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    /(?:cy[l1])\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    // Toric labels often include cylinder
    /(?:toric|torico)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    // Number followed by "D" near cylinder keywords
    /(?:cyl|cil|toric)\D{0,10}([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let rawNum = m[1].replace(/\s/g, '');
      rawNum = rawNum.replace(',', '.');
      if (!rawNum.includes('.')) rawNum += '.00';
      const sign = rawNum.match(/^[+\-]/) ? rawNum[0] : '';
      const num = rawNum.replace(/^[+\-]/, '');
      const parts = num.split('.');
      if (parts[0] && parts[1] !== undefined) {
        // Preserve original decimal places (up to 2, no padding)
        let decimals = parts[1];
        if (decimals.length > 2) decimals = decimals.substring(0, 2);
        const result = sign + parts[0] + '.' + decimals;
        // Validate range: absolute value 0 to 10
        if (esNumeroValido(result.replace('-', ''), 0, 10)) {
          return result;
        }
        return '';
      }
      return rawNum;
    }
  }
  return '';
}

function findNozzle(text: string): string {
  const patterns = [
    /\bnozzle\s*[:;\-=]?\s*([A-Z])\b/i,
    /(?:^|[^A-Za-z])([A-Z])\W{0,3}nozzle\b/,
    /\binyector\s*[:;\-=]?\s*([A-Z])\b/i,
    /(?:^|[^A-Za-z])([A-Z])\W{0,3}inyector\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && /^[A-Z]$/i.test(m[1])) return m[1].toUpperCase();
  }
  return '';
}

/** Todos los valores ADD válidos del texto, en orden de aparición (sin repetidos). */
function valoresAdd(text: string): string[] {
  const found: string[] = [];
  const push = (raw: string) => {
    let n = raw.replace(/\s/g, '').replace(',', '.').replace(/^\+/, '');
    // "217 ADD" (se perdió el punto) → 2.17
    if (/^\d{3}$/.test(n)) n = `${n[0]}.${n.slice(1)}`;
    if (!n.includes('.')) return;
    const [e, d] = n.split('.');
    const v = `${e}.${d.substring(0, 2)}`;
    if (esNumeroValido(v, 0.5, 6) && !found.includes(v)) found.push(v);
  };
  for (const m of text.matchAll(/([+\-]?\s*\d{1,3}(?:\s*[.,]\s*\d{1,2})?)\s*ADD\b/gi)) push(m[1]);
  for (const m of text.matchAll(/(?:add\s*(?:intermedia|int|intermediate|[12in])?)\s*[:;\-=]\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/gi)) push(m[1]);
  for (const m of text.matchAll(/(?:intermedia|near|cerca)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/gi)) push(m[1]);
  return found;
}

function findAddIntermediate(text: string): string {
  const v = valoresAdd(text);
  if (v.length >= 2) return [...v].sort((a, b) => Number(a) - Number(b))[0];
  return v[0] ?? '';
}

function findAddNear(text: string): string {
  const v = valoresAdd(text);
  if (v.length < 2) return '';
  const orden = [...v].sort((a, b) => Number(a) - Number(b));
  return orden[orden.length - 1];
}

function findSerialNumber(text: string): string {
  const sinFechas = text.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{4}\b/g, ' ');
  const patterns = [
    /\bS\s?\/?\s?N\s*[:\]]?\s*([\d\s]{6,24})/i,
    // Variantes de OCR del recuadro [SN]: "EN]", "5H]", "BN]", "SM]"
    /\[?\s*(?:5N|SH|5H|EN|BN|BR|SM|SW)\s*\]\s*([\d\s]{6,24})/,
    /\b(?:serial|serie|s\/n|no\.?\s*serie)\s*[:;\-=]?\s*([A-Za-z0-9\s]{6,24})/i,
  ];
  for (const p of patterns) {
    const m = sinFechas.match(p);
    if (m) {
      const val = m[1].trim().split(/\s{2,}/)[0].replace(/\s/g, '');
      if (/^[A-Za-z0-9]{6,20}$/.test(val) && /\d/.test(val)) return val;
    }
  }
  // Sin etiqueta: formato típico de serie de LIO "26169559 028" (8 + 3 dígitos)
  // (el normalizador une los dígitos, así que llega como 11 dígitos seguidos)
  const suelto = sinFechas.match(/(?:^|[^\d])(\d{8})\s?(\d{3})(?!\d)/);
  if (suelto) return suelto[1] + suelto[2];
  return '';
}

function findExpirationDate(text: string): string {
  const patterns = [
    /(?:cad[uc]?i?r?|exp|venc|expiry|valid|vencimiento|expiracion)\s*[:;\-=]?\s*(\d{4}[\-\/]\d{2}(?:[\-\/]\d{2})?)/i,
    /(\d{4}[\-\/]\d{2}[\-\/]\d{2})/,
    /(\d{2}[\-\/]\d{4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let date = m[1];
      if (/^\d{4}[\-\/]\d{2}$/.test(date)) {
        date += '-01';
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [, y, mo, d] = date.match(/(\d{4})-(\d{2})-(\d{2})/) || [];
        const year = parseInt(y);
        const month = parseInt(mo);
        const day = parseInt(d);
        if (year >= 2020 && year <= 2040 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return date;
        }
      }
    }
  }
  return '';
}

/** Dígito verificador GS1 (EAN-8, UPC-A, EAN-13, GTIN-14). */
function gtinValido(c: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(c)) return false;
  const digitos = c.split('').map(Number);
  const control = digitos.pop() as number;
  const suma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control;
}

/**
 * Código de barras leído como TEXTO (respaldo cuando el decoder no lo capta):
 * solo se acepta un GTIN/EAN con dígito verificador correcto; cualquier otra
 * cifra suelta del OCR es demasiado propensa a errores.
 */
function findBarcodeFromText(text: string, serial: string): string {
  const limpio = text.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{4}\b/g, ' ');
  for (const c of limpio.match(/\b\d{8,14}\b/g) ?? []) {
    if (serial && (c === serial || c.includes(serial) || serial.includes(c))) continue;
    if (gtinValido(c)) return c;
  }
  return '';
}

export function validarCodigoBarras(v: string | null | undefined): string {
  if (!v) return '';
  const t = v.trim();
  if (t.length < 4 || t.length > 48) return '';
  if (!/^[A-Za-z0-9\-+.\/ ]+$/.test(t)) return '';
  if (t.replace(/\s/g, '').length < 4) return '';
  return t;
}

export function normalizarFormatoBarcode(f: string | null | undefined): string {
  if (!f) return '';
  return f.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '').substring(0, 20);
}

/**
 * Conocimiento de catálogo para completar lo que el OCR no alcanzó a leer.
 * Solo rellena campos vacíos; nunca sobrescribe lo leído en la etiqueta.
 */
const FAMILIAS_MARCA: Array<{ patron: RegExp; marca: string }> = [
  { patron: /\b(clareon|acrysof|panoptix|vivity)\b/i, marca: 'Alcon' },
  { patron: /\b(tecnis|symfony|synergy|eyhance)\b/i, marca: 'Johnson & Johnson' },
  { patron: /\b(envista)\b/i, marca: 'Bausch + Lomb' },
  { patron: /\b(rayone)\b/i, marca: 'Rayner' },
  { patron: /\b(vivinex)\b/i, marca: 'Hoya' },
];

/** Cilindro (plano del LIO) según el sufijo tórico T2…T9 de Alcon. */
const CILINDRO_TORICO_ALCON: Record<string, string> = {
  T2: '1.00', T3: '1.50', T4: '2.25', T5: '3.00', T6: '3.75', T7: '4.50', T8: '5.25', T9: '6.00',
};

function completarConCatalogo(r: ParsedLabel, texto: string): ParsedLabel {
  const out = { ...r };
  const contexto = `${texto} ${out.product_name} ${out.model}`;
  if (!out.manufacturer) {
    const fam = FAMILIAS_MARCA.find((f) => f.patron.test(contexto));
    if (fam) out.manufacturer = fam.marca;
    else if (/^(CN|SN6|SA6|TFN|DFT|AU00|MN6|MA6|UFN)/.test(out.model)) out.manufacturer = 'Alcon';
  }
  if (!out.product_name) {
    const partes = ['Clareon', 'AcrySof', 'IQ', 'PanOptix', 'Vivity', 'Tecnis', 'Symfony', 'Toric']
      .filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(texto));
    if (partes.length >= 2) out.product_name = `${partes.join(' ')}${/\bIOL\b/.test(texto) ? ' IOL' : ''}`;
  }
  const esAlcon = /alcon/i.test(out.manufacturer);
  const torico = /\btoric/i.test(contexto);
  const sufijo = out.model.match(/(T[2-9])$/);
  if (!out.cylinder && esAlcon && torico && sufijo) out.cylinder = CILINDRO_TORICO_ALCON[sufijo[1]];
  // PanOptix (trifocal) tiene ADD fijas: +2.17 intermedia y +3.25 cercana
  // (solo si el OCR no leyó ninguna; si leyó una, se respeta lo leído)
  if (/panoptix/i.test(contexto) && !out.add_intermediate && !out.add_near) {
    out.add_intermediate = '2.17';
    out.add_near = '3.25';
  }
  return out;
}

export function parseLensLabel(
  ocrText: string,
  opciones: OpcionesParseEtiqueta = {},
): ParsedLabel {
  const cleaned = normalizeOcrText(ocrText);

  const manufacturer = findManufacturer(cleaned);
  const productName = findProductName(cleaned, manufacturer);
  const model = findModel(cleaned);
  const serial = findSerialNumber(cleaned);
  const barcodeDecoder = validarCodigoBarras(opciones.barcode);
  const barcodeFormat = normalizarFormatoBarcode(opciones.barcodeFormat);
  const gs1 = parseGs1(opciones.barcode ?? '');

  const base: ParsedLabel = {
    manufacturer,
    product_name: productName,
    model,
    sphere: findSphere(cleaned),
    cylinder: findCylinder(cleaned),
    add_intermediate: findAddIntermediate(cleaned),
    add_near: findAddNear(cleaned),
    nozzle: findNozzle(cleaned),
    serial_number: serial || gs1.serie || '',
    expiration_date: findExpirationDate(cleaned) || gs1.caducidad || '',
    barcode: barcodeDecoder || findBarcodeFromText(cleaned, serial),
    barcode_format: barcodeFormat,
  };
  // El número de serie nunca se usa como código de barras
  if (!barcodeDecoder && base.barcode && base.barcode === base.serial_number) base.barcode = '';
  return completarConCatalogo(base, cleaned);
}

/**
 * Códigos GS1 (GS1-128 / DataMatrix) de los empaques médicos:
 * (01) GTIN · (17) caducidad AAMMDD · (10) lote · (21) serie.
 */
export function parseGs1(codigo: string): { gtin?: string; caducidad?: string; lote?: string; serie?: string } {
  const t = (codigo || '').replace(/^\]([A-Za-z]\d)/, '').replace(/[()]/g, (c) => (c === '(' ? '\u001d(' : ')'));
  if (!/^(\u001d?\(?01\)?\d{14}|01\d{14})/.test(t)) return {};
  const out: { gtin?: string; caducidad?: string; lote?: string; serie?: string } = {};
  let resto = t.replace(/\(/g, '').replace(/\)/g, '');
  const leerVariable = () => {
    const fin = resto.indexOf('\u001d');
    const v = fin === -1 ? resto : resto.slice(0, fin);
    resto = fin === -1 ? '' : resto.slice(fin + 1);
    return v;
  };
  let guard = 0;
  while (resto.length > 0 && guard++ < 10) {
    resto = resto.replace(/^\u001d+/, '');
    const ai = resto.slice(0, 2);
    resto = resto.slice(2);
    if (ai === '01') { out.gtin = resto.slice(0, 14); resto = resto.slice(14); }
    else if (ai === '17' || ai === '11') {
      const d = resto.slice(0, 6); resto = resto.slice(6);
      if (ai === '17' && /^\d{6}$/.test(d)) {
        const dia = d.slice(4, 6) === '00' ? '01' : d.slice(4, 6);
        out.caducidad = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${dia}`;
      }
    } else if (ai === '10') out.lote = leerVariable();
    else if (ai === '21') out.serie = leerVariable();
    else break;
  }
  return out;
}

/** Clave para comparar valores entre lecturas (23.5 == 23.50, mayúsculas, espacios). */
function claveCampo(campo: keyof ParsedLabel, v: string): string {
  if (['sphere', 'cylinder', 'add_intermediate', 'add_near'].includes(campo)) {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.abs(n)) : v;
  }
  return v.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Combina varias lecturas OCR de la MISMA foto (distintos preprocesados y
 * recortes): cada campo se decide por votación; en empate gana la lectura que
 * aparece primero (se pasan en orden de confiabilidad). Además se analiza la
 * unión de todos los textos para campos que ninguna lectura aislada completó.
 */
export function combinarLecturas(textos: string[], opciones: OpcionesParseEtiqueta = {}): ParsedLabel {
  const lecturas = textos.filter((t) => t && t.trim()).map((t) => parseLensLabel(t, opciones));
  const union = parseLensLabel(textos.join('\n'), opciones);
  if (lecturas.length === 0) return union;
  const campos = Object.keys(union) as Array<keyof ParsedLabel>;
  const final = { ...union };
  for (const campo of campos) {
    const votos = new Map<string, { valor: string; n: number; orden: number }>();
    lecturas.forEach((l, orden) => {
      const v = l[campo];
      if (!v) return;
      const k = claveCampo(campo, v);
      const actual = votos.get(k);
      if (actual) actual.n += 1;
      else votos.set(k, { valor: v, n: 1, orden });
    });
    const ranking = Array.from(votos.values()).sort((a, b) => b.n - a.n || a.orden - b.orden);
    // Nombre de producto: si una variante más completa contiene a la ganadora
    // ("Clareon" ⊂ "Clareon PanOptix Toric IOL"), se prefiere la completa.
    if (campo === 'product_name' && ranking.length > 1) {
      const top = ranking[0];
      const mayor = ranking
        .filter((c) => c !== top && c.valor.toUpperCase().includes(top.valor.toUpperCase()))
        .sort((a, b) => b.valor.length - a.valor.length)[0];
      if (mayor) ranking.unshift(mayor);
    }
    if (ranking.length > 0) {
      // La esfera de un LIO es positiva salvo que la mayoría diga lo contrario
      let valor = ranking[0].valor;
      if (campo === 'sphere' && !/^[+\-]/.test(valor)) {
        const conSigno = lecturas.map((l) => l.sphere).find((s) => s && claveCampo('sphere', s) === claveCampo('sphere', valor) && /^\+/.test(s));
        if (conSigno) valor = conSigno;
      }
      final[campo] = valor;
    }
  }
  if (!opciones.barcode && final.barcode && final.barcode === final.serial_number) final.barcode = '';
  return completarConCatalogo(final, textos.join('\n'));
}
