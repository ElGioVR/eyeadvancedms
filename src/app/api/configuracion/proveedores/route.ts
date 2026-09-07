import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const proveedorCreateSchema = z.object({
  nombre: z.string().min(1).max(255),
  telefono: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  direccion: z.string().optional(),
  contacto: z.string().max(255).optional(),
});

const proveedorUpdateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(255).optional(),
  telefono: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  direccion: z.string().optional().nullable(),
  contacto: z.string().max(255).optional().nullable(),
  activo: z.boolean().optional(),
});

const errorTranslations: Record<string, string> = {
  'duplicate key value violates unique constraint "proveedores_nombre_key"': 'Ya existe un proveedor con este nombre',
};

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre');

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const validation = proveedorCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

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
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json(proveedor, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const validation = proveedorUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const { id, ...updates } = data;

  const profileUpdates: Record<string, any> = {};
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
    return NextResponse.json({ error: errorTranslations[profileError.message] || profileError.message }, { status: 500 });
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
    return NextResponse.json({ error: 'Falta el ID del proveedor' }, { status: 400 });
  }

  const { error } = await supabase
    .from('proveedores')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
