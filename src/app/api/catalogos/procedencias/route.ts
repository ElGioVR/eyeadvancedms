import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';

/**
 * GET /api/catalogos/procedencias — procedencias ya usadas en la agenda, sin
 * repetir (sin distinguir mayúsculas). Alimenta la lista de sugerencias del
 * campo «Procedencia»; el usuario puede escribir una nueva libremente.
 */
async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabaseAdmin()
    .from('agenda_cirugias')
    .select('procedencia')
    .not('procedencia', 'is', null)
    .order('fecha', { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogos.procedencias').mensaje }, { status: 500 });
  }

  const vistas = new Map<string, string>();
  for (const fila of data || []) {
    const texto = String((fila as { procedencia: string | null }).procedencia ?? '').trim();
    if (!texto) continue;
    const clave = texto.toLocaleLowerCase('es');
    if (!vistas.has(clave)) vistas.set(clave, texto);
  }
  const lista = [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'));

  return NextResponse.json(lista, { headers: { 'Cache-Control': 'private, max-age=60' } });
}

export const GET = ruta('catalogos/procedencias#GET', manejarGET);
