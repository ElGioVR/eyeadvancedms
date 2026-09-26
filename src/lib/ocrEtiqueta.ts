'use client';

import { aGris, binarizar, recortar, ubicarEtiqueta, type ImagenGris, type PalabraOcr, type Caja } from '@/lib/ocrImagen';

/**
 * Lectura OCR multipasada de una foto de etiqueta (navegador).
 *
 * 1. Foto completa en gris (PSM 11 = texto disperso) → además da las palabras
 *    con su posición para ubicar la etiqueta.
 * 2. Foto completa binarizada con "tinta clara" → lee texto blanco sobre fondo
 *    oscuro (p. ej. el modelo en recuadro azul).
 * 3-5. Recorte de la etiqueta ampliado: tinta oscura (PSM 11 y PSM 6) y clara.
 *
 * Devuelve los textos ordenados de más a menos confiable para que
 * `combinarLecturas` vote campo por campo.
 */
const MAX_LADO = 2200;
const ANCHO_RECORTE = 1800;

export interface ResultadoOcr {
  textos: string[];
  /** Recorte de la etiqueta como imagen (para reintentar el código de barras). */
  recorte: File | null;
}

type Progreso = (paso: number, total: number, mensaje: string) => void;

function aCanvas(img: ImagenGris): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rgba = ctx.createImageData(img.width, img.height);
    for (let i = 0, j = 0; i < img.data.length; i += 1, j += 4) {
      const v = img.data[i];
      rgba.data[j] = v;
      rgba.data[j + 1] = v;
      rgba.data[j + 2] = v;
      rgba.data[j + 3] = 255;
    }
    ctx.putImageData(rgba, 0, 0);
  }
  return canvas;
}

async function aArchivo(img: ImagenGris, nombre: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>((r) => aCanvas(img).toBlob(r, 'image/png'));
  return blob ? new File([blob], nombre, { type: 'image/png' }) : null;
}

async function cargarGris(file: File): Promise<ImagenGris | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return aGris(ctx.getImageData(0, 0, w, h).data, w, h);
  } finally {
    bitmap.close();
  }
}

export async function leerEtiqueta(file: File, alProgresar?: Progreso): Promise<ResultadoOcr> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: () => {} });
  const textos: Array<{ orden: number; texto: string }> = [];
  const palabras: PalabraOcr[] = [];
  let recorte: File | null = null;

  const leer = async (
    img: ImagenGris | File,
    psm: string,
    orden: number,
    conPalabras = false,
  ) => {
    await worker.setParameters({ tessedit_pageseg_mode: psm as never });
    const entrada = img instanceof File ? img : aCanvas(img);
    const { data } = await worker.recognize(entrada, {}, conPalabras ? { text: true, blocks: true } : { text: true });
    textos.push({ orden, texto: data.text || '' });
    if (conPalabras && data.blocks) {
      for (const b of data.blocks)
        for (const p of b.paragraphs)
          for (const l of p.lines)
            for (const w of l.words) palabras.push({ texto: w.text, confianza: w.confidence, caja: w.bbox as Caja });
    }
  };

  try {
    const gris = await cargarGris(file);
    if (!gris) {
      // Navegador sin createImageBitmap: una sola lectura de la foto original
      alProgresar?.(1, 1, 'Leyendo etiqueta…');
      await leer(file, '3', 0);
    } else {
      const total = 5;
      alProgresar?.(1, total, 'Buscando la etiqueta…');
      await leer(gris, '11', 3, true);
      alProgresar?.(2, total, 'Leyendo texto sobre fondo oscuro…');
      await leer(binarizar(gris, 'clara'), '11', 4, true);

      const caja = ubicarEtiqueta(palabras, gris.width, gris.height);
      if (caja) {
        const ampliada = recortar(gris, caja, ANCHO_RECORTE);
        recorte = await aArchivo(ampliada, 'etiqueta-recorte.png');
        const oscura = binarizar(ampliada, 'oscura');
        alProgresar?.(3, total, 'Analizando la etiqueta de cerca…');
        await leer(oscura, '11', 0);
        alProgresar?.(4, total, 'Verificando datos…');
        await leer(oscura, '6', 1);
        alProgresar?.(5, total, 'Verificando datos…');
        await leer(binarizar(ampliada, 'clara'), '11', 2);
      } else {
        alProgresar?.(3, total, 'Analizando la etiqueta…');
        await leer(binarizar(gris, 'oscura'), '6', 0);
      }
    }
  } finally {
    await worker.terminate();
  }

  return {
    textos: textos.sort((a, b) => a.orden - b.orden).map((t) => t.texto),
    recorte,
  };
}
