'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function MisHonorariosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="tus honorarios" contexto="mis-honorarios" />;
}
