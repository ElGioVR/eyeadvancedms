'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
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
        // Request permission first - this triggers the browser prompt
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Stop the temporary stream - the scanner will start its own
        stream.getTracks().forEach((t) => t.stop());
        stream = null;

        if (!mounted) return;

        // Dynamic import
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;

        const devices = await Html5Qrcode.getCameras();
        if (!mounted) return;

        if (devices && devices.length > 0) {
          const mapped = devices.map((d: any) => ({ id: d.id, label: d.label || `Camara ${d.id}` }));
          setCameras(mapped);

          // Prefer back/environment camera
          const back = mapped.find((d) => {
            const l = d.label.toLowerCase();
            return l.includes('back') || l.includes('trasera') || l.includes('rear') || l.includes('environment') || l.includes('facing');
          });
          const cam = back || mapped[mapped.length - 1]; // last camera is usually back on mobile
          setSelectedCamera(cam.id);
          setReady(true);
        } else {
          setError('No se encontraron camaras.');
        }
      } catch (err: any) {
        if (!mounted) return;
        if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
          setError('Permiso de camara denegado. Permite el acceso en la configuracion del navegador.');
        } else if (err?.name === 'NotFoundError') {
          setError('No se encontro ninguna camara en este dispositivo.');
        } else {
          setError('No se pudo acceder a la camara.');
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

      // Clear container
      containerRef.current.innerHTML = '';

      const scanner = new Html5Qrcode('barcode-viewport');
      scannerRef.current = scanner;
      startedRef.current = true;
      setScannerActive(true);

      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 2.0 },
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
        setError('Permiso de camara denegado.');
      } else {
        setError('No se pudo iniciar la camara. Intenta recargar.');
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

  async function handleCameraChange(cameraId: string) {
    await stopScanner();
    startedRef.current = false;
    setScannerActive(false);
    setSelectedCamera(cameraId);
  }

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: `
        #barcode-viewport { border: none !important; min-height: 200px; }
        #barcode-viewport video { border-radius: 0.75rem; object-fit: cover; width: 100% !important; }
        #barcode-viewport__scan_region { min-height: 200px; border: none !important; }
        #barcode-viewport__dashboard, #barcode-viewport__dashboard_section, #barcode-viewport__dashboard_section_csr, #barcode-viewport__dashboard_section_fsr, #barcode-viewport__header_message, #barcode-viewport img[alt="Info icon"] { display: none !important; }
        #barcode-viewport__scan_region > br { display: none !important; }
      `}} />

      {cameras.length > 1 && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Seleccionar camara</label>
          <div className="flex gap-2">
            {cameras.map((cam) => (
              <button
                key={cam.id}
                onClick={() => handleCameraChange(cam.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  selectedCamera === cam.id
                    ? 'bg-primary-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cam.label.length > 25 ? cam.label.slice(0, 25) + '...' : cam.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden bg-gray-900" style={{ minHeight: 220 }}>
        <div id="barcode-viewport" ref={containerRef} style={{ width: '100%', minHeight: 200 }} />
        {!scannerActive && !error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
            <div className="text-center space-y-2">
              <Camera className="h-10 w-10 text-gray-500 mx-auto animate-pulse" />
              <p className="text-sm text-gray-400">Preparando camara...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
            <div className="text-center space-y-2 px-4">
              <X className="h-10 w-10 text-red-400 mx-auto" />
              <p className="text-sm text-red-400 max-w-[250px]">{error}</p>
            </div>
          </div>
        )}
      </div>

      {scannerActive && !error && (
        <div className="flex items-center justify-center gap-2 text-sm text-primary-600">
          <div className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
          Apunta la camara al codigo de barras...
        </div>
      )}
    </div>
  );
}
