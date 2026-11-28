import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { requireRoleInventario } from '@/lib/acceso-enfermeria';
import { leerJSON, uuid, fechaISO } from '@/lib/api/validar';
import { respuestaErrorDb } from '@/lib/api/configuracion';
import { ruta } from '@/lib/api/ruta';
import { faltanTablasInsumos } from '@/lib/insumos';

const motivo = z.string().trim().max(500).optional().nullable().transform((v) => v || null);
const cantidad = z.number().int().min(1).max(100000);

const movSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('entrada'),
    insumo_id: uuid,
    ubicacion_id: uuid,
    lote: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
    fecha_caducidad: fechaISO.optional().nullable(),
    cantidad,
    motivo,
  }).strict(),
  z.object({ accion: z.enum(['salida', 'merma']), lote_id: uuid, cantidad, motivo }).strict(),
  /** Salida sin elegir lote: la base reparte según la política del insumo (FEFO/FIFO/LIFO). */
  z.object({ accion: z.literal('salida_auto'), insumo_id: uuid, cantidad, ubicacion_id: uuid.optional().nullable(), motivo }).strict(),
  /** Ajuste por conteo físico: se manda la cantidad real que hay en el lote. */
  z.object({ accion: z.literal('ajuste'), lote_id: uuid, cantidad_real: z.number().int().min(0).max(100000), motivo }).strict(),
  z.object({ accion: z.literal('traslado'), lote_id: uuid, destino_id: uuid, cantidad, motivo }).strict(),
]);

/** Errores de negocio de las funciones (RAISE EXCEPTION) → 409 con el mensaje, no 500. */
function respuestaRpc(error: { code?: string; message?: string }, ctx: string) {
  if (error.code === 'P0001' || error.code === 'P0002') {
    return NextResponse.json({ error: error.message || 'No se pudo registrar' }, { status: error.code === 'P0002' ? 404 : 409 });
  }
  return respuestaErrorDb(error, ctx);
}

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRoleInventario(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (err) return err;
  const insumo = new URL(request.url).searchParams.get('insumo_id');
  if (!insumo || !uuid.safeParse(insumo).success) return NextResponse.json({ error: 'Insumo no válido' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('insumo_movimientos')
    .select('id, tipo, cantidad, cantidad_resultante, ubicacion_id, ubicacion_destino_id, lote, fecha_caducidad, motivo, usuario_id, created_at')
    .eq('insumo_id', insumo)
    .order('created_at', { ascending: false })
    .limit(300);
  if (faltanTablasInsumos(error)) return NextResponse.json({ movimientos: [] });
  if (error) return respuestaErrorDb(error, 'inventario.insumos.kardex');

  const ids = [...new Set((data ?? []).map((m) => m.usuario_id).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await supabase.from('usuarios').select('id, nombre').in('id', ids);
    for (const u of us ?? []) nombres.set(u.id, u.nombre);
  }
  return NextResponse.json({
    movimientos: (data ?? []).map(({ usuario_id, ...m }) => ({ ...m, usuario_nombre: usuario_id ? nombres.get(usuario_id) ?? null : null })),
  });
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRoleInventario(auth.user, ['admin', 'recepcionista']);
  if (err) return err;
  const body = await leerJSON(request, movSchema);
  if (body instanceof NextResponse) return body;

  const supabase = getSupabaseAdmin();
  const usuario = auth.user.id;
  let r;
  switch (body.accion) {
    case 'entrada':
      r = await supabase.rpc('insumo_entrada', {
        p_insumo_id: body.insumo_id, p_ubicacion_id: body.ubicacion_id, p_lote: body.lote,
        p_caducidad: body.fecha_caducidad ?? null, p_cantidad: body.cantidad, p_usuario_id: usuario, p_motivo: body.motivo,
      });
      break;
    case 'salida':
    case 'merma':
      r = await supabase.rpc('insumo_mover', {
        p_lote_id: body.lote_id, p_delta: -body.cantidad, p_tipo: body.accion.toUpperCase(), p_usuario_id: usuario, p_motivo: body.motivo,
      });
      break;
    case 'salida_auto':
      r = await supabase.rpc('insumo_salida_auto', {
        p_insumo_id: body.insumo_id, p_cantidad: body.cantidad, p_ubicacion_id: body.ubicacion_id ?? null, p_usuario_id: usuario, p_motivo: body.motivo,
      });
      if (!r.error) return NextResponse.json({ ok: true, lotes: r.data ?? [] }, { status: 201 });
      if (r.error.code === 'PGRST202' || r.error.code === '42883') {
        return NextResponse.json({ error: 'Falta instalar patch-insumos-lotes-politica-supabase.sql para la salida automática.' }, { status: 503 });
      }
      break;
    case 'ajuste': {
      const { data: lote, error: e } = await supabase.from('insumo_lotes').select('cantidad').eq('id', body.lote_id).maybeSingle();
      if (faltanTablasInsumos(e)) return NextResponse.json({ error: 'Falta instalar el inventario de insumos.' }, { status: 503 });
      if (e) return respuestaErrorDb(e, 'inventario.insumos.ajuste');
      if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 });
      const delta = body.cantidad_real - lote.cantidad;
      if (delta === 0) return NextResponse.json({ ok: true, sin_cambio: true });
      r = await supabase.rpc('insumo_mover', { p_lote_id: body.lote_id, p_delta: delta, p_tipo: 'AJUSTE', p_usuario_id: usuario, p_motivo: body.motivo ?? 'Conteo físico' });
      break;
    }
    case 'traslado':
      r = await supabase.rpc('insumo_trasladar', {
        p_lote_id: body.lote_id, p_destino_id: body.destino_id, p_cantidad: body.cantidad, p_usuario_id: usuario, p_motivo: body.motivo,
      });
      break;
  }
  if (faltanTablasInsumos(r.error)) return NextResponse.json({ error: 'Falta instalar el inventario de insumos.' }, { status: 503 });
  if (r.error) return respuestaRpc(r.error, `inventario.insumos.${body.accion}`);
  const fila = Array.isArray(r.data) ? r.data[0] : r.data;
  return NextResponse.json({ ok: true, cantidad_resultante: fila?.cantidad_resultante ?? null }, { status: 201 });
}

export const GET = ruta('inventario/insumos/movimientos#GET', manejarGET);
export const POST = ruta('inventario/insumos/movimientos#POST', manejarPOST);
