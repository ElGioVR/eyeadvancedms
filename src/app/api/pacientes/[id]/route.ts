import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Get patient
  const { data: patient, error: patientError } = await supabase
    .from('pacientes')
    .select('*')
    .eq('id', id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
  }

  // Get consultations for this patient with doctor info
  const { data: consultas } = await supabase
    .from('consultas')
    .select(`
      *,
      doctores:doctor_id (nombre_completo, especialidad)
    `)
    .eq('paciente_id', id)
    .order('fecha', { ascending: false });

  // Get cobros for this patient
  const consultaIds = (consultas || []).map((c) => c.id);
  const { data: cobros } = await supabase
    .from('cobros')
    .select('*')
    .in('consulta_id', consultaIds);

  const cobrosMap = new Map((cobros || []).map((cobro) => [cobro.consulta_id, cobro]));

  const nombre = patient.nombre_completo || '';
  const iniciales = nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  const consultasResult = (consultas || []).map((c) => {
    const doctor = c.doctores as any;
    const cobro = cobrosMap.get(c.id);
    const estudios = [c.estudio_1, c.estudio_2, c.estudio_3].filter(Boolean);

    return {
      id: c.id,
      folio: c.folio || null,
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      diagnostico: c.diagnostico,
      estudios,
      procedimiento: c.procedimiento,
      notas: c.notas,
      doctor: doctor?.nombre_completo || '',
      especialidad: doctor?.especialidad || '',
      monto: cobro?.monto || 0,
      moneda: cobro?.moneda || 'PESOS',
      metodo_pago: cobro?.metodo_pago || 'NO_APLICA',
      pagado: cobro?.pagado || false,
    };
  });

  return NextResponse.json({
    id: patient.id,
    nombre_completo: nombre,
    iniciales,
    sexo: patient.sexo,
    fecha_nacimiento: patient.fecha_nacimiento,
    edad: patient.edad,
    telefono: patient.telefono,
    email: patient.email,
    direccion: patient.direccion,
    contacto_emergencia: patient.contacto_emergencia,
    tel_emergencia: patient.tel_emergencia,
    created_at: patient.created_at,
    consultas: consultasResult,
    total_consultas: consultasResult.length,
  });
}
