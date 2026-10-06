import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { emailOpcional, idDeQuery, respuestaErrorDb, textoCorto, textoLargo } from '@/lib/api/configuracion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const proveedorCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  telefono: textoCorto(20).optional(),
  email: emailOpcional.optional(),
  direccion: textoLargo.optional(),
  contacto: textoCorto(255).optional(),
}).strict();

const proveedorUpdateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(255).optional(),
  telefono: textoCorto(20).optional().nullable(),
  email: emailOpcional.optional().nullable(),
  direccion: textoLargo.optional().nullable(),
  contacto: textoCorto(255).optional().nullable(),
  activo: z.boolean().optional(),
}).strict();

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre, contacto, email, telefono, direccion, activo')
    .eq('activo', true)
    .order('nombre')
    .limit(1000);

  if (error) {
    return respuestaErrorDb(error, 'configuracion.proveedores');
  }

  return NextResponse.json(data);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, proveedorCreateSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

  const { data: proveedor, error } = await supabase
    .from('proveedores')
    .insert({
      nombre: data.nombre.trim(),
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      direccion: data.direccion?.trim() || null,
      contacto: data.contacto?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return respuestaErrorDb(error, 'configuracion.proveedores');
  }

  return NextResponse.json(proveedor, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, proveedorUpdateSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const { id, ...updates } = data;

  const profileUpdates: Record<string, unknown> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.email !== undefined) profileUpdates.email = updates.email?.trim() || null;
  if (updates.direccion !== undefined) profileUpdates.direccion = updates.direccion?.trim() || null;
  if (updates.contacto !== undefined) profileUpdates.contacto = updates.contacto?.trim() || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('proveedores')
    .update(profileUpdates)
    .eq('id', id);

  if (profileError) {
    return respuestaErrorDb(profileError, 'configuracion.proveedores');
  }

  return NextResponse.json({ success: true });
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'Falta el ID del proveedor');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('proveedores')
    .update({ activo: false })
    .eq('id', id);

  if (error) {
    return respuestaErrorDb(error, 'configuracion.proveedores');
  }

  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/proveedores#GET', manejarGET);
export const POST = ruta('configuracion/proveedores#POST', manejarPOST);
export const PATCH = ruta('configuracion/proveedores#PATCH', manejarPATCH);
export const DELETE = ruta('configuracion/proveedores#DELETE', manejarDELETE);
