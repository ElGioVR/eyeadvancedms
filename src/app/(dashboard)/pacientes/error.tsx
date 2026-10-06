'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function PacientesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="los pacientes" contexto="pacientes" />;
}
