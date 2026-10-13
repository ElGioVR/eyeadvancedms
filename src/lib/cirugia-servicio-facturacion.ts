import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * La cirugía ya no pide «servicio de facturación»: el precio vive en el catálogo
 * quirúrgico. Para mantener intactos el RPC de alta, las reglas de productividad y
 * los honorarios (que cuelgan de `aseguranza_servicios`), el servicio de la aseguradora
 * se resuelve aquí:
 *  1) el servicio PROCEDIMIENTO activo de la aseguradora con el mismo nombre que algún
 *     procedimiento quirúrgico elegido (su precio, si existe, es el más específico);
 *  2) si no hay, se crea (o reactiva) uno con el nombre del primer procedimiento y el
 *     precio del catálogo quirúrgico.
 */
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');

export async function resolverServicioFacturacion(
  supabase: SupabaseClient,
  origenId: string,
  qxIds: string[],
): Promise<{ id: string | null; error?: string }> {
  const ids = Array.from(new Set(qxIds));
  if (!ids.length) return { id: null, error: 'Selecciona al menos un procedimiento quirúrgico' };

  const { data: cat, error: errCat } = await supabase.from('catalogo_quirurgico').select('*').in('id', ids);
  if (errCat || !cat?.length) return { id: null, error: 'El procedimiento quirúrgico no existe' };
  const porId = new Map((cat as Array<{ id: string; nombre: string; precio?: number | string | null }>).map((c) => [c.id, c]));
  const ordenados = ids.map((id) => porId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  if (!ordenados.length) return { id: null, error: 'El procedimiento quirúrgico no existe' };

  const { data: servicios } = await supabase
    .from('aseguranza_servicios')
    .select('id, nombre, nombre_norm, activo')
    .eq('aseguranza_id', origenId)
    .eq('tipo', 'PROCEDIMIENTO');
  const lista = (servicios ?? []) as Array<{ id: string; nombre: string; nombre_norm: string | null; activo: boolean }>;
  const igual = (n: string) => (s: { nombre: string; nombre_norm: string | null }) => normalizar(s.nombre_norm || s.nombre) === normalizar(n);

  for (const c of ordenados) {
    const s = lista.find((x) => x.activo && igual(c.nombre)(x));
    if (s) return { id: s.id };
  }

  const primero = ordenados[0];
  const precio = Number(primero.precio) || 0;
  const inactivo = lista.find(igual(primero.nombre));
  if (inactivo) {
    await supabase.from('aseguranza_servicios').update({ activo: true }).eq('id', inactivo.id);
    return { id: inactivo.id };
  }
  const { data: creado, error } = await supabase
    .from('aseguranza_servicios')
    .insert({
      aseguranza_id: origenId,
      tipo: 'PROCEDIMIENTO',
      nombre: primero.nombre.trim(),
      nombre_norm: normalizar(primero.nombre),
      costo: precio,
    })
    .select('id')
    .single();
  if (error || !creado) return { id: null, error: 'No se pudo preparar la facturación del procedimiento' };
  return { id: creado.id as string };
}
