import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('consultas')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      doctores:doctor_id (nombre_completo)
    `)
    .order('fecha', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data.map((c) => {
    const nombrePaciente = (c.pacientes as any)?.nombre_completo || '';
    const nombreDoctor = (c.doctores as any)?.nombre_completo || '';
    const iniciales = nombrePaciente
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return {
      id: c.id,
      paciente_id: c.paciente_id,
      paciente: nombrePaciente,
      iniciales,
      doctor_id: c.doctor_id,
      doctor: nombreDoctor,
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      diagnostico: c.diagnostico,
      estudios: [c.estudio_1, c.estudio_2, c.estudio_3].filter(Boolean).join(', '),
      procedimiento: c.procedimiento,
      notas: c.notas,
      created_at: c.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data, error } = await supabase
    .from('consultas')
    .insert({
      paciente_id: body.paciente_id,
      doctor_id: body.doctor_id,
      fecha: body.fecha,
      hora_inicio: body.hora_inicio,
      hora_fin: body.hora_fin,
      tipo_consulta: body.tipo_consulta,
      tipo_visita: body.tipo_visita,
      diagnostico: body.diagnostico,
      estudio_1: body.estudios?.[0] || null,
      estudio_2: body.estudios?.[1] || null,
      estudio_3: body.estudios?.[2] || null,
      procedimiento: body.procedimiento,
      notas: body.notas,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
