'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  initials: string;
  src?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export default function Avatar({ initials, src, className, size = 'md' }: AvatarProps) {
  const [imgError, setImgError] = useState<string | null>(null);

  // El error se recuerda por URL: al cambiar la foto se vuelve a intentar mostrarla.
  if (src && imgError !== src) {
    // Contenedor circular con recorte propio: en Safari (iPhone) un <img> con
    // display:flex/rounded dentro de un flex podía encogerse o verse cortado.
    return (
      <span
        className={cn(
          'relative inline-block shrink-0 aspect-square overflow-hidden rounded-full bg-surface-2',
          sizeClasses[size],
          className
        )}
      >
        <img
          src={src}
          alt={initials}
          className="absolute inset-0 block h-full w-full max-w-none object-cover object-center"
          draggable={false}
          onError={() => setImgError(src)}
        />
      </span>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
