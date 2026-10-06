'use client';

import { useEffect } from 'react';
import { reportarError } from '@/lib/monitoreo-cliente';

/**
 * Último recurso: error en el layout raíz (sin él, pantalla en blanco).
 * Reemplaza todo el documento, por eso trae su propio <html> y estilos
 * en línea (el CSS de la app puede no haber cargado).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportarError(error, { boundary: 'global', digest: error.digest ?? '' });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#0f273d',
          color: '#e6eaf0',
          textAlign: 'center',
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>La aplicación tuvo un problema</h1>
          <p style={{ opacity: 0.75, lineHeight: 1.5 }}>
            Tus datos guardados no se vieron afectados. Intenta de nuevo; si se repite, recarga la página.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
            <button
              onClick={reset}
              style={{ padding: '10px 18px', border: 0, borderRadius: 12, background: '#1f86c2', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.assign('/dashboard')}
              style={{ padding: '10px 18px', border: '1px solid #34506b', borderRadius: 12, background: 'transparent', color: '#e6eaf0', fontWeight: 600, cursor: 'pointer' }}
            >
              Recargar
            </button>
          </div>
          {error.digest && <p style={{ opacity: 0.5, fontSize: 12, marginTop: 16 }}>Código: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
