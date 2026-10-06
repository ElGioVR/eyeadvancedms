'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="el panel de inicio" contexto="dashboard" />;
}
