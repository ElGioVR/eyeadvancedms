'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function SeccionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} contexto="app" />;
}
