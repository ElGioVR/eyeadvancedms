import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const errorTranslations: Record<string, string> = {
  'duplicate key value violates unique constraint "aseguranzas_nombre_key"': 'Ya existe una aseguranza con este nombre',
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('aseguranzas')
    .select('*')
    .order('nombre');

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  if (!body.nombre || !body.nombre.trim()) {
    return NextResponse.json({ error: 'El nombre de la aseguranza es obligatorio' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('aseguranzas')
    .insert({
      nombre: body.nombre.trim(),
      telefono: body.telefono?.trim() || null,
      direccion: body.direccion?.trim() || null,
      contacto: body.contacto?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'Falta el ID de la aseguranza' }, { status: 400 });
  }

  const profileUpdates: Record<string, any> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.direccion !== undefined) profileUpdates.direccion = updates.direccion?.trim() || null;
  if (updates.contacto !== undefined) profileUpdates.contacto = updates.contacto?.trim() || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('aseguranzas')
    .update(profileUpdates)
    .eq('id', id);

  if (profileError) {
    return NextResponse.json({ error: errorTranslations[profileError.message] || profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Falta el ID de la aseguranza' }, { status: 400 });
  }

  const { error } = await supabase
    .from('aseguranzas')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
