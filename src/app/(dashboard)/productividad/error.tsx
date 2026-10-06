'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function ProductividadError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="productividad y honorarios" contexto="productividad" />;
}
