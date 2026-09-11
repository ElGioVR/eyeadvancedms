export interface ParsedLabel {
  marca: string;
  modelo: string;
  esferico: string;
  cilindrico: string;
  eje: string;
  material: string;
  color: string;
  codigo_barras: string;
  lote: string;
  caducidad: string;
  categoria?: string;
  rawText: string;
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

function normalizeOcrText(text: string): string {
  let t = text;
  t = t.replace(/[\r\n\t]/g, ' ');
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/["""''`]/g, "'");
  t = t.replace(/[™®©]/g, '');
  t = t.replace(/([A-Z])\s{1,2}([A-Z0-9])/g, '$1$2');
  t = t.replace(/(\d)\s{1,2}(\d)/g, '$1$2');
  t = t.replace(/\+\s{1,2}(\d)/g, '+$1');
  t = t.replace(/#\s{1,2}([A-Z0-9])/g, '#$1');
  t = t.replace(/S\s{1,2}N\s{1,2}(\d)/g, 'SN $1');
  t = t.replace(/(\d{4})\s*[-/]\s*(\d{2})\s*[-/]\s*(\d{2})/g, '$1-$2-$3');
  t = t.replace(/(\d{2})\s*[-/]\s*(\d{4})/g, '$1/$2');
  return t.trim();
}

function findBrand(text: string): string {
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

function findModel(text: string): string {
  const patterns = [
    /(?:modelo?|model|mod|md)\s*[:;\-=]?\s*([A-Z0-9][\w\-\.]{2,20})/i,
    /\b#?\s*([A-Z]{2,4}[\s\-]?[\d]{2,5}[A-Z]{0,3})\b/,
    /\b(SN\s?\d{4}[A-Z]{0,3})\b/i,
    /\b#([A-Z0-9]{2,10})\b/,
    /\b# ([A-Z0-9]{2,10})\b/,
    /\b(Abb[^\s]{2,15})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let model = m[1].replace(/\s/g, '');
      if (model.length >= 4) return model;
    }
  }
  return '';
}

function findSphere(text: string): string {
  const patterns = [
    /(?:esf[eé]?r?i?c?o?|s\.?e\.?|sphere|sph)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D?/i,
    /([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})\s*D\b/i,
    /([+\-]\s*\d{1,3}\s*[.,]\s*\d{1,2})(?:\s|$)/,
    /(?:^|\s)([+\-]\d{1,3}\.\d{1,2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let val = m[1].replace(/\s/g, '').replace(',', '.');
      if (!val.includes('.')) val += '.00';
      const sign = val.match(/^[+\-]/) ? val[0] : '';
      const num = val.replace(/^[+\-]/, '');
      const parts = num.split('.');
      if (parts[0] && parts[1] !== undefined) {
        return sign + parts[0] + '.' + parts[1].padEnd(2, '0').substring(0, 2);
      }
      return val;
    }
  }
  return '';
}

function findCylinder(text: string): string {
  const patterns = [
    /(?:c[ií]l[ií]n?d?r?i?c?o?|cyl|cil)\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
    /(?:cy[l1])\s*[:;\-=]?\s*([+\-]?\s*\d{1,3}\s*[.,]\s*\d{1,2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let val = m[1].replace(/\s/g, '').replace(',', '.');
      if (!val.includes('.')) val += '.00';
      return val;
    }
  }
  return '';
}

function findAxis(text: string): string {
  const patterns = [
    /(?:eje?|axis|ax|e\.?j\.?)\s*[:;\-=]?\s*(\d{1,3})\s*°?/i,
    /(?:^|\s)(\d{1,3})\s*°\s*(?:$|\s)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseInt(m[1]);
      if (val >= 0 && val <= 180) return m[1];
    }
  }
  return '';
}

function findMaterial(text: string): string {
  const lower = text.toLowerCase();

  for (const mat of UV_MATERIALS) {
    if (lower.includes(mat)) {
      const idx = lower.indexOf(mat);
      const original = text.substring(idx, idx + mat.length + 10);
      const match = original.match(/(?:uv\s*(?:&|and)?\s*blue\s*light\s*(?:filter)?|blue\s*light\s*(?:filter)?|uv\s*(?:filter|protection)?)/i);
      if (match) return match[0].trim();
    }
  }

  for (const mat of MATERIALS) {
    if (lower.includes(mat)) {
      const idx = lower.indexOf(mat);
      return text.substring(idx, idx + mat.length);
    }
  }

  const idxMatch = text.match(/\b1\.[5-7]\d\b/);
  if (idxMatch) return idxMatch[0];
  return '';
}

function findSerialNumber(text: string): string {
  const snPatterns = [
    /\bSN\s*:?\s*([\d\s]{8,16})/i,
    /\bS\.?N\.?\s*:?\s*([\d\s]{8,16})/i,
    /\bNo\.?\s*Serie\s*:?\s*([\d\s]{8,16})/i,
  ];
  for (const p of snPatterns) {
    const m = text.match(p);
    if (m) {
      const digits = m[1].replace(/\s/g, '');
      if (/^\d{8,14}$/.test(digits)) return digits;
    }
  }
  return '';
}

function findBarcode(text: string): string {
  const sn = findSerialNumber(text);
  if (sn) return sn;

  const patterns = [
    /\b(\d{10,14})\b/,
    /\b(\d{8,9})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return '';
}

function findLot(text: string): string {
  const patterns = [
    /(?:lote?|lot|l\.?)\s*[:;\-=]?\s*([A-Z0-9][\w\-]{2,15})/i,
    /\b[Ll][\-\.]?\d{2,4}[\-\.]?\d{2,4}\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return '';
}

function findExpiry(text: string): string {
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

function findColor(text: string): string {
  const colors = ['transparente', 'blanco', 'negro', 'azul', 'verde', 'gris', 'marrón', 'maron', 'rosa', 'rojo'];
  const lower = text.toLowerCase();
  for (const c of colors) {
    if (lower.includes(c)) {
      const idx = lower.indexOf(c);
      return text.substring(idx, idx + c.length);
    }
  }
  return '';
}

function findCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\biol\b|intraocular/.test(lower)) return 'Intraocular';
  if (/(?:lente\s*de\s*contacto|contacto\b|soft\s*daily|dailies)/i.test(lower)) return 'Contactología';
  if (/(?:gafas?|anteojos?|monofocal|bifocal|progresiv)/i.test(lower)) return 'Graduado';
  return '';
}

export function parseLensLabel(ocrText: string): ParsedLabel {
  const cleaned = normalizeOcrText(ocrText);

  return {
    marca: findBrand(cleaned),
    modelo: findModel(cleaned),
    esferico: findSphere(cleaned),
    cilindrico: findCylinder(cleaned),
    eje: findAxis(cleaned),
    material: findMaterial(cleaned),
    color: findColor(cleaned),
    codigo_barras: findBarcode(cleaned),
    lote: findLot(cleaned),
    caducidad: findExpiry(cleaned),
    categoria: findCategory(cleaned),
    rawText: cleaned,
  };
}
