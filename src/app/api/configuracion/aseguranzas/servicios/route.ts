import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON, leerQuery } from '@/lib/api/validar';
import { monto, respuestaErrorDb } from '@/lib/api/configuracion';
import { sanitizarBusqueda } from '@/lib/text';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const TIPOS = ['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'] as const;

// La pantalla de servicios filtra en cliente: se devuelve la matriz completa
// de la aseguradora, con un tope defensivo.
const LIMITE_LISTADO = 5000;

const querySchema = z.object({
  aseguranza_id: z.string().uuid('ID de aseguranza no válido').optional(),
  tipo: z.enum(TIPOS).optional(),
  search: z.string().max(200).optional(),
});

const createSchema = z.object({
  aseguranza_id: z.string().uuid(),
  tipo: z.enum(TIPOS),
  nombre: z.string().trim().min(1).max(500),
  costo: monto.default(0),
  porcentaje_cobertura: z.number().finite().min(0).max(100).default(0),
}).strict();

const updateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(500).optional(),
  tipo: z.enum(TIPOS).optional(),
  costo: monto.optional(),
  porcentaje_cobertura: z.number().finite().min(0).max(100).optional(),
  activo: z.boolean().optional(),
}).strict();

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('aseguranza_servicios')
    .select('id, aseguranza_id, tipo, nombre, costo, porcentaje_cobertura, activo, created_at, updated_at, aseguranzas:aseguranza_id(nombre)')
    .eq('activo', true)
    .order('nombre')
    .limit(LIMITE_LISTADO);

  if (q.aseguranza_id) query = query.eq('aseguranza_id', q.aseguranza_id);
  if (q.tipo) query = query.eq('tipo', q.tipo);
  const search = q.search ? sanitizarBusqueda(q.search, 100) : '';
  if (search) query = query.ilike('nombre', `%${search}%`);

  const { data, error } = await query;
  if (error) return respuestaErrorDb(error, 'configuracion.aseguranzas.servicios.listar');

  return NextResponse.json({ data });
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const data = await leerJSON(request, createSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('aseguranza_servicios').insert({
    aseguranza_id: data.aseguranza_id,
    tipo: data.tipo,
    nombre: data.nombre.trim(),
    nombre_norm: normalize(data.nombre),
    costo: data.costo,
    porcentaje_cobertura: data.porcentaje_cobertura,
  });

  if (error) {
    return respuestaErrorDb(error, 'configuracion.aseguranzas.servicios.crear', {
      duplicado: 'Este servicio ya existe para esta aseguradora',
      referencia: 'La aseguradora seleccionada no existe',
    });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, updateSchema);
  if (body instanceof NextResponse) return body;
  const { id, ...updates } = body;

  const updateData: Record<string, unknown> = {};
  if (updates.nombre !== undefined) { updateData.nombre = updates.nombre.trim(); updateData.nombre_norm = normalize(updates.nombre); }
  if (updates.tipo !== undefined) updateData.tipo = updates.tipo;
  if (updates.costo !== undefined) updateData.costo = updates.costo;
  if (updates.porcentaje_cobertura !== undefined) updateData.porcentaje_cobertura = updates.porcentaje_cobertura;
  if (updates.activo !== undefined) updateData.activo = updates.activo;
  updateData.updated_at = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('aseguranza_servicios').update(updateData).eq('id', id);
  if (error) {
    return respuestaErrorDb(error, 'configuracion.aseguranzas.servicios.actualizar', {
      duplicado: 'Este servicio ya existe para esta aseguradora',
    });
  }

  return NextResponse.json({ ok: true });
}

export const GET = ruta('configuracion/aseguranzas/servicios#GET', manejarGET);
export const POST = ruta('configuracion/aseguranzas/servicios#POST', manejarPOST);
export const PATCH = ruta('configuracion/aseguranzas/servicios#PATCH', manejarPATCH);
