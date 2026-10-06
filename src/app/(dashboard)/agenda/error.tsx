'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function AgendaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="la agenda" contexto="agenda" />;
}
