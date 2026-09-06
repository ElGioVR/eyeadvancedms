import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('doctores')
    .select('*')
    .order('nombre_completo');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { data, error } = await supabase
    .from('doctores')
    .insert({
      nombre_completo: body.nombre,
      cedula_profesional: body.cedula,
      especialidad: body.especialidad || 'Oftalmología',
      telefono: body.telefono,
      email: body.email,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
