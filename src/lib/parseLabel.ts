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
  rawText: string;
}

const BRANDS = [
  'alcon', 'zeiss', 'essilor', 'varilux', 'hoya', 'rodenstock', 'shamir',
  'nikon', 'seiko', 'miller', 'orion', 'vogue', 'citizen', 'stepper',
  'johnson', 'coopervision', 'bausch', 'safilo', 'ray-ban',
  'crizal', 'smartlife', 'eyry', 'harmony', 'izumi',
];

const MATERIALS = [
  'policarbonato', 'acrílico', 'acrilico', 'trivex', 'cristal', 'vidrio',
  'resina', 'mr-8', 'mr-174', 'mr-7', '1.67', '1.61', '1.74', '1.50', '1.59',
  'hidrofóbico', 'hidrofobico', 'oleofóbico', 'antirreflejante',
];

function cleanText(text: string): string {
  return text
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBrand(text: string): string {
  const lower = text.toLowerCase();
  for (const brand of BRANDS) {
    if (lower.includes(brand)) {
      // Return proper casing
      const idx = lower.indexOf(brand);
      return text.substring(idx, idx + brand.length)
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return '';
}

function findModel(text: string): string {
  // Look for model patterns: letters+digits, or known patterns
  const patterns = [
    /(?:modelo?|model|mod|md)\s*[:;\-]?\s*([A-Z0-9][\w\-\.]{2,20})/i,
    /\b([A-Z]{2,4}[\-]?[\d]{2,5}[A-Z]?)\b/,
    /\b(SN\d{4}[A-Z]{0,2})\b/i,
    /\b(Abb[^\s]{2,15})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return '';
}

function findSphere(text: string): string {
  // Match: -2.50, +1.75, -20.00, SE: -3.00, Esf: +1.50, etc.
  const patterns = [
    /(?:esf[eé]?r?i?c?o?|s\.?e\.?|sphere|sph)\s*[:;\-]?\s*([+\-]?\d{1,2}\.\d{1,2})/i,
    /(?:^|\s)([+\-]\d{1,2}\.\d{2})(?:\s|$)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].includes('.') ? m[1] : m[1] + '.00';
  }
  return '';
}

function findCylinder(text: string): string {
  const patterns = [
    /(?:c[ií]l[ií]n?d?r?i?c?o?|cyl|cil)\s*[:;\-]?\s*([+\-]?\d{1,2}\.\d{1,2})/i,
    /(?:cyl|cil)\s*[:;\-]?\s*([+\-]?\d{1,2}\.\d{1,2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return '';
}

function findAxis(text: string): string {
  const patterns = [
    /(?:eje?|axis|ax|e\.?j\.?)\s*[:;\-]?\s*(\d{1,3})\s*°?/i,
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
  for (const mat of MATERIALS) {
    if (lower.includes(mat)) {
      const idx = lower.indexOf(mat);
      return text.substring(idx, idx + mat.length);
    }
  }
  // Look for index patterns like 1.67, 1.74
  const idxMatch = text.match(/\b1\.[5-7]\d\b/);
  if (idxMatch) return idxMatch[0];
  return '';
}

function findBarcode(text: string): string {
  // Common barcode patterns: 12-13 digits (EAN-13, UPC-A)
  const m = text.match(/\b\d{12,13}\b/);
  return m ? m[0] : '';
}

function findLot(text: string): string {
  const patterns = [
    /(?:lote?|lot|l\.?)\s*[:;\-]?\s*([A-Z0-9][\w\-]{2,15})/i,
    /\b[Ll][\-\.]?\d{2,4}[\-\.]?\d{2,4}\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return '';
}

function findExpiry(text: string): string {
  // Match: 2025-12, 12/2025, EXP 12/2025, CAD: 2025-12-31
  const patterns = [
    /(?:cad[uc]?i?r?|exp|venc|expiry|valid)\s*[:;\-]?\s*(\d{4}[\-\/]\d{2}(?:[\-\/]\d{2})?)/i,
    /(\d{2}[\-\/]\d{4})/,
    /(\d{4}[\-\/]\d{2}[\-\/]\d{2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
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

export function parseLensLabel(ocrText: string): ParsedLabel {
  const cleaned = cleanText(ocrText);

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
    rawText: cleaned,
  };
}
