'use client';

import { cn } from '@/lib/utils';

interface AvatarProps {
  initials: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export default function Avatar({ initials, className, size = 'md' }: AvatarProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold text-white',
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
