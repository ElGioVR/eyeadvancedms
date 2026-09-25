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

function esNumeroValido(valor: string, min: number, max: number): boolean {
  const n = Number(valor);
  return Number.isFinite(n) && n >= min && n <= max;
}

function normalizeOcrText(text: string): string {
  let t = text;
  t = t.replace(/[\r\n\t]/g, ' ');
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/["""''`]/g, "'");
  t = t.replace(/[™®©]/g, '');

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

function findModel(text: string): string {
  const manufacturer = findManufacturer(text).toLowerCase();
  const patterns = [
    // Explicit model labels
    /(?:modelo?|model|mod|md)\s*[:;\-=]?\s*([A-Z0-9][\w\-\.]{2,20})/i,
    // Common LIO model patterns: letters + digits + optional letters
    /\b([A-Z]{2,4}[\s\-]?[\d]{2,5}[A-Z]{0,3})\b/,
    // More flexible: starts with letter, has at least one digit, 4-12 chars
    /\b([A-Z]{2,3}[A-Z0-9]*\d[A-Z0-9]*)\b/,  // Requires at least one digit: CNATT2, MN60AC, T422CY
    // With hash prefix
    /\b#([A-Z0-9]{2,10})\b/,
    /\b# ([A-Z0-9]{2,10})\b/,
    // Specific known patterns
    /\b(Abb[^\s]{2,15})\b/i,
    // Reference/Ref patterns
    /(?:ref|referencia)\s*[:;\-=]?\s*([A-Z0-9][\w\-\.]{2,20})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let model = m[1].replace(/\s/g, '');
      // Skip if it looks like a serial number, date, ADD+year, or manufacturer name
      if (model.length >= 4 && 
          !/^\d{6,}$/.test(model) && 
          !/\d{4}-\d{2}-\d{2}/.test(model) &&
          !/^ADD\d{4}$/.test(model) &&
          model.toLowerCase() !== manufacturer) {
        return model;
      }
    }
  }
  return '';
}

function findSphere(text: string): string {
  const patterns = [
    // Explicit labels
    /(?:esf[eé]?r?i?c?o?|s\.?e\.?|sphere|sph)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D?/i,
    /(?:potencia|power|pwr)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D?/i,
    // Number with D suffix
    /([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D\b/i,
    // +/- number at start of line or after space
    /([+\-]\s*\d{1,3}\s*[.,]\s*\d{1,2})(?:\s|$)/,
    /(?:^|\s)([+\-]\d{1,3}\.\d{1,2})/,
    // Plain number with decimals (fallback for power)
    /\b(\d{1,3}\s*[.,]\s*\d{1,2})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      // Get the original matched number part with its decimal places
      let rawNum = m[1].replace(/\s/g, '');
      // Normalize decimal separator
      rawNum = rawNum.replace(',', '.');
      // Ensure it has a decimal point
      if (!rawNum.includes('.')) rawNum += '.00';
      const sign = rawNum.match(/^[+\-]/) ? rawNum[0] : '';
      const num = rawNum.replace(/^[+\-]/, '');
      const parts = num.split('.');
      if (parts[0] && parts[1] !== undefined) {
        // Preserve original decimal places (up to 2, no padding)
        let decimals = parts[1];
        if (decimals.length > 2) decimals = decimals.substring(0, 2);
        // Don't pad - keep original precision
        const result = sign + parts[0] + '.' + decimals;
        // Validate range: -40 to +40 (use absolute value for validation)
        if (esNumeroValido(result.replace(/^[+\-]/, ''), 0, 40)) {
          return result;
        }
        return '';
      }
      return rawNum;
    }
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
  // Multiple patterns for nozzle/injector size
  const patterns = [
    // Standard "nozzle" or "inyector" label
    /\bnozzle\s*[:;\-=]?\s*([A-Z])\b/i,
    /\b([A-Z])\s+nozzle\b/i,
    /\binyector\s*[:;\-=]?\s*([A-Z])\b/i,
    /\b([A-Z])\s+inyector\b/i,
    // Single letter near "D" or similar on LIO labels
    /\b([A-Z])\s*(?:nozzle|inyector)\b/i,
    // Pattern like "D" alone on a line after power/cylinder
    /(?:^|\n)\s*([A-Z])\s*(?:\n|$)/,
  ];
  
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = m[1].toUpperCase();
      // Validate it's a reasonable nozzle size (A-Z)
      if (/^[A-Z]$/.test(val)) return val;
    }
  }
  return '';
}

function findAddIntermediate(text: string): string {
  // Multiple patterns for ADD values
  const patterns = [
    // Standard "ADD" label
    /([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*ADD\b/i,
    // "Add" with colon/equals
    /(?:add\s*(?:intermedia|int|intermediate)?)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    // "Add 1" or "Add 2" format
    /(?:add\s*[1i])\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    // Near/Inter labels
    /(?:intermedia|inter|int)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
  ];
  
  // First, try to find all ADD-like values and take the first valid one
  const allMatches = text.matchAll(/([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*(?:ADD|add|Add)\b/gi);
  const found: string[] = [];
  for (const m of allMatches) {
    let rawNum = m[1].replace(/\s/g, '');
    rawNum = rawNum.replace(',', '.');
    if (!rawNum.includes('.')) rawNum += '.00';
    const sign = rawNum.match(/^[+\-]/) ? rawNum[0] : '';
    const num = rawNum.replace(/^[+\-]/, '');
    const parts = num.split('.');
    if (parts[0] && parts[1] !== undefined) {
      let decimals = parts[1];
      if (decimals.length > 2) decimals = decimals.substring(0, 2);
      const result = sign + parts[0] + '.' + decimals;
      if (esNumeroValido(result.replace(/^\+/, ''), 0.5, 6)) {
        found.push(result.replace(/^\+/, ''));
      }
    }
  }
  if (found.length > 0) return found[0];
  
  // Try explicit patterns
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
        let decimals = parts[1];
        if (decimals.length > 2) decimals = decimals.substring(0, 2);
        const result = sign + parts[0] + '.' + decimals;
        if (esNumeroValido(result.replace(/^\+/, ''), 0.5, 6)) {
          return result.replace(/^\+/, '');
        }
      }
    }
  }
  return '';
}

function findAddNear(text: string): string {
  // Find second ADD value
  const matches = text.matchAll(/([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*ADD\b/gi);
  const found: string[] = [];
  for (const m of matches) {
    let rawNum = m[1].replace(/\s/g, '');
    rawNum = rawNum.replace(',', '.');
    if (!rawNum.includes('.')) rawNum += '.00';
    const sign = rawNum.match(/^[+\-]/) ? rawNum[0] : '';
    const num = rawNum.replace(/^[+\-]/, '');
    const parts = num.split('.');
    if (parts[0] && parts[1] !== undefined) {
      let decimals = parts[1];
      if (decimals.length > 2) decimals = decimals.substring(0, 2);
      const result = sign + parts[0] + '.' + decimals;
      if (esNumeroValido(result.replace(/^\+/, ''), 0.5, 6)) {
        found.push(result.replace(/^\+/, ''));
      }
    }
  }
  // Also try explicit "near" or "add 2" patterns
  if (found.length < 2) {
    const nearPatterns = [
      /(?:add\s*[2n]|near|cerca)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    ];
    for (const p of nearPatterns) {
      const m = text.match(p);
      if (m) {
        let rawNum = m[1].replace(/\s/g, '');
        rawNum = rawNum.replace(',', '.');
        if (!rawNum.includes('.')) rawNum += '.00';
        const sign = rawNum.match(/^[+\-]/) ? rawNum[0] : '';
        const num = rawNum.replace(/^[+\-]/, '');
        const parts = num.split('.');
        if (parts[0] && parts[1] !== undefined) {
          let decimals = parts[1];
          if (decimals.length > 2) decimals = decimals.substring(0, 2);
          const result = sign + parts[0] + '.' + decimals;
          if (esNumeroValido(result.replace(/^\+/, ''), 0.5, 6)) {
            const val = result.replace(/^\+/, '');
            if (!found.includes(val)) found.push(val);
          }
        }
      }
    }
  }
  return found[1] ?? '';
}

function findSerialNumber(text: string): string {
  const sinFechas = text.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{4}\b/g, ' ');
  
  // Multiple patterns for serial number - be more specific
  const patterns = [
    // Standard SN format with explicit SN label
    /\bSN\s*:?\s*([\d\s]{6,24})/i,
    // S/N with slash
    /\bS\s*\/\s*N\s*[:;\-=]?\s*([\d\s]{6,24})/i,
    // Serial number with explicit label
    /\b(?:serial|serie|s\/n|no\.?\s*serie)\s*[:;\-=]?\s*([A-Za-z0-9\s]{6,24})/i,
  ];
  
  for (const p of patterns) {
    const m = sinFechas.match(p);
    if (m) {
      const val = m[1].replace(/\s/g, '');
      // Accept alphanumeric serial numbers 6-20 chars, but must be mostly digits
      if (/^[A-Za-z0-9]{6,20}$/.test(val) && /\d/.test(val)) return val;
    }
  }
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

function findBarcodeFromText(text: string, serial: string): string {
  const limpio = text.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{4}\b/g, ' ');
  
  // Try different barcode length patterns
  const patterns = [
    /\b\d{12,14}\b/g,  // EAN-13, GTIN-14
    /\b\d{8,11}\b/g,   // EAN-8, UPC-E
    /\b[A-Za-z0-9]{10,20}\b/g,  // Alphanumeric codes
  ];
  
  for (const p of patterns) {
    for (const c of limpio.match(p) ?? []) {
      if (serial && c === serial) continue;
      // Skip if it looks like a date
      if (/^\d{4}\d{2}\d{2}$/.test(c)) continue;
      return c;
    }
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

  return {
    manufacturer,
    product_name: productName,
    model,
    sphere: findSphere(cleaned),
    cylinder: findCylinder(cleaned),
    add_intermediate: findAddIntermediate(cleaned),
    add_near: findAddNear(cleaned),
    nozzle: findNozzle(cleaned),
    serial_number: serial,
    expiration_date: findExpirationDate(cleaned),
    barcode: barcodeDecoder || findBarcodeFromText(cleaned, serial),
    barcode_format: barcodeFormat,
  };
}