import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      nombre: body.nombre,
      telefono: body.telefono,
      email: body.email,
      direccion: body.direccion,
      contacto: body.contacto,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
