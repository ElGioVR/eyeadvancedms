import { NextResponse } from 'next/server';
import { notificarAsignacion } from '@/services/notificaciones';
import { sanitizarBusqueda } from '@/lib/text';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { consumirLIO } from '@/lib/inventario';
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
  AGENDADA: 'agendada',
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
  const authDur = performance.now() - startedAt;

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

  // RBAC en una sola ronda: el mismo SELECT de `usuarios` valida rol/activo
  // (equivalente a requireRole) y trae las preferencias; el doctor en paralelo.
  // Antes: requireRole → (perfil ‖ doctor) = 2 viajes en serie.
  const [{ data: profile }, { data: doctorProfile }] = await Promise.all([
    supabase.from('usuarios').select('rol, activo, preferencias').eq('id', auth.user.id).maybeSingle(),
    supabase.from('doctores').select('id').eq('usuario_id', auth.user.id).maybeSingle(),
  ]);
  const ROLES_AGENDA = ['admin', 'doctor', 'recepcionista'];
  if (!profile || profile.activo !== true || !ROLES_AGENDA.includes(profile.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const userRole = profile.rol;
  const sessionDoctorId = doctorProfile?.id ?? null;
  const focus = userRole === 'admin'
    && typeof profile?.preferencias === 'object'
    && profile.preferencias !== null
    && (profile.preferencias as Record<string, unknown>).modo_focus === true;
  const filtrarPorDoctor = userRole === 'doctor' || (userRole === 'admin' && focus && sessionDoctorId);
  const doctorFiltro = filtrarPorDoctor ? sessionDoctorId : doctorId;

  // Un doctor sin vínculo a `doctores` no debe ver la agenda de todos.
  if (userRole === 'doctor' && !sessionDoctorId) {
    return NextResponse.json({ data: [], total: 0, page, pageSize });
  }

  const searchSeguro = search ? sanitizarBusqueda(search) : '';

  // ── Cirugías ──
  let queryCirugias = supabase
    .from('agenda_cirugias')
    .select(`
      id, paciente_id, nombre_paciente, fecha, hora, doctor_id, estado,
      procedimiento, tiempo_estimado,
      doctores:doctor_id (alias)
    `);

  if (fechaDesde) queryCirugias = queryCirugias.gte('fecha', fechaDesde);
  if (fechaHasta) queryCirugias = queryCirugias.lte('fecha', fechaHasta);
  if (doctorFiltro) queryCirugias = queryCirugias.eq('doctor_id', doctorFiltro);
  if (estado) queryCirugias = queryCirugias.eq('estado', estado);
  if (searchSeguro) queryCirugias = queryCirugias.or(`nombre_paciente.ilike.%${searchSeguro}%,expediente.ilike.%${searchSeguro}%`);

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
      doctores:doctor_id (alias),
      pacientes:paciente_id${searchSeguro ? '!inner' : ''} (nombre_completo)
    `);

  if (fechaDesde) queryConsultas = queryConsultas.gte('fecha', fechaDesde);
  if (fechaHasta) queryConsultas = queryConsultas.lte('fecha', fechaHasta);
  if (doctorFiltro) queryConsultas = queryConsultas.eq('doctor_id', doctorFiltro);
  // Con `!inner` el filtro sobre pacientes sí reduce las consultas (antes solo
  // vaciaba el join y devolvía todas las consultas del rango sin nombre).
  if (searchSeguro) queryConsultas = queryConsultas.or(`nombre_completo.ilike.%${searchSeguro}%`, { foreignTable: 'pacientes' });

  const shouldQueryCirugias = !tipo || tipo === 'cirugia';
  const shouldQueryConsultas = !tipo || tipo === 'consulta' || tipo === 'estudio';

  const [{ data: cirugias, error: errorCirugias }, { data: consultas, error: errorConsultas }] = await Promise.all([
    shouldQueryCirugias ? queryCirugias.order('fecha', { ascending: true }).order('hora', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    shouldQueryConsultas ? queryConsultas.order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);

  const dbDur = performance.now() - startedAt - authDur;

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
    doctor_nombre: (c as any).doctores?.alias || null,
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
    doctor_nombre: (c as any).doctores?.alias || null,
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
  response.headers.set(
    'Server-Timing',
    `auth;dur=${authDur.toFixed(1)}, db;dur=${dbDur.toFixed(1)}, agenda;dur=${(performance.now() - startedAt).toFixed(1)}`
  );
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

  // Validaciones de doctor y paciente en paralelo (antes en serie).
  const [{ data: doctorCheck }, { data: pacienteCheck }] = await Promise.all([
    data.doctor_id
      ? supabase.from('doctores').select('id, activo').eq('id', data.doctor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    data.paciente_id
      ? supabase.from('pacientes').select('id').eq('id', data.paciente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (data.doctor_id) {
    if (!doctorCheck) {
      return NextResponse.json({ error: 'El doctor seleccionado no existe' }, { status: 404 });
    }
    if (!doctorCheck.activo) {
      return NextResponse.json({ error: 'El doctor seleccionado no está activo' }, { status: 400 });
    }
  }

  if (data.paciente_id) {
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

  if (data.inventario_item_id) {
    const consume = await consumirLIO(data.inventario_item_id, cirugia.id, auth.user.id);
    if (!consume.success) {
      await supabase.from('agenda_cirugias').delete().eq('id', cirugia.id);
      return NextResponse.json({ error: consume.error || 'No se pudo descontar el LIO' }, { status: 400 });
    }
  }

  // Notifica al doctor asignado (resuelve doctores.usuario_id)
  await notificarAsignacion({
    doctorId: cirugia.doctor_id,
    tipoServicio: 'Cirugía',
    paciente: cirugia.nombre_paciente,
    fecha: cirugia.fecha,
    hora: cirugia.hora,
    entidadTipo: 'agenda_cirugia',
    entidadId: cirugia.id,
    actorUserId: auth.user.id,
  });

  return NextResponse.json(cirugia, { status: 201 });
}
