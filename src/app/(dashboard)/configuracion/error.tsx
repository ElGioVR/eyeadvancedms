'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function ConfiguracionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="la configuración" contexto="configuracion" />;
}
