'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, Loader2, CheckCircle, X, ImageIcon, Circle, SwitchCamera } from 'lucide-react';
import { combinarLecturas, ParsedLabel } from '@/lib/parseLabel';
import { leerEtiqueta } from '@/lib/ocrEtiqueta';
import { preprocessLabelImage } from '@/lib/preprocessImage';
import { decodeBarcodeFromFile } from '@/lib/barcodeFile';

interface LabelScannerProps {
  onParsed: (data: ParsedLabel) => void;
}

type View = 'choose' | 'viewfinder' | 'processing' | 'results';

export default function LabelScanner({ onParsed }: LabelScannerProps) {
  const [view, setView] = useState<View>('choose');
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedLabel | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [progreso, setProgreso] = useState<{ paso: number; total: number; mensaje: string }>({ paso: 0, total: 5, mensaje: 'Preparando…' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    setError('');
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError('Permiso de camara denegado. Permite el acceso en la configuracion del navegador.');
      } else if (err?.name === 'NotFoundError') {
        setError('No se encontro camara en este dispositivo.');
      } else {
        setError('No se pudo acceder a la camara.');
      }
      setView('choose');
    }
  }, [facingMode]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // When viewfinder opens, start camera
  useEffect(() => {
    if (view === 'viewfinder') {
      const timer = setTimeout(() => startCamera(), 100);
      return () => clearTimeout(timer);
    }
  }, [view, startCamera]);

  // Capture photo from video
  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Resolución completa del sensor: más detalle para el OCR y el código de barras
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob and process
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'label.jpg', { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        stopCamera();
        setView('processing');
        processImage(file, url);
      },
      'image/jpeg',
      0.95
    );
  }

  // Handle file upload
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecciona una imagen valida');
      return;
    }
    const url = URL.createObjectURL(file);
    setView('processing');
    processImage(file, url);
    e.target.value = '';
  }

  // Process image with OCR + decodificación del código de barras
  async function processImage(file: File, previewUrl: string) {
    setRawText('');
    setParsed(null);
    setError('');

    setProgreso({ paso: 0, total: 5, mensaje: 'Preparando imagen…' });

    try {
      // 1) OCR multipasada (varias versiones de la foto + recorte de la etiqueta)
      //    y código de barras sobre la foto ORIGINAL (a resolución completa), en paralelo
      const [codigoOriginal, ocr] = await Promise.all([
        decodeBarcodeFromFile(file),
        leerEtiqueta(file, (paso, total, mensaje) => setProgreso({ paso, total, mensaje })).catch(async () => {
          // Respaldo: una sola lectura sobre la imagen preprocesada
          const imagen = await preprocessLabelImage(file);
          const { createWorker } = await import('tesseract.js');
          const worker = await createWorker('eng', 1, { logger: () => {} });
          try {
            const { data } = await worker.recognize(imagen);
            return { textos: [data.text || ''], recorte: null as File | null };
          } finally {
            await worker.terminate();
          }
        }),
      ]);

      // 2) Si no se leyó el código en la foto completa, reintenta sobre la etiqueta recortada
      const codigo = codigoOriginal ?? (ocr.recorte ? await decodeBarcodeFromFile(ocr.recorte) : null);

      const texto = ocr.textos.join('\n');
      setRawText(texto);

      if (!texto.trim() && !codigo) {
        setError('No se detecto texto ni codigo de barras en la imagen. Intenta con una foto mas clara.');
        setView('choose');
        return;
      }

      // 3) Cada lectura se analiza por separado y los campos se deciden por votación
      const result = combinarLecturas(ocr.textos, {
        barcode: codigo?.texto ?? '',
        barcodeFormat: codigo?.formato ?? '',
      });
      setParsed(result);
      setView('results');
    } catch {
      setError('Error al procesar la imagen. Intenta de nuevo.');
      setView('choose');
    }
  }

  function handleApply() {
    if (parsed) onParsed(parsed);
  }

  function handleReset() {
    stopCamera();
    setView('choose');
    setParsed(null);
    setRawText('');
    setError('');
  }

  function toggleCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  // --- VIEW: Choose ---
  if (view === 'choose') {
    return (
      <div className="rounded-xl border-2 border-dashed border-line bg-gray-50/50 dark:bg-surface-2/50 p-6">
        <div className="text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 mx-auto">
            <ImageIcon className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-fg">Auto-completar desde foto</p>
            <p className="text-xs text-muted mt-1">Toma una foto o sube la etiqueta del lente para rellenar el formulario automaticamente</p>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2 max-w-sm mx-auto">
              <X className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => { setError(''); setView('viewfinder'); }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              <Camera className="h-4 w-4" /> Tomar Foto
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors"
            >
              <Upload className="h-4 w-4" /> Subir Imagen
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    );
  }

  // --- VIEW: Viewfinder (live camera) ---
  if (view === 'viewfinder') {
    return (
      <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none overflow-hidden">
        <div className="relative bg-gray-900" style={{ minHeight: 280 }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full object-cover"
            style={{ minHeight: 280, maxHeight: 360 }}
          />
          {/* Viewfinder overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[80%] h-[50%] border-2 border-white/60 rounded-lg relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-lg" />
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary-500/40 -translate-y-1/2" />
            </div>
          </div>
          {/* Controls */}
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-4">
            <button
              onClick={handleReset}
              className="rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={capturePhoto}
              className="rounded-full bg-white dark:bg-surface-2 p-1 shadow-lg hover:bg-surface-2 transition-colors"
            >
              <div className="rounded-full bg-primary-600 p-4 hover:bg-primary-700 transition-colors">
                <Circle className="h-8 w-8 text-white fill-white" />
              </div>
            </button>
            <button
              onClick={toggleCamera}
              className="rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          </div>
          {/* Hint */}
          <div className="absolute top-3 left-0 right-0 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
              <Camera className="h-3 w-3" /> Centra la etiqueta en el recuadro
            </span>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // --- VIEW: Processing ---
  if (view === 'processing') {
    return (
      <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none overflow-hidden">
        <div className="relative bg-gray-900" style={{ minHeight: 200 }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 text-white animate-spin mx-auto" />
              <p className="text-sm text-white font-bold">Leyendo etiqueta...</p>
              <p className="text-xs text-white/70">{progreso.mensaje}</p>
              <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-all duration-500"
                  style={{ width: `${Math.max(6, (progreso.paso / progreso.total) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: Results ---
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none overflow-hidden">
      <div className="p-4 space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
            <X className="h-4 w-4 shrink-0" /> {error}
            <button onClick={handleReset} className="ml-auto text-xs font-bold underline">Reintentar</button>
          </div>
        )}

{parsed && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-extrabold text-emerald-700">Etiqueta detectada</span>
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-primary-700">
                    Lente intraocular
                  </span>
                </div>
                <button onClick={handleReset} className="text-xs font-bold text-muted hover:text-gray-600 dark:hover:text-fg">Foto nueva</button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Fabricante', value: parsed.manufacturer },
                  { label: 'Producto', value: parsed.product_name },
                  { label: 'Modelo', value: parsed.model },
                  { label: 'Esfera (D)', value: parsed.sphere },
                  { label: 'Cilindro (D)', value: parsed.cylinder },
                  { label: 'Nozzle', value: parsed.nozzle },
                  { label: 'ADD Intermedia (D)', value: parsed.add_intermediate },
                  { label: 'ADD Cercana (D)', value: parsed.add_near },
                  { label: 'Numero de serie', value: parsed.serial_number },
                  { label: 'Fecha Caducidad', value: parsed.expiration_date },
                  {
                    label: 'Código Barras',
                    value: parsed.barcode
                      ? `${parsed.barcode}${parsed.barcode_format ? ` (${parsed.barcode_format})` : ''}`
                      : '',
                  },
                ].filter((f) => f.value).map((f) => (
                  <div key={f.label} className="rounded-lg bg-surface-2 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{f.label}</span>
                    <p className="font-bold text-fg mt-0.5">{f.value}</p>
                  </div>
                ))}
              </div>

              <details className="group">
                <summary className="text-xs font-bold text-muted cursor-pointer hover:text-gray-600 dark:hover:text-fg">
                  Ver texto detectado
                </summary>
                <p className="mt-2 text-xs text-muted bg-surface-2 rounded-lg p-3 max-h-24 overflow-y-auto">
                  {rawText}
                </p>
              </details>

              <button onClick={handleApply} className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors inline-flex items-center justify-center gap-2">
                <CheckCircle className="h-4 w-4" /> Aplicar Datos al Formulario
              </button>
            </>
          )}
      </div>
    </div>
  );
}
