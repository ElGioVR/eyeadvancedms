'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function CirugiasError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="la cirugía" contexto="cirugias" />;
}
