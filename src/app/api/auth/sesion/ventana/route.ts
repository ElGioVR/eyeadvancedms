import { NextResponse } from 'next/server';
import { createClient, requireAuth } from '@/lib/supabase/server';
import { etiquetaDispositivo } from '@/lib/sesion-unica';
import { renovarSesionVentana } from '@/services/sesion-unica';
import { ruta } from '@/lib/api/ruta';

/**
 * «Trabajar aquí» en otra ventana del mismo navegador: sesión nueva para esta
 * ventana y revocación de la anterior (ver renovarSesionVentana).
 */
async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const r = await renovarSesionVentana(createClient(), etiquetaDispositivo(request.headers.get('user-agent')));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = ruta('auth/sesion/ventana#POST', manejarPOST);
