import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const errorTranslations: Record<string, string> = {
  'duplicate key value violates unique constraint "doctores_cedula_profesional_key"': 'Ya existe un doctor con esta cédula profesional',
  'new row violates row-level security policy': 'No tienes permisos para realizar esta acción',
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('doctores')
    .select('*')
    .order('nombre_completo');

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  const result = data.map((d) => ({
    id: d.id,
    nombre: d.nombre_completo,
    especialidad: d.especialidad,
    cedula: d.cedula_profesional,
    telefono: d.telefono,
    email: d.email,
    activo: d.activo,
    created_at: d.created_at,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  if (!body.nombre || !body.nombre.trim()) {
    return NextResponse.json({ error: 'El nombre del doctor es obligatorio' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('doctores')
    .insert({
      nombre_completo: body.nombre.trim(),
      cedula_profesional: body.cedula?.trim() || null,
      especialidad: body.especialidad?.trim() || 'Oftalmología',
      telefono: body.telefono?.trim() || null,
      email: body.email?.trim() || null,
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
    return NextResponse.json({ error: 'Falta el ID del doctor' }, { status: 400 });
  }

  const profileUpdates: Record<string, any> = {};
  if (updates.nombre) profileUpdates.nombre_completo = updates.nombre.trim();
  if (updates.cedula !== undefined) profileUpdates.cedula_profesional = updates.cedula?.trim() || null;
  if (updates.especialidad) profileUpdates.especialidad = updates.especialidad.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.email !== undefined) profileUpdates.email = updates.email?.trim() || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('doctores')
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
    return NextResponse.json({ error: 'Falta el ID del doctor' }, { status: 400 });
  }

  const { error } = await supabase
    .from('doctores')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
