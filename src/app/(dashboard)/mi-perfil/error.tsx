'use client';

import ErrorSeccion from '@/components/ui/ErrorSeccion';

export default function MiPerfilError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorSeccion error={error} reset={reset} seccion="tu perfil" contexto="mi-perfil" />;
}
