import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { idDeQuery, respuestaErrorDb, textoLargo } from '@/lib/api/configuracion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const categoriaCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  descripcion: textoLargo.optional(),
}).strict();

const categoriaUpdateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(255).optional(),
  descripcion: textoLargo.optional().nullable(),
}).strict();

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('categorias_lentes')
    .select('id, nombre, descripcion, created_at')
    .order('nombre')
    .limit(1000);

  if (error) {
    return respuestaErrorDb(error, 'configuracion.categorias-lentes');
  }

  return NextResponse.json(data);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, categoriaCreateSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

  const { data: categoria, error } = await supabase
    .from('categorias_lentes')
    .insert({
      nombre: data.nombre.trim(),
      descripcion: data.descripcion?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return respuestaErrorDb(error, 'configuracion.categorias-lentes');
  }

  return NextResponse.json(categoria, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, categoriaUpdateSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const { id, ...updates } = data;

  const profileUpdates: Record<string, unknown> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre.trim();
  if (updates.descripcion !== undefined) profileUpdates.descripcion = updates.descripcion?.trim() || null;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('categorias_lentes')
    .update(profileUpdates)
    .eq('id', id);

  if (profileError) {
    return respuestaErrorDb(profileError, 'configuracion.categorias-lentes');
  }

  return NextResponse.json({ success: true });
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'Falta el ID de la categoría');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('categorias_lentes')
    .delete()
    .eq('id', id);

  if (error) {
    return respuestaErrorDb(error, 'configuracion.categorias-lentes');
  }

  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/categorias-lentes#GET', manejarGET);
export const POST = ruta('configuracion/categorias-lentes#POST', manejarPOST);
export const PATCH = ruta('configuracion/categorias-lentes#PATCH', manejarPATCH);
export const DELETE = ruta('configuracion/categorias-lentes#DELETE', manejarDELETE);
