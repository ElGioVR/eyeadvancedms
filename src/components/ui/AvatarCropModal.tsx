'use client';

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Modal from '@/components/ui/Modal';

interface AvatarCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (blob: Blob) => void;
}

function getCroppedImg(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;

  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No canvas context'));

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width * scaleX,
    crop.height * scaleY
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
      },
      'image/jpeg',
      0.85
    );
  });
}

function centerInitialCrop(width: number, height: number): Crop {
  return centerCrop(
    { unit: '%', width: 90, height: 90 },
    width,
    height
  );
}

export default function AvatarCropModal({ isOpen, onClose, imageSrc, onCropComplete }: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerInitialCrop(width, height);
    setCrop(initialCrop);
  }, []);

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop) return;
    setSaving(true);

    try {
      const blob = await getCroppedImg(imgRef.current, completedCrop);
      onCropComplete(blob);
      onClose();
    } catch {
      // Error silenciado
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setZoom(1);
    setCrop(undefined);
    setCompletedCrop(undefined);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Ajustar foto de perfil</h3>

        <div className="flex justify-center overflow-hidden rounded-lg bg-surface-2">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            circularCrop
            aspect={1}
            className="max-h-[350px]"
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Vista previa"
              onLoad={onImageLoad}
              style={{ maxHeight: '350px', transform: `scale(${zoom})` }}
              className="select-none"
              draggable={false}
            />
          </ReactCrop>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Zoom</label>
            <span className="text-xs text-muted">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary-600"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !completedCrop}
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
