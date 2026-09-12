import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { z } from 'zod';

const cirugiaCreateSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  nombre_paciente: z.string().min(1).max(255),
  expediente: z.string().max(50).optional().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  jornada: z.string().max(100).optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  procedimiento: z.string().max(255).optional().nullable(),
  ojo: z.string().max(10).optional().nullable(),
  lio: z.string().max(100).optional().nullable(),
  marca_lio: z.string().max(100).optional().nullable(),
  tiempo_estimado: z.string().max(50).optional().nullable(),
  tiempo_estancia: z.string().max(50).optional().nullable(),
  doctor_id: z.string().uuid().optional().nullable(),
  estado: z.enum(['agendada', 'aplazada', 'completada', 'cancelada']).optional(),
  procedencia: z.string().max(255).optional().nullable(),
  motivo_aplazamiento: z.string().max(500).optional().nullable(),
  notas: z.string().optional().nullable(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const fechaDesde = searchParams.get('fechaDesde');
  const fechaHasta = searchParams.get('fechaHasta');
  const doctorId = searchParams.get('doctorId');
  const estado = searchParams.get('estado');
  const search = searchParams.get('search');

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('agenda_cirugias')
    .select(`
      *,
      doctores:doctor_id (nombre_completo)
    `, { count: 'exact' });

  if (fechaDesde) {
    query = query.gte('fecha', fechaDesde);
  }
  if (fechaHasta) {
    query = query.lte('fecha', fechaHasta);
  }
  if (doctorId) {
    query = query.eq('doctor_id', doctorId);
  }
  if (estado) {
    query = query.eq('estado', estado);
  }
  if (search) {
    query = query.or(`nombre_paciente.ilike.%${search}%,expediente.ilike.%${search}%`);
  }

  query = query
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  const result = data.map((c) => ({
    ...c,
    doctor_nombre: (c as any).doctores?.nombre_completo || null,
    doctores: undefined,
  }));

  return NextResponse.json({ data: result, total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const clean = JSON.parse(JSON.stringify(body), (_key, value) =>
    value === null ? undefined : value
  );

  const validation = cirugiaCreateSchema.safeParse(clean);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  if (data.doctor_id) {
    const { data: doctorCheck } = await supabase
      .from('doctores')
      .select('id, activo')
      .eq('id', data.doctor_id)
      .maybeSingle();
    if (!doctorCheck) {
      return NextResponse.json({ error: 'El doctor seleccionado no existe' }, { status: 404 });
    }
    if (!doctorCheck.activo) {
      return NextResponse.json({ error: 'El doctor seleccionado no está activo' }, { status: 400 });
    }
  }

  if (data.paciente_id) {
    const { data: pacienteCheck } = await supabase
      .from('pacientes')
      .select('id')
      .eq('id', data.paciente_id)
      .maybeSingle();
    if (!pacienteCheck) {
      return NextResponse.json({ error: 'El paciente seleccionado no existe' }, { status: 404 });
    }
  }

  const estado = data.estado || (data.fecha ? 'agendada' : 'aplazada');

  const { data: cirugia, error } = await supabase
    .from('agenda_cirugias')
    .insert({
      paciente_id: data.paciente_id || null,
      nombre_paciente: data.nombre_paciente.trim(),
      expediente: data.expediente?.trim() || null,
      fecha: data.fecha || null,
      hora: data.hora || null,
      jornada: data.jornada?.trim() || null,
      diagnostico: data.diagnostico?.trim() || null,
      procedimiento: data.procedimiento?.trim() || null,
      ojo: data.ojo?.trim() || null,
      lio: data.lio?.trim() || null,
      marca_lio: data.marca_lio?.trim() || null,
      tiempo_estimado: data.tiempo_estimado?.trim() || null,
      tiempo_estancia: data.tiempo_estancia?.trim() || null,
      doctor_id: data.doctor_id || null,
      estado,
      procedencia: data.procedencia?.trim() || null,
      motivo_aplazamiento: data.motivo_aplazamiento?.trim() || null,
      notas: data.notas?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: errorTranslations[error.message] || 'Error interno del servidor' },
      { status: 500 }
    );
  }

  if (cirugia.doctor_id) {
    await supabase.from('notificaciones').insert({
      user_id: cirugia.doctor_id,
      tipo: 'info',
      titulo: 'Nueva cirugía agendada',
      mensaje: `Cirugía programada para ${cirugia.nombre_paciente} el ${cirugia.fecha || 'sin fecha'}`,
      entidad_tipo: 'agenda_cirugia',
      entidad_id: cirugia.id,
    });
  }

  return NextResponse.json(cirugia, { status: 201 });
}
