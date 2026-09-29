import { NextResponse } from 'next/server';
import { notificarRoles } from '@/services/notificaciones';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { translateError } from '@/lib/supabase/errors';
import { registrarMovimiento, siguienteFolioLente } from '@/lib/inventario';
import { esquemaPaginacion, leerJSON, leerQuery, validarId } from '@/lib/api/validar';
import { z } from 'zod';

/** Caracteres permitidos en códigos de barras (evita inyección en filtros PostgREST). */
const CODIGO_RE = /^[\w\-./+ ()]*$/;
/** Quita el separador GS (\x1d) que envían algunos lectores GS1. */
const limpiarCodigo = (v: string) => v.replace(/\x1d/g, '').trim();

const listaQuerySchema = z.object({
  ...esquemaPaginacion(15, 100),
  id: z.string().uuid('ID no válido').optional(),
  barcode: z.string().transform(limpiarCodigo).pipe(z.string().min(1).max(100).regex(CODIGO_RE, 'Código de barras no válido')).optional(),
});

const lenteBaseSchema = z.object({
  manufacturer: z.string().min(1).max(255),
  product_name: z.string().max(255).optional().nullable(),
  model: z.string().min(1).max(255),
  sphere: z.number().min(-999.99).max(999.99).optional().nullable(),
  cylinder: z.number().min(-999.99).max(999.99).optional().nullable(),
  add_intermediate: z.number().min(0).max(20).optional().nullable(),
  add_near: z.number().min(0).max(20).optional().nullable(),
  nozzle: z.string().max(10).optional().nullable(),
  serial_number: z.string().max(100).optional().nullable(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  barcode: z.string().transform(limpiarCodigo).pipe(z.string().max(100).regex(CODIGO_RE, 'Código de barras no válido')).optional().nullable(),
  barcode_format: z.string().max(20).optional().nullable(),
  stock: z.number().int().min(0).max(100000).optional(),
  stock_minimo: z.number().int().min(0).max(100000).optional(),
  precio_compra: z.number().min(0).max(99999999.99).optional().nullable(),
  precio_venta: z.number().min(0).max(99999999.99).optional().nullable(),
  lote: z.string().max(100).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
  proveedor_id: z.string().uuid().optional().nullable(),
}).strict();

const lenteCreateSchema = lenteBaseSchema;

const lenteUpdateSchema = z.object({
  id: z.string().uuid(),
  // Ajuste relativo (+/-): seguro ante movimientos simultáneos. Preferible a `stock` absoluto.
  ajuste_stock: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, 'El ajuste no puede ser 0').optional(),
}).merge(lenteBaseSchema.partial()).strict();

function mapLente(l: any) {
  return {
    id: l.id,
    folio: l.folio ?? null,
    manufacturer: l.manufacturer,
    product_name: l.product_name,
    model: l.model,
    sphere: l.sphere,
    cylinder: l.cylinder,
    add_intermediate: l.add_intermediate,
    add_near: l.add_near,
    nozzle: l.nozzle,
    serial_number: l.serial_number,
    expiration_date: l.expiration_date,
    barcode: l.barcode,
    barcode_format: l.barcode_format,
    stock: l.stock,
    stock_minimo: l.stock_minimo,
    precio_compra: l.precio_compra,
    precio_venta: l.precio_venta,
    lote: l.lote,
    notas: l.notas,
    categoria: (l.categorias_lentes as any)?.nombre || '',
    proveedor: (l.proveedores as any)?.nombre || '',
    categoria_id: l.categoria_id,
    proveedor_id: l.proveedor_id,
    created_at: l.created_at,
  };
}

