'use client';

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Modal from '@/components/ui/Modal';

interface AvatarCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (blob: Blob) => void;
}

/** Lado final de la foto de perfil. Pequeño a propósito: pesa ~30-80 KB y no topa con límites de canvas de iOS. */
const LADO_SALIDA = 512;

/**
 * Recorta y reduce la imagen a un cuadrado LADO_SALIDA×LADO_SALIDA en JPEG.
 * - La escala se calcula contra el tamaño renderizado del <img> (sin transformaciones CSS),
 *   así lo que se ve en el recorte es exactamente lo que se guarda.
 * - Se pinta fondo blanco: los PNG con transparencia no quedan negros/vacíos.
 * - El canvas nunca es más grande que 512px (Safari en iPhone deja el canvas en blanco
 *   cuando se supera su límite de memoria con fotos de cámara grandes).
 */
function getCroppedImg(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const sx = Math.max(0, crop.x * scaleX);
  const sy = Math.max(0, crop.y * scaleY);
  const sw = Math.min(image.naturalWidth - sx, crop.width * scaleX);
  const sh = Math.min(image.naturalHeight - sy, crop.height * scaleY);
  const lado = Math.max(1, Math.min(LADO_SALIDA, Math.round(Math.min(sw, sh))));

  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No canvas context'));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, lado, lado);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))),
      'image/jpeg',
      0.88
    );
  });
}

function recorteInicial(width: number, height: number): Crop {
  return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height);
}

export default function AvatarCropModal({ isOpen, onClose, imageSrc, onCropComplete }: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [saving, setSaving] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const inicial = recorteInicial(width, height);
    setCrop(inicial);
    // Permite «Guardar» sin tener que mover el recorte primero.
    setCompletedCrop(convertToPixelCrop(inicial, width, height));
  }, []);

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width < 1) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imgRef.current, completedCrop);
      onCropComplete(blob);
      handleClose();
    } catch {
      setErrorCarga(true);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    setErrorCarga(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Ajustar foto de perfil</h3>

        <div className="flex justify-center overflow-hidden rounded-lg bg-surface-2">
          {errorCarga ? (
            <p className="p-8 text-center text-sm text-muted">
              No se pudo leer esta imagen. Intenta con otra foto (JPG o PNG).
            </p>
          ) : (
            <ReactCrop
              crop={crop}
              onChange={(_, pct) => setCrop(pct)}
              onComplete={(c) => setCompletedCrop(c)}
              circularCrop
              keepSelection
              aspect={1}
              minWidth={40}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Vista previa"
                onLoad={onImageLoad}
                onError={() => setErrorCarga(true)}
                style={{ maxHeight: '350px', maxWidth: '100%' }}
                className="block select-none"
                draggable={false}
              />
            </ReactCrop>
          )}
        </div>

        <p className="text-xs text-muted">Arrastra el círculo y ajusta sus esquinas para encuadrar tu foto.</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !completedCrop || errorCarga}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
