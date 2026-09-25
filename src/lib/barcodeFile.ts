/**
 * Decodifica el código de barras / QR impreso en la foto de una etiqueta.
 *
 * Usa `Html5Qrcode.scanFileV2` (mismo motor que `BarcodeScanner`) sobre un
 * contenedor temporal fuera de pantalla: html5-qrcode necesita un elemento
 * DOM con el id que se le pasa al construirlo. Todo fallo (sin código, sin
 * decoder, timeout) devuelve `null` y nunca rompe el flujo de OCR.
 */
const TIEMPO_LIMITE_MS = 8000;
let consecutivo = 0;

export interface CodigoDetectado {
  texto: string;
  formato: string;
}

export async function decodeBarcodeFromFile(
  file: File,
): Promise<CodigoDetectado | null> {
  if (typeof document === 'undefined') return null;

  consecutivo += 1;
  const id = `ea-barcode-viewport-${consecutivo}`;
  const contenedor = document.createElement('div');
  contenedor.id = id;
  contenedor.setAttribute('aria-hidden', 'true');
  contenedor.style.cssText =
    'position:fixed;top:0;left:-10000px;width:1600px;height:1600px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(contenedor);

  let scanner: import('html5-qrcode').Html5Qrcode | null = null;
  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    scanner = new Html5Qrcode(id, false);
    const resultado = await Promise.race([
      scanner.scanFileV2(file, false),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIEMPO_LIMITE_MS)),
    ]);
    if (!resultado || !resultado.decodedText) return null;
    return {
      texto: resultado.decodedText.trim(),
      formato: resultado.result?.format?.formatName ?? '',
    };
  } catch {
    return null;
  } finally {
    if (scanner) {
      try {
        scanner.clear();
      } catch {
        /* el contenedor se elimina igualmente */
      }
    }
    contenedor.remove();
  }
}