const SELECT = '*, categorias_lentes:categoria_id (nombre), proveedores:proveedor_id (nombre)';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const q = leerQuery(request, listaQuerySchema);
  if (q instanceof NextResponse) return q;
  const supabase = getSupabaseAdmin();

  if (q.id) {
    const { data, error } = await supabase
      .from('inventario_items')
      .select(SELECT)
      .eq('id', q.id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }
    return NextResponse.json(mapLente(data));
  }

  if (q.barcode) {
    // El alta por etiqueta guarda `barcode`; los ítems migrados usan `codigo_barras`.
    const codigo = q.barcode.replace(/"/g, '');
    const { data, error } = await supabase
      .from('inventario_items')
      .select(SELECT)
      .or(`barcode.eq."${codigo}",codigo_barras.eq."${codigo}"`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'No se encontró el ítem con ese código de barras' }, { status: 404 });
    }
    return NextResponse.json(mapLente(data));
  }

  const { page, pageSize } = q;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('inventario_items')
    .select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ data: data.map(mapLente), total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Alta de ítem: también el doctor (solo inventario). PATCH/DELETE siguen
  // restringidos a admin/recepcionista.
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  const data = await leerJSON(request, lenteCreateSchema);
  if (data instanceof NextResponse) return data;
  if (data.barcode === '') data.barcode = null;
  const cantidad = data.stock ?? 1;
  const serie = data.serial_number?.trim() || null;
  const escaparIlike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

  // 1) Misma serie ya registrada (como ítem o dentro de un ítem agrupado) → no duplicar
  if (serie) {
    const [{ data: dupItem }, { data: dupMov }] = await Promise.all([
      supabase.from('inventario_items').select('id, folio').eq('serial_number', serie).limit(1).maybeSingle(),
      supabase
        .from('inventario_movimientos')
        .select('id')
        .eq('tipo', 'ENTRADA')
        .ilike('motivo', `%SN ${escaparIlike(serie)}%`)
        .limit(1),
    ]);
    if (dupItem || (dupMov && dupMov.length > 0)) {
      return NextResponse.json(
        { error: `Este lente (serie ${serie}) ya está registrado en el inventario${dupItem?.folio ? ` · ${dupItem.folio}` : ''}.`, duplicado: true },
        { status: 409 },
      );
    }
  }

  const motivoEntrada = `Alta por etiqueta${serie ? ` — SN ${serie}` : ''}${data.expiration_date ? ` · cad. ${data.expiration_date}` : ''}`;

  // 2) Lente idéntico (misma marca, modelo y graduación) → se suma al stock existente
  let qIgual = supabase
    .from('inventario_items')
    .select('id, stock, expiration_date, precio_venta, barcode')
    .ilike('manufacturer', escaparIlike(data.manufacturer.trim()))
    .ilike('model', escaparIlike(data.model.trim()));
  for (const campo of ['sphere', 'cylinder', 'add_intermediate', 'add_near'] as const) {
    const v = data[campo];
    qIgual = v === null || v === undefined ? qIgual.is(campo, null) : qIgual.eq(campo, v);
  }
  const { data: igual } = await qIgual.order('created_at', { ascending: true }).limit(1).maybeSingle();

  if (igual) {
    // Datos descriptivos (sin stock): caducidad más próxima, precio, código
    const cambios: Record<string, unknown> = {};
    if (data.expiration_date && (!igual.expiration_date || data.expiration_date < igual.expiration_date)) {
      cambios.expiration_date = data.expiration_date;
    }
    if (data.precio_venta !== undefined && data.precio_venta !== null) cambios.precio_venta = data.precio_venta;
    if (!igual.barcode && data.barcode) {
      cambios.barcode = data.barcode;
      cambios.barcode_format = data.barcode_format ?? null;
    }
    if (Object.keys(cambios).length > 0) {
      const { error: errUpd } = await supabase.from('inventario_items').update(cambios).eq('id', igual.id);
      if (errUpd) {
        return NextResponse.json({ error: translateError(errUpd.message) }, { status: 500 });
      }
    }

    // Stock + Kardex en una sola operación atómica (sin perder sumas simultáneas)
    const mov = await registrarMovimiento({
      itemId: igual.id,
      delta: cantidad,
      tipo: 'ENTRADA',
      usuarioId: auth.user.id,
      referenciaTipo: 'COMPRA',
      motivo: motivoEntrada,
    });
    if (!mov.ok) {
      return NextResponse.json({ error: mov.error }, { status: mov.status });
    }
    const { data: actualizado } = await supabase.from('inventario_items').select(SELECT).eq('id', igual.id).single();
    return NextResponse.json({ ...mapLente(actualizado), fusionado: true, agregado: cantidad });
  }

  // El stock inicial entra por el Kardex (movimiento ENTRADA), no directo.
  const insert: Record<string, any> = {
    manufacturer: data.manufacturer,
    product_name: data.product_name ?? null,
    model: data.model,
    sphere: data.sphere ?? null,
    cylinder: data.cylinder ?? null,
    add_intermediate: data.add_intermediate ?? null,
    add_near: data.add_near ?? null,
    nozzle: data.nozzle ?? null,
    serial_number: data.serial_number ?? null,
    expiration_date: data.expiration_date ?? null,
    barcode: data.barcode ?? null,
    barcode_format: data.barcode_format ?? null,
    stock: 0,
    stock_minimo: data.stock_minimo ?? 0,
    precio_compra: data.precio_compra ?? null,
    precio_venta: data.precio_venta ?? null,
    lote: data.lote ?? null,
    notas: data.notas ?? null,
    categoria_id: data.categoria_id ?? null,
    proveedor_id: data.proveedor_id ?? null,
  };

  // Folio consecutivo; si otro usuario tomó el mismo al mismo tiempo, reintenta.
  let lente: any = null;
  for (let intento = 0; intento < 4 && !lente; intento += 1) {
    const folio = await siguienteFolioLente(intento);
    const { data: creado, error } = await supabase
      .from('inventario_items')
      .insert({ ...insert, folio })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505' && intento < 3) continue;
      return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
    }
    lente = creado;
  }

  // Kardex: entrada inicial (también sirve para detectar series ya registradas)
  if (cantidad > 0) {
    const mov = await registrarMovimiento({
      itemId: lente.id,
      delta: cantidad,
      tipo: 'ENTRADA',
      usuarioId: auth.user.id,
      referenciaTipo: 'COMPRA',
      motivo: motivoEntrada,
    });
    if (!mov.ok) {
      await supabase.from('inventario_items').delete().eq('id', lente.id);
      return NextResponse.json({ error: mov.error }, { status: mov.status });
    }
  }

  const { data: completo } = await supabase.from('inventario_items').select(SELECT).eq('id', lente.id).single();
  lente = completo ?? lente;

  return NextResponse.json({ ...mapLente(lente), fusionado: false, agregado: cantidad }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  const data = await leerJSON(request, lenteUpdateSchema);
  if (data instanceof NextResponse) return data;
  const { id, ajuste_stock, ...updates } = data;
  if (updates.barcode === '') updates.barcode = null;
  if (ajuste_stock !== undefined && updates.stock !== undefined) {
    return NextResponse.json({ error: 'Envía stock o ajuste_stock, no ambos' }, { status: 400 });
  }

  const cleanUpdates: Record<string, any> = {};
  const allowed = [
    'manufacturer', 'product_name', 'model', 'sphere', 'cylinder',
    'add_intermediate', 'add_near', 'nozzle', 'serial_number',
    'expiration_date', 'barcode', 'barcode_format',
    // PATCH permite: 'manufacturer', 'product_name', 'model', 'sphere', 'cylinder', 'add_intermediate', 'add_near', 'nozzle', 'serial_number', 'expiration_date', 'barcode', 'barcode_format'
    'stock', 'stock_minimo', 'precio_compra',
    'precio_venta', 'lote', 'notas',
    'categoria_id', 'proveedor_id',
  ];
  for (const key of allowed) {
    if (updates[key as keyof typeof updates] !== undefined) {
      cleanUpdates[key] = updates[key as keyof typeof updates];
    }
  }

  if (Object.keys(cleanUpdates).length === 0 && ajuste_stock === undefined) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }

  // El stock NO se escribe directo: el ajuste pasa por el Kardex de forma atómica.
  const stockObjetivo: number | undefined = cleanUpdates.stock;
  delete cleanUpdates.stock;

  let stockAnterior: number | null = null;
  if (ajuste_stock !== undefined) {
    const mov = await registrarMovimiento({
      itemId: id,
      delta: ajuste_stock,
      tipo: ajuste_stock > 0 ? 'ENTRADA' : 'SALIDA',
      usuarioId: auth.user.id,
      referenciaTipo: 'AJUSTE_MANUAL',
      motivo: `Ajuste manual de stock: ${ajuste_stock > 0 ? '+' : ''}${ajuste_stock}`,
    });
    if (!mov.ok) return NextResponse.json({ error: mov.error }, { status: mov.status });
    stockAnterior = mov.stock - ajuste_stock;
  } else if (stockObjetivo !== undefined) {
    const { data: current } = await supabase.from('inventario_items').select('stock').eq('id', id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    stockAnterior = Number(current.stock) || 0;
    const diff = stockObjetivo - stockAnterior;
    if (diff !== 0) {
      const mov = await registrarMovimiento({
        itemId: id,
        delta: diff,
        tipo: diff > 0 ? 'ENTRADA' : 'SALIDA',
        usuarioId: auth.user.id,
        referenciaTipo: 'AJUSTE_MANUAL',
        motivo: `Ajuste manual de stock: ${stockAnterior} → ${stockObjetivo}`,
      });
      if (!mov.ok) return NextResponse.json({ error: mov.error }, { status: mov.status });
    }
  }

  const { data: lente, error } = Object.keys(cleanUpdates).length > 0
    ? await supabase.from('inventario_items').update(cleanUpdates).eq('id', id).select(SELECT).single()
    : await supabase.from('inventario_items').select(SELECT).eq('id', id).single();

  if (error || !lente) {
    return NextResponse.json({ error: error ? translateError(error.message) : 'Ítem no encontrado' }, { status: error ? 500 : 404 });
  }

  // Aviso de stock bajo: solo al CRUZAR el mínimo (evita repetir el aviso en cada ajuste)
  const minimo = Number(lente.stock_minimo) || 0;
  const cruzoMinimo =
    (stockObjetivo !== undefined || ajuste_stock !== undefined) &&
    minimo > 0 &&
    lente.stock <= minimo &&
    (stockAnterior === null || stockAnterior > minimo);
  if (cruzoMinimo) {
    const nombre = [lente.manufacturer, lente.model].filter(Boolean).join(' ') || lente.folio || 'Lente';
    await notificarRoles(['admin'], {
      tipo: 'STOCK_BAJO',
      titulo: lente.stock === 0 ? 'Sin stock' : 'Stock bajo',
      mensaje: `${nombre} — quedan ${lente.stock} (mínimo ${minimo})`,
      entidadTipo: 'inventario_item',
      entidadId: lente.id,
      actorUserId: auth.user.id,
    });
  }

  return NextResponse.json(mapLente(lente));
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const idError = validarId(id);
  if (idError) return idError;

  const { error } = await supabase.from('inventario_items').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
