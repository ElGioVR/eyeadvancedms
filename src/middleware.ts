import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse, type NextRequest } from 'next/server';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF para /api: una mutación enviada desde otro sitio trae un
 * header Origin distinto al host. Llamadas sin Origin (cron, scripts de
 * servidor) siguen pasando y cada handler valida su propia autenticación.
 */
function origenAjeno(request: NextRequest): boolean {
  if (METODOS_SEGUROS.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (origenAjeno(request)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }
    // Sin viaje a Supabase: la sesión la valida cada route handler.
    return NextResponse.next();
  }
  return await updateSession(request);
}

/**
 * - Páginas: refresca/verifica la sesión y redirige a /login si no hay.
 * - `/api/*`: solo la verificación de origen (CSRF), sin tocar Supabase; cada
 *   route handler valida la sesión con `requireAuth()`.
 * - `/monitoring` es el túnel de Sentry (sin sesión, no debe redirigir a /login).
 * - Archivos públicos (manifest, sw.js, iconos, PDFs, fuentes) no requieren sesión
 *   y no deben redirigir a /login (rompía el manifest/PWA sin sesión).
 */
export const config = {
  matcher: [
    '/api/:path*',
    '/((?!api/|monitoring|_next/static|_next/image|favicon.ico|images/|icons/|docs/|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf|woff2?|txt|xml|webmanifest)$).*)',
  ],
};
