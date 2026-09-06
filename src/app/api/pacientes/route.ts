import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('pacientes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get consultation counts and last visit for each patient
  const patientIds = data.map((p) => p.id);
  const { data: consultas } = await supabase
    .from('consultas')
    .select('paciente_id, fecha')
    .in('paciente_id', patientIds);

  const consultasMap = new Map<string, { count: number; ultimaVisita: string }>();
  for (const c of consultas || []) {
    const existing = consultasMap.get(c.paciente_id) || { count: 0, ultimaVisita: '' };
    existing.count++;
    if (c.fecha > existing.ultimaVisita) existing.ultimaVisita = c.fecha;
    consultasMap.set(c.paciente_id, existing);
  }

  const result = data.map((p) => {
    const c = consultasMap.get(p.id);
    const iniciales = p.nombre_completo
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return {
      id: p.id,
      nombre: p.nombre_completo,
      iniciales,
      sexo: p.sexo === 'MASCULINO' ? 'H' : 'M',
      fecha_nacimiento: p.fecha_nacimiento,
      edad: p.edad,
      telefono: p.telefono,
      email: p.email,
      direccion: p.direccion,
      contacto_emergencia: p.contacto_emergencia,
      tel_emergencia: p.tel_emergencia,
      consultas_count: c?.count || 0,
      ultima_visita: c?.ultimaVisita || null,
      created_at: p.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data, error } = await supabase
    .from('pacientes')
    .insert({
      nombre_completo: body.nombre,
      sexo: body.sexo === 'H' ? 'MASCULINO' : 'FEMENINO',
      fecha_nacimiento: body.fecha_nacimiento,
      edad: body.edad,
      telefono: body.telefono,
      email: body.email,
      direccion: body.direccion,
      contacto_emergencia: body.contacto_emergencia,
      tel_emergencia: body.tel_emergencia,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
