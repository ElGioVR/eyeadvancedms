import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { fechaISO, leerJSON } from '@/lib/api/validar';
import { idDeQuery, monto, respuestaErrorDb } from '@/lib/api/configuracion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const CONTEXTO = 'configuracion/coberturas-aseguranza';
const COLUMNAS =
  'id, aseguranza_id, porcentaje_cobertura, monto_maximo, copago_fijo, aplica_estudios, aplica_procedimientos, activo, vigente_desde, vigente_hasta, created_at, updated_at';

const baseSchema = z.object({
  aseguranza_id: z.string().uuid(),
  porcentaje_cobertura: z.number().finite().min(0).max(100),
  monto_maximo: monto.optional().nullable(),
  copago_fijo: monto.optional(),
  aplica_estudios: z.boolean().optional(),
  aplica_procedimientos: z.boolean().optional(),
  activo: z.boolean().optional(),
  vigente_desde: fechaISO.optional().nullable(),
  vigente_hasta: fechaISO.optional().nullable(),
}).strict();

const createSchema = baseSchema;

const updateSchema = z.object({
  id: z.string().uuid(),
}).merge(baseSchema.partial()).strict();

const DUPLICADO = 'Ya existe una cobertura para esta aseguranza';

function vigenciaInvalida(desde?: string | null, hasta?: string | null): boolean {
  return !!desde && !!hasta && desde > hasta;
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('coberturas_aseguranza')
    .select(`${COLUMNAS}, aseguranzas:aseguranza_id (nombre)`)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) return respuestaErrorDb(error, CONTEXTO);

  const result = (data || []).map((c) => {
    const aseg = Array.isArray(c.aseguranzas) ? c.aseguranzas[0] : c.aseguranzas;
    return {
      ...c,
      aseguranza_nombre: (aseg as { nombre?: string } | null)?.nombre || '',
    };
  });

  return NextResponse.json(result);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const validado = await leerJSON(request, createSchema);
  if (validado instanceof NextResponse) return validado;
  if (vigenciaInvalida(validado.vigente_desde, validado.vigente_hasta)) {
    return NextResponse.json({ error: 'La vigencia inicial no puede ser posterior a la final' }, { status: 400 });
  }

  // UNIQUE(aseguranza_id) en BD: el duplicado se detecta en el propio INSERT
  // (antes: SELECT previo + INSERT, con carrera entre ambos).
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('coberturas_aseguranza')
    .insert(validado)
    .select()
    .single();

  if (error) {
    return respuestaErrorDb(error, CONTEXTO, {
      duplicado: DUPLICADO,
      referencia: 'La aseguranza seleccionada no existe',
    });
  }

  return NextResponse.json(data, { status: 201 });
}

async function manejarPUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const validado = await leerJSON(request, updateSchema);
  if (validado instanceof NextResponse) return validado;
  if (vigenciaInvalida(validado.vigente_desde, validado.vigente_hasta)) {
    return NextResponse.json({ error: 'La vigencia inicial no puede ser posterior a la final' }, { status: 400 });
  }

  const { id, ...updates } = validado;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('coberturas_aseguranza')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return respuestaErrorDb(error, CONTEXTO, {
      duplicado: DUPLICADO,
      referencia: 'La aseguranza seleccionada no existe',
      noEncontrado: 'Cobertura no encontrada',
    });
  }

  return NextResponse.json(data);
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'ID requerido');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('coberturas_aseguranza')
    .delete()
    .eq('id', id);

  if (error) return respuestaErrorDb(error, CONTEXTO);

  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/coberturas-aseguranza#GET', manejarGET);
export const POST = ruta('configuracion/coberturas-aseguranza#POST', manejarPOST);
export const PUT = ruta('configuracion/coberturas-aseguranza#PUT', manejarPUT);
export const DELETE = ruta('configuracion/coberturas-aseguranza#DELETE', manejarDELETE);
