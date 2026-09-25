/**
 * Preprocesamiento de la foto de una etiqueta antes del OCR:
 *  - reduce a como máximo 1600 px por el lado mayor
 *  - escala de grises
 *  - autocontraste por percentiles (2% / 98%) para textos tenues
 *
 * Modestoa propósito: no se aplica binarización ni filtros que puedan
 * destruir códigos pequeños. Cualquier fallo devuelve el archivo original.
 */
const MAX_DIMENSION = 1600;
const PIXELES_POR_SEGUNDO = 4; // muestreo para el histograma

function mejorarContraste(data: Uint8ClampedArray): void {
  const n = data.length;
  const histograma = new Uint32Array(256);
  let muestras = 0;

  for (let i = 0; i < n; i += 4 * PIXELES_POR_SEGUNDO) {
    const gris = Math.round(
      (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000,
    );
    histograma[gris] += 1;
    muestras += 1;
  }
  if (muestras === 0) return;

  let acumulado = 0;
  let inferior = 0;
  let superior = 255;
  for (let v = 0; v < 256; v += 1) {
    acumulado += histograma[v];
    if (acumulado >= muestras * 0.02) { inferior = v; break; }
  }
  acumulado = 0;
  for (let v = 255; v >= 0; v -= 1) {
    acumulado += histograma[v];
    if (acumulado >= muestras * 0.02) { superior = v; break; }
  }
  const rango = superior - inferior;
  if (rango < 16) return; // imagen plana: no se toca

  const factor = 255 / rango;
  for (let i = 0; i < n; i += 4) {
    const gris = Math.round(
      (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000,
    );
    const valor = Math.max(0, Math.min(255, (gris - inferior) * factor));
    data[i] = valor;
    data[i + 1] = valor;
    data[i + 2] = valor;
  }
}

export async function preprocessLabelImage(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return file;
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    bitmap = null;

    const imagen = ctx.getImageData(0, 0, ancho, alto);
    mejorarContraste(imagen.data);
    ctx.putImageData(imagen, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    if (!blob) return file;
    return new File([blob], file.name || 'etiqueta.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    if (bitmap) bitmap.close();
  }
}
