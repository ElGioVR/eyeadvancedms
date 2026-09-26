'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

type Cam = { id: string; label: string };

/** Etiqueta corta y legible para una cámara (iOS entrega nombres muy largos). */
function etiquetaCorta(label: string, i: number): string {
  const l = label.toLowerCase();
  if (l.includes('ultra')) return 'Ultra gran angular';
  if (l.includes('tele')) return 'Teleobjetivo';
  if (l.includes('doble') || l.includes('dual') || l.includes('triple')) return 'Posterior múltiple';
  if (l.includes('front') || l.includes('frontal') || l.includes('user')) return 'Frontal';
  if (l.includes('amplia') || l.includes('wide')) return 'Gran angular';
  if (l.includes('back') || l.includes('trasera') || l.includes('posterior') || l.includes('rear') || l.includes('environment')) return 'Trasera';
  return `Cámara ${i + 1}`;
}

function esTrasera(label: string): boolean {
  const l = label.toLowerCase();
  return ['back', 'trasera', 'posterior', 'rear', 'environment'].some((k) => l.includes(k));
}

export default function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const [cameras, setCameras] = useState<Cam[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    async function init() {
      try {
        // Pide permiso primero (dispara el prompt del navegador)
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        if (!mounted) return;

        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;

        const devices = await Html5Qrcode.getCameras();
        if (!mounted) return;

        if (devices && devices.length > 0) {
          const mapped: Cam[] = devices.map((d: any, i: number) => ({ id: d.id, label: d.label || `Cámara ${i + 1}` }));
          setCameras(mapped);

          // Preferir la trasera "normal" (evita ultra gran angular / tele, que enfocan mal de cerca)
          const traseras = mapped.filter((d) => esTrasera(d.label));
          const normal = traseras.find((d) => !/ultra|tele|doble|dual|triple/i.test(d.label));
          const cam = normal || traseras[0] || mapped[mapped.length - 1];
          setSelectedCamera(cam.id);
          setReady(true);
        } else {
          setError('No se encontraron cámaras.');
        }
      } catch (err: any) {
        if (!mounted) return;
        if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
          setError('Permiso de cámara denegado. Permite el acceso en la configuración del navegador.');
        } else if (err?.name === 'NotFoundError') {
          setError('No se encontró ninguna cámara en este dispositivo.');
        } else {
          setError('No se pudo acceder a la cámara.');
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stopScanner();
    };
  }, []);

  useEffect(() => {
    if (!ready || !selectedCamera || startedRef.current) return;
    const timer = setTimeout(() => startScanner(selectedCamera), 300);
    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [ready, selectedCamera]);

  async function startScanner(cameraId: string) {
    if (startedRef.current) return;
    if (!containerRef.current) return;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      containerRef.current.innerHTML = '';

      const scanner = new Html5Qrcode('barcode-viewport');
      scannerRef.current = scanner;
      startedRef.current = true;
      setScannerActive(true);

      await scanner.start(
        cameraId,
        {
          fps: 10,
          // Área de lectura proporcional al ancho real del visor (no se desborda en móvil)
          qrbox: (w: number, h: number) => {
            const width = Math.max(160, Math.floor(Math.min(w * 0.85, 320)));
            const height = Math.max(80, Math.floor(Math.min(h * 0.5, width * 0.45)));
            return { width, height };
          },
          aspectRatio: 4 / 3,
        },
        (decodedText: string) => {
          stopScanner();
          onScan(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      startedRef.current = false;
      setScannerActive(false);
      if (err?.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado.');
      } else {
        setError('No se pudo iniciar la cámara. Intenta recargar.');
      }
    }
  }

  async function stopScanner() {
    try {
      if (scannerRef.current && startedRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      }
    } catch {}
    startedRef.current = false;
    setScannerActive(false);
    scannerRef.current = null;
  }

  async function siguienteCamara() {
    if (cameras.length < 2) return;
    const idx = cameras.findIndex((c) => c.id === selectedCamera);
    const next = cameras[(idx + 1) % cameras.length];
    await stopScanner();
    startedRef.current = false;
    setScannerActive(false);
    setSelectedCamera(next.id);
  }

  const idxActual = cameras.findIndex((c) => c.id === selectedCamera);
  const actual = idxActual >= 0 ? cameras[idxActual] : null;

  return (
    <div className="min-w-0 space-y-3">
      <style dangerouslySetInnerHTML={{ __html: `
        #barcode-viewport { border: none !important; width: 100% !important; max-width: 100% !important; overflow: hidden; }
        #barcode-viewport video { display: block; width: 100% !important; max-width: 100% !important; height: 100% !important; object-fit: cover; }
        #barcode-viewport canvas { max-width: 100% !important; }
        #barcode-viewport__scan_region { width: 100% !important; max-width: 100% !important; min-height: 0 !important; border: none !important; overflow: hidden; }
        #barcode-viewport__dashboard, #barcode-viewport__dashboard_section, #barcode-viewport__dashboard_section_csr, #barcode-viewport__dashboard_section_fsr, #barcode-viewport__header_message, #barcode-viewport img[alt="Info icon"] { display: none !important; }
        #barcode-viewport__scan_region > br { display: none !important; }
        #qr-shaded-region { border-color: rgba(0,0,0,0.45) !important; }
      `}} />

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-line">
        <div id="barcode-viewport" ref={containerRef} className="absolute inset-0 h-full w-full" />

        {!scannerActive && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="space-y-2 text-center">
              <Camera className="mx-auto h-10 w-10 animate-pulse text-slate-400" />
              <p className="text-sm text-slate-300">Preparando cámara…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
            <div className="space-y-2 text-center">
              <X className="mx-auto h-10 w-10 text-red-400" />
              <p className="max-w-[250px] text-sm text-red-300">{error}</p>
            </div>
          </div>
        )}

        {cameras.length > 1 && !error && (
          <button
            type="button"
            onClick={siguienteCamara}
            aria-label="Cambiar cámara"
            className="absolute right-2 top-2 z-20 inline-flex max-w-[70%] items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/70 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{actual ? etiquetaCorta(actual.label, idxActual) : 'Cambiar cámara'}</span>
            <span className="shrink-0 text-white/60">{idxActual + 1}/{cameras.length}</span>
          </button>
        )}
      </div>

      {scannerActive && !error && (
        <div className="flex items-center justify-center gap-2 text-center text-sm text-fg-2">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand" />
          Apunta la cámara al código de barras
        </div>
      )}
    </div>
  );
}
