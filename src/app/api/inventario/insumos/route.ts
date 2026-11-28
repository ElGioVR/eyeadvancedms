import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { requireRoleInventario } from '@/lib/acceso-enfermeria';
import { leerJSON, uuid, fechaISO } from '@/lib/api/validar';
import { idDeQuery, respuestaErrorDb } from '@/lib/api/configuracion';
import { ruta } from '@/lib/api/ruta';
import { CATEGORIAS_INSUMO, POLITICAS_SALIDA, faltanTablasInsumos } from '@/lib/insumos';

const sinSql = () =>
  NextResponse.json(
    { error: 'Falta instalar el inventario de insumos (sql/patch-insumos-inventario-supabase.sql).', codigo: 'SIN_SQL_INSUMOS' },
    { status: 503 },
  );
const opcional = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

const baseSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(200),
  categoria: z.enum(CATEGORIAS_INSUMO),
  presentacion: opcional(60),
  codigo: opcional(100),
  fabricante: opcional(120),
  stock_minimo: z.number().int().min(0).max(100000).default(0),
  notas: opcional(1000),
  politica_salida: z.enum(POLITICAS_SALIDA).optional(),
});

const crearSchema = baseSchema.extend({
  /** Existencia inicial opcional (crea el primer lote con su movimiento de entrada). */
  entrada: z.object({
    ubicacion_id: uuid,
    lote: opcional(80),
    fecha_caducidad: fechaISO.optional().nullable(),
    cantidad: z.number().int().min(1).max(100000),
  }).optional().nullable(),
}).strict();

const editarSchema = baseSchema.partial().extend({ id: uuid }).strict();

// Tipadas como string para que el parser de tipos de supabase-js no intente leerlas.
const COLS_INSUMO: string = 'id, nombre, categoria, presentacion, codigo, fabricante, stock_minimo, notas';
const COLS_LOTE: string = 'id, insumo_id, ubicacion_id, lote, fecha_caducidad, cantidad';

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRoleInventario(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (err) return err;

  const supabase = getSupabaseAdmin();
  const consultar = (conPolitica: boolean) =>
    Promise.all([
      supabase.from('insumos').select(conPolitica ? COLS_INSUMO + ', politica_salida' : COLS_INSUMO).eq('activo', true).order('nombre').limit(2000),
      supabase.from('insumo_lotes').select(conPolitica ? COLS_LOTE + ', lote_interno, fecha_ingreso' : COLS_LOTE).gt('cantidad', 0).order('fecha_caducidad', { ascending: true, nullsFirst: false }).limit(10000),
      supabase.from('insumo_ubicaciones').select('id, nombre, activa, orden').order('orden').order('nombre'),
    ]);
  let [ins, lotes, ubic] = await consultar(true);
  // Sin patch-insumos-lotes-politica todavía: columnas nuevas no existen → se lee lo básico (FEFO por defecto).
  if (ins.error?.code === '42703' || lotes.error?.code === '42703') [ins, lotes, ubic] = await consultar(false);
  const error = ins.error || lotes.error || ubic.error;
  if (faltanTablasInsumos(error)) return NextResponse.json({ disponible: false, insumos: [], ubicaciones: [] });
  if (error) return respuestaErrorDb(error, 'inventario.insumos');

  const porInsumo = new Map<string, unknown[]>();
  for (const l of (lotes.data ?? []) as unknown as Array<{ insumo_id: string } & Record<string, unknown>>) {
    const { insumo_id, ...resto } = l;
    porInsumo.set(insumo_id, [...(porInsumo.get(insumo_id) ?? []), resto]);
  }
  return NextResponse.json({
    disponible: true,
    insumos: ((ins.data ?? []) as unknown as Array<{ id: string; politica_salida?: string }>).map((i) => ({ politica_salida: 'FEFO', ...i, lotes: porInsumo.get(i.id) ?? [] })),
    ubicaciones: ubic.data ?? [],
  });
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRoleInventario(auth.user, ['admin', 'recepcionista']);
  if (err) return err;
  const body = await leerJSON(request, crearSchema);
  if (body instanceof NextResponse) return body;

  const { entrada, ...datos } = body;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('insumos').insert({ ...datos, created_by: auth.user.id }).select('id').single();
  if (faltanTablasInsumos(error)) return sinSql();
  if (error) return respuestaErrorDb(error, 'inventario.insumos.crear', { duplicado: 'Ya existe un insumo con ese nombre' });

  if (entrada) {
    const r = await supabase.rpc('insumo_entrada', {
      p_insumo_id: data.id,
      p_ubicacion_id: entrada.ubicacion_id,
      p_lote: entrada.lote,
      p_caducidad: entrada.fecha_caducidad ?? null,
      p_cantidad: entrada.cantidad,
      p_usuario_id: auth.user.id,
      p_motivo: 'Existencia inicial',
    });
    if (r.error) {
      // El insumo quedó creado; se avisa que la existencia no se registró.
      return NextResponse.json({ id: data.id, aviso: `Insumo creado, pero no se registró la existencia: ${r.error.message}` }, { status: 201 });
    }
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRoleInventario(auth.user, ['admin', 'recepcionista']);
  if (err) return err;
  const body = await leerJSON(request, editarSchema);
  if (body instanceof NextResponse) return body;

  const { id, ...cambios } = body;
  const { error } = await getSupabaseAdmin().from('insumos').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).eq('activo', true);
  if (faltanTablasInsumos(error)) return sinSql();
  if (error) return respuestaErrorDb(error, 'inventario.insumos.editar', { duplicado: 'Ya existe un insumo con ese nombre' });
  return NextResponse.json({ ok: true });
}

/** Baja lógica: el kardex se conserva. Solo admin. */
async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRole(auth.user, ['admin']);
  if (err) return err;
  const id = idDeQuery(request, 'Falta el insumo');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();
  const { data: lotes, error: e1 } = await supabase.from('insumo_lotes').select('cantidad').eq('insumo_id', id).gt('cantidad', 0).limit(1);
  if (faltanTablasInsumos(e1)) return sinSql();
  if (e1) return respuestaErrorDb(e1, 'inventario.insumos.borrar');
  if (lotes && lotes.length > 0) {
    return NextResponse.json({ error: 'Todavía tiene piezas. Registra la salida o merma antes de darlo de baja.' }, { status: 409 });
  }
  const { error } = await supabase.from('insumos').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return respuestaErrorDb(error, 'inventario.insumos.borrar');
  return NextResponse.json({ ok: true });
}

export const GET = ruta('inventario/insumos#GET', manejarGET);
export const POST = ruta('inventario/insumos#POST', manejarPOST);
export const PATCH = ruta('inventario/insumos#PATCH', manejarPATCH);
export const DELETE = ruta('inventario/insumos#DELETE', manejarDELETE);
