'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function InventarioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="el inventario" contexto="inventario" />;
}
