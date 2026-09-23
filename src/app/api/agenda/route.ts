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
  inventario_item_id: z.string().uuid().optional().nullable(),
}).strict();

const ESTADO_CONSULTA_A_AGENDA: Record<string, string> = {
  BORRADOR: 'agendada',
  PROCESADA: 'completada',
  PENDIENTE_ESTUDIO: 'aplazada',
  PENDIENTE_CIRUGIA: 'reagendada',
  APLAZADA: 'aplazada',
  REAGENDADA: 'reagendada',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada',
};

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const fechaDesde = searchParams.get('fechaDesde');
  const fechaHasta = searchParams.get('fechaHasta');
  const doctorId = searchParams.get('doctorId');
  const estado = searchParams.get('estado');
  const tipo = searchParams.get('tipo');
  const search = searchParams.get('search');

  const supabase = getSupabaseAdmin();

  // RBAC: resolver perfil y doctor en paralelo; evita tres consultas secuenciales.
  const [{ data: profile }, { data: doctorProfile }] = await Promise.all([
    supabase.from('usuarios').select('rol, preferencias').eq('id', auth.user.id).maybeSingle(),
    supabase.from('doctores').select('id').eq('usuario_id', auth.user.id).maybeSingle(),
  ]);
  const userRole = profile?.rol;
  const sessionDoctorId = doctorProfile?.id ?? null;
  const focus = userRole === 'admin'
    && typeof profile?.preferencias === 'object'
    && profile.preferencias !== null
    && (profile.preferencias as Record<string, unknown>).modo_focus === true;
  const filtrarPorDoctor = userRole === 'doctor' || (userRole === 'admin' && focus && sessionDoctorId);
  const doctorFiltro = filtrarPorDoctor ? sessionDoctorId : doctorId;

  // ── Cirugías ──
  let queryCirugias = supabase
    .from('agenda_cirugias')
    .select(`
      id, paciente_id, nombre_paciente, fecha, hora, doctor_id, estado,
      procedimiento, tiempo_estimado,
      doctores:doctor_id (nombre_completo)
    `);

  if (fechaDesde) queryCirugias = queryCirugias.gte('fecha', fechaDesde);
  if (fechaHasta) queryCirugias = queryCirugias.lte('fecha', fechaHasta);
  if (doctorFiltro) queryCirugias = queryCirugias.eq('doctor_id', doctorFiltro);
  if (estado) queryCirugias = queryCirugias.eq('estado', estado);
  if (search) queryCirugias = queryCirugias.or(`nombre_paciente.ilike.%${search}%,expediente.ilike.%${search}%`);

  // ── Consultas ──
  let queryConsultas = supabase
    .from('consultas')
    .select(`
      id,
      paciente_id,
      doctor_id,
      fecha,
      hora_inicio,
      tipo_consulta,
      estatus,
      doctores:doctor_id (nombre_completo),
      pacientes:paciente_id (nombre_completo)
    `);

  if (fechaDesde) queryConsultas = queryConsultas.gte('fecha', fechaDesde);
  if (fechaHasta) queryConsultas = queryConsultas.lte('fecha', fechaHasta);
  if (doctorFiltro) queryConsultas = queryConsultas.eq('doctor_id', doctorFiltro);
  if (search) queryConsultas = queryConsultas.or(`nombre_completo.ilike.%${search}%`, { foreignTable: 'pacientes' });

  const shouldQueryCirugias = !tipo || tipo === 'cirugia';
  const shouldQueryConsultas = !tipo || tipo === 'consulta' || tipo === 'estudio';

  const [{ data: cirugias, error: errorCirugias }, { data: consultas, error: errorConsultas }] = await Promise.all([
    shouldQueryCirugias ? queryCirugias.order('fecha', { ascending: true }).order('hora', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    shouldQueryConsultas ? queryConsultas.order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);

  if (errorCirugias || errorConsultas) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  const eventosCirugias = (cirugias || []).map((c) => ({
    id: c.id,
    paciente_id: c.paciente_id,
    nombre_paciente: c.nombre_paciente,
    fecha: c.fecha,
    hora: c.hora,
    doctor_id: c.doctor_id,
    doctor_nombre: (c as any).doctores?.nombre_completo || null,
    estado: c.estado,
    procedimiento: c.procedimiento || null,
    tiempo_estimado: c.tiempo_estimado || null,
    tipo: 'cirugia' as const,
  }));

  const eventosConsultas = (consultas || [])
    .filter(c => {
      if (tipo === 'estudio') return c.tipo_consulta?.toUpperCase().includes('ESTUDIO');
      if (tipo === 'consulta') return !c.tipo_consulta?.toUpperCase().includes('ESTUDIO');
      return true;
    })
    .map((c) => ({
    id: c.id,
    paciente_id: c.paciente_id,
    nombre_paciente: (c as any).pacientes?.nombre_completo || '',
    fecha: c.fecha,
    hora: c.hora_inicio,
    procedimiento: c.tipo_consulta || 'Consulta',
    doctor_id: c.doctor_id,
    doctor_nombre: (c as any).doctores?.nombre_completo || null,
    estado: (ESTADO_CONSULTA_A_AGENDA[c.estatus || ''] || 'agendada') as any,
    tipo: (c.tipo_consulta?.toUpperCase().includes('ESTUDIO') ? 'estudio' : 'consulta') as 'consulta' | 'estudio',
  }));

  const todos = [...eventosCirugias, ...eventosConsultas].sort((a, b) => {
    const fa = (a.fecha || '').localeCompare(b.fecha || '');
    if (fa !== 0) return fa;
    return (a.hora || '').localeCompare(b.hora || '');
  });

  const total = todos.length;
  const result = todos.slice(from, to + 1);

  const response = NextResponse.json({ data: result, total, page, pageSize });
  response.headers.set('Server-Timing', `agenda;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return response;
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
      inventario_item_id: data.inventario_item_id || null,
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
