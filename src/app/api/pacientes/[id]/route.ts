import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Get patient
  const { data: patient, error: patientError } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, sexo, fecha_nacimiento, edad, telefono, email, direccion, contacto_emergencia, tel_emergencia, aseguranza_id, numero_poliza, numero_afiliacion, created_at')
    .eq('id', id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
  }

  // Get consultations for this patient with doctor info
  const { data: consultas } = await supabase
    .from('consultas')
    .select(`
      id, folio, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita,
      diagnostico, estudio_1, estudio_2, estudio_3, procedimiento, notas,
      doctores:doctor_id (alias, especialidad)
    `)
    .eq('paciente_id', id)
    .order('fecha', { ascending: false })
    .limit(200);

  // Get cobros for this patient
  const consultaIds = (consultas || []).map((c) => c.id);
  const { data: cobros } = await supabase
    .from('cobros')
    .select('id, consulta_id, monto, moneda, metodo_pago, pagado')
    .in('consulta_id', consultaIds);

  const cobrosMap = new Map((cobros || []).map((cobro) => [cobro.consulta_id, cobro]));

  const nombre = patient.nombre_completo || '';
  const iniciales = nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  let aseguradoraNombre: string | null = null;
  if (patient.aseguranza_id) {
    const { data: aseguranza } = await supabase
      .from('aseguranzas')
      .select('nombre')
      .eq('id', patient.aseguranza_id)
      .maybeSingle();
    aseguradoraNombre = aseguranza?.nombre || null;
  }

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
      doctor: doctor?.alias || '',
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
    aseguranza_id: patient.aseguranza_id || null,
    aseguradora: aseguradoraNombre,
    numero_poliza: patient.numero_poliza || null,
    numero_afiliacion: patient.numero_afiliacion || null,
    created_at: patient.created_at,
    consultas: consultasResult,
    total_consultas: consultasResult.length,
  });
}

/* ─────────── PATCH — edición de paciente ─────────── */

const pacienteUpdateSchema = z
  .object({
    nombre_completo: z.string().min(1).max(255).optional(),
    sexo: z.enum(['H', 'M', 'MASCULINO', 'FEMENINO', 'OTRO']).optional(),
    fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    telefono: z.string().max(20).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    direccion: z.string().max(1000).optional().nullable(),
    contacto_emergencia: z.string().max(255).optional().nullable(),
    tel_emergencia: z.string().max(20).optional().nullable(),
    aseguranza_id: z.string().uuid().optional().nullable(),
    numero_poliza: z.string().max(100).optional().nullable(),
    numero_afiliacion: z.string().max(100).optional().nullable(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = pacienteUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.nombre_completo !== undefined) updates.nombre_completo = data.nombre_completo.trim();
  if (data.sexo !== undefined) updates.sexo = data.sexo;
  if (data.fecha_nacimiento !== undefined) updates.fecha_nacimiento = data.fecha_nacimiento;
  if (data.telefono !== undefined) updates.telefono = data.telefono?.trim() || null;
  if (data.email !== undefined) updates.email = data.email?.trim() || null;
  if (data.direccion !== undefined) updates.direccion = data.direccion?.trim() || null;
  if (data.contacto_emergencia !== undefined) updates.contacto_emergencia = data.contacto_emergencia?.trim() || null;
  if (data.tel_emergencia !== undefined) updates.tel_emergencia = data.tel_emergencia?.trim() || null;
  if (data.aseguranza_id !== undefined) updates.aseguranza_id = data.aseguranza_id || null;
  if (data.numero_poliza !== undefined) updates.numero_poliza = data.numero_poliza?.trim() || null;
  if (data.numero_afiliacion !== undefined) updates.numero_afiliacion = data.numero_afiliacion?.trim() || null;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('pacientes').update(updates).eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar el paciente' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
