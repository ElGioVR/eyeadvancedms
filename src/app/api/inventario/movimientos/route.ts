import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { requireRoleInventario } from '@/lib/acceso-enfermeria';
import { translateError } from '@/lib/supabase/errors';
import { registrarMovimiento } from '@/lib/inventario';
import { esquemaPaginacion, leerJSON, leerQuery } from '@/lib/api/validar';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const movimientoCreateSchema = z.object({
  inventario_item_id: z.string().uuid(),
  // SALIDA_CIRUGIA / devoluciones de cirugía solo las registra el flujo de cirugías
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION']),
  cantidad: z.number().int().min(1).max(100000),
  // AJUSTE: dirección explícita (antes siempre sumaba)
  direccion: z.enum(['ENTRA', 'SALE']).optional(),
  motivo: z.string().trim().max(500).optional().nullable(),
  costo_unitario: z.number().min(0).max(99999999.99).optional().nullable(),
  proveedor_id: z.string().uuid().optional().nullable(),
  referencia_tipo: z.enum(['CONSULTA', 'COMPRA', 'AJUSTE_MANUAL']).optional().nullable(),
  referencia_id: z.string().uuid().optional().nullable(),
}).strict();

const listaQuerySchema = z.object({
  ...esquemaPaginacion(25, 100),
  item_id: z.string().uuid('ID no válido').optional(),
});

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRoleInventario(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const q = leerQuery(request, listaQuerySchema);
  if (q instanceof NextResponse) return q;
  const supabase = getSupabaseAdmin();
  const { page, pageSize } = q;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('inventario_movimientos')
    .select(`
      id, inventario_item_id, tipo, cantidad, stock_resultante, referencia_tipo,
      referencia_id, motivo, costo_unitario, proveedor_id, created_at,
      inventario_items:inventario_item_id (manufacturer, model, folio),
      usuarios:usuario_id (nombre)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (q.item_id) {
    query = query.eq('inventario_item_id', q.item_id);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: translateError(error.message) || 'Error interno del servidor' }, { status: 500 });
  }

  type Emb<T> = T | T[] | null;
  const uno = <T,>(v: Emb<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const result = (data || []).map((m) => {
    const item = uno(m.inventario_items as Emb<{ manufacturer: string | null; model: string | null; folio: string | null }>);
    const usuario = uno(m.usuarios as Emb<{ nombre: string | null }>);
    return {
      id: m.id,
      inventario_item_id: m.inventario_item_id,
      item_nombre: `${item?.manufacturer || ''} ${item?.model || ''}`.trim(),
      item_folio: item?.folio || '',
      tipo: m.tipo,
      cantidad: m.cantidad,
      stock_resultante: m.stock_resultante,
      usuario: usuario?.nombre || '',
      referencia_tipo: m.referencia_tipo,
      referencia_id: m.referencia_id,
      motivo: m.motivo,
      costo_unitario: m.costo_unitario,
      proveedor_id: m.proveedor_id,
      created_at: m.created_at,
    };
  });

  return NextResponse.json({ data: result, total: count || 0, page, pageSize });
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRoleInventario(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, movimientoCreateSchema);
  if (data instanceof NextResponse) return data;

  const entra =
    data.tipo === 'ENTRADA' ||
    data.tipo === 'DEVOLUCION' ||
    (data.tipo === 'AJUSTE' && data.direccion !== 'SALE');
  const delta = entra ? data.cantidad : -data.cantidad;

  // Stock + Kardex atómicos (sin perder movimientos simultáneos)
  const r = await registrarMovimiento({
    itemId: data.inventario_item_id,
    delta,
    tipo: data.tipo,
    cantidad: data.cantidad,
    usuarioId: auth.user.id,
    referenciaTipo: data.referencia_tipo ?? null,
    referenciaId: data.referencia_id ?? null,
    motivo: data.motivo ?? null,
    costoUnitario: data.costo_unitario ?? null,
    proveedorId: data.proveedor_id ?? null,
  });

  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  const { data: movimiento } = r.movimientoId
    ? await getSupabaseAdmin().from('inventario_movimientos').select('*').eq('id', r.movimientoId).maybeSingle()
    : { data: null };

  return NextResponse.json(movimiento ?? { stock_resultante: r.stock }, { status: 201 });
}

export const GET = ruta('inventario/movimientos#GET', manejarGET);
export const POST = ruta('inventario/movimientos#POST', manejarPOST);
