import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { z } from 'zod';

const tipoAseguranzaEnum = z.enum(['PRIVADA', 'CONVENIO', 'PARTICULAR']);

const aseguranzaCreateSchema = z.object({
  nombre: z.string().min(1).max(255),
  telefono: z.string().max(20).optional(),
  direccion: z.string().optional(),
  contacto: z.string().max(255).optional(),
  porcentaje_cobertura: z.number().min(0).max(100).optional(),
  tipo: tipoAseguranzaEnum.optional(),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).strict();

const aseguranzaUpdateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(255).optional(),
  telefono: z.string().max(20).optional().nullable(),
  direccion: z.string().optional().nullable(),
  contacto: z.string().max(255).optional().nullable(),
  activo: z.boolean().optional(),
  porcentaje_cobertura: z.number().min(0).max(100).optional().nullable(),
  tipo: tipoAseguranzaEnum.optional(),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('aseguranzas')
    .select('id, nombre, contacto, telefono, direccion, activo, porcentaje_cobertura, tipo, vigente_desde, vigente_hasta')
    .eq('activo', true)
    .order('nombre');

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = aseguranzaCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const { data: aseguranza, error } = await supabase
    .from('aseguranzas')
    .insert({
      nombre: data.nombre.trim(),
      telefono: data.telefono?.trim() || null,
      direccion: data.direccion?.trim() || null,
      contacto: data.contacto?.trim() || null,
      porcentaje_cobertura: data.porcentaje_cobertura ?? 0,
      tipo: data.tipo ?? 'PRIVADA',
      vigente_desde: data.vigente_desde ?? null,
      vigente_hasta: data.vigente_hasta ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(aseguranza, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = aseguranzaUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const { id, ...updates } = data;

  const profileUpdates: Record<string, any> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.direccion !== undefined) profileUpdates.direccion = updates.direccion?.trim() || null;
  if (updates.contacto !== undefined) profileUpdates.contacto = updates.contacto?.trim() || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;
  if (updates.porcentaje_cobertura !== undefined) profileUpdates.porcentaje_cobertura = updates.porcentaje_cobertura;
  if (updates.tipo !== undefined) profileUpdates.tipo = updates.tipo;
  if (updates.vigente_desde !== undefined) profileUpdates.vigente_desde = updates.vigente_desde;
  if (updates.vigente_hasta !== undefined) profileUpdates.vigente_hasta = updates.vigente_hasta;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('aseguranzas')
    .update(profileUpdates)
    .eq('id', id);

  if (profileError) {
    return NextResponse.json({ error: errorTranslations[profileError.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Falta el ID de la aseguranza' }, { status: 400 });
  }

  const { error } = await supabase
    .from('aseguranzas')
    .update({ activo: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
