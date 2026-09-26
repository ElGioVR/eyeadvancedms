/**
 * Procesamiento de imagen para OCR de etiquetas (funciones PURAS: sin DOM).
 * Se usan desde el navegador (LabelScanner) y se prueban en Node.
 *
 * Idea: Tesseract lee mal (a) texto claro sobre fondo oscuro —p. ej. el modelo
 * "CNATT2" blanco sobre recuadro azul— y (b) fotos con sombras/reflejos. Por eso
 * se generan varias versiones binarizadas (tinta oscura y tinta clara) con
 * umbral adaptativo local, y además se recorta la etiqueta para leerla a mayor
 * resolución.
 */

export interface ImagenGris {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** RGBA (ImageData.data) → escala de grises (luma BT.601). */
export function aGris(rgba: Uint8ClampedArray, width: number, height: number): ImagenGris {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j += 1) {
    data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return { data, width, height };
}

/**
 * Binarización adaptativa (media local por imagen integral).
 * - tinta 'oscura': píxeles más oscuros que su entorno → negro (texto normal)
 * - tinta 'clara':  píxeles más claros que su entorno → negro (texto invertido)
 * Resultado: texto negro sobre fondo blanco, listo para Tesseract.
 */
export function binarizar(
  img: ImagenGris,
  tinta: 'oscura' | 'clara',
  opciones: { radio?: number; umbral?: number } = {},
): ImagenGris {
  const { data: g, width: w, height: h } = img;
  const r = opciones.radio ?? Math.max(8, Math.round(Math.max(w, h) / 40));
  const t = opciones.umbral ?? 15;
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let fila = 0;
    for (let x = 0; x < w; x += 1) {
      fila += g[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + fila;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      const media = (I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0]) / n;
      const v = g[y * w + x];
      const esTinta = tinta === 'oscura' ? v < media - t : v > media + t;
      out[y * w + x] = esTinta ? 0 : 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Recorta (y opcionalmente escala con interpolación bilineal) una región. */
export function recortar(img: ImagenGris, caja: Caja, anchoDestino?: number): ImagenGris {
  const x0 = Math.max(0, Math.floor(caja.x0));
  const y0 = Math.max(0, Math.floor(caja.y0));
  const x1 = Math.min(img.width, Math.ceil(caja.x1));
  const y1 = Math.min(img.height, Math.ceil(caja.y1));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const escala = anchoDestino ? anchoDestino / cw : 1;
  const w = Math.max(1, Math.round(cw * escala));
  const h = Math.max(1, Math.round(ch * escala));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(ch - 1, y / escala);
    const yA = Math.floor(sy);
    const yB = Math.min(ch - 1, yA + 1);
    const fy = sy - yA;
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(cw - 1, x / escala);
      const xA = Math.floor(sx);
      const xB = Math.min(cw - 1, xA + 1);
      const fx = sx - xA;
      const p = (yy: number, xx: number) => img.data[(y0 + yy) * img.width + (x0 + xx)];
      const top = p(yA, xA) * (1 - fx) + p(yA, xB) * fx;
      const bot = p(yB, xA) * (1 - fx) + p(yB, xB) * fx;
      out[y * w + x] = top * (1 - fy) + bot * fy;
    }
  }
  return { data: out, width: w, height: h };
}

export interface PalabraOcr {
  texto: string;
  confianza: number;
  caja: Caja;
}

/**
 * Ubica la etiqueta a partir de las palabras que Tesseract leyó con confianza:
 * toma su envolvente descartando atípicos (percentiles 10–90 del centro) y
 * agrega un margen. Devuelve null si no hay palabras suficientes o si la
 * región ya cubre casi toda la foto (no vale la pena recortar).
 */
export function ubicarEtiqueta(palabras: PalabraOcr[], ancho: number, alto: number): Caja | null {
  const buenas = palabras.filter(
    (p) => p.confianza >= 55 && /[A-Za-z0-9]{3,}/.test(p.texto) && p.caja.x1 > p.caja.x0 && p.caja.y1 > p.caja.y0,
  );
  if (buenas.length < 3) return null;
  const cx = buenas.map((p) => (p.caja.x0 + p.caja.x1) / 2).sort((a, b) => a - b);
  const cy = buenas.map((p) => (p.caja.y0 + p.caja.y1) / 2).sort((a, b) => a - b);
  const pct = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(q * (arr.length - 1))))];
  const [lx, hx, ly, hy] = [pct(cx, 0.1), pct(cx, 0.9), pct(cy, 0.1), pct(cy, 0.9)];
  const dentro = buenas.filter((p) => {
    const mx = (p.caja.x0 + p.caja.x1) / 2;
    const my = (p.caja.y0 + p.caja.y1) / 2;
    const tolX = (hx - lx) * 0.35 + 20;
    const tolY = (hy - ly) * 0.35 + 20;
    return mx >= lx - tolX && mx <= hx + tolX && my >= ly - tolY && my <= hy + tolY;
  });
  if (dentro.length < 3) return null;
  let x0 = Math.min(...dentro.map((p) => p.caja.x0));
  let y0 = Math.min(...dentro.map((p) => p.caja.y0));
  let x1 = Math.max(...dentro.map((p) => p.caja.x1));
  let y1 = Math.max(...dentro.map((p) => p.caja.y1));
  const mx = (x1 - x0) * 0.1 + 12;
  const my = (y1 - y0) * 0.18 + 12;
  x0 = Math.max(0, x0 - mx);
  y0 = Math.max(0, y0 - my);
  x1 = Math.min(ancho, x1 + mx);
  y1 = Math.min(alto, y1 + my);
  if ((x1 - x0) * (y1 - y0) > ancho * alto * 0.8) return null;
  return { x0, y0, x1, y1 };
}
