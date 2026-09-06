import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const errorTranslations: Record<string, string> = {
  'null value in column "nombre_completo" violates not-null constraint': 'El nombre del paciente es obligatorio',
  'new row violates row-level security policy': 'No tienes permisos para realizar esta acción',
};

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

  if (!body.nombre_completo && !body.nombre) {
    return NextResponse.json({ error: 'El nombre del paciente es obligatorio' }, { status: 400 });
  }

  const insertData: Record<string, any> = {
    nombre_completo: body.nombre_completo || body.nombre,
  };

  if (body.sexo) insertData.sexo = body.sexo === 'H' ? 'MASCULINO' : body.sexo === 'M' ? 'FEMENINO' : body.sexo;
  if (body.fecha_nacimiento) insertData.fecha_nacimiento = body.fecha_nacimiento;
  if (body.edad) insertData.edad = body.edad;
  if (body.telefono) insertData.telefono = body.telefono;
  if (body.email) insertData.email = body.email;
  if (body.direccion) insertData.direccion = body.direccion;
  if (body.contacto_emergencia) insertData.contacto_emergencia = body.contacto_emergencia;
  if (body.tel_emergencia) insertData.tel_emergencia = body.tel_emergencia;

  const { data, error } = await supabase
    .from('pacientes')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
