import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

/**
 * El middleware solo corre en navegación de páginas.
 * - `/api/*` se excluye: cada route handler ya valida sesión con `requireAuth()`
 *   (que también refresca cookies). Antes cada llamada API pagaba 2 viajes a
 *   Supabase Auth (middleware + handler); ahora paga 1.
 * - Archivos públicos (manifest, sw.js, iconos, PDFs, fuentes) no requieren sesión
 *   y no deben redirigir a /login (rompía el manifest/PWA sin sesión).
 */
export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|images/|icons/|docs/|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf|woff2?|txt|xml|webmanifest)$).*)',
  ],
};
