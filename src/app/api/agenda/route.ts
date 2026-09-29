import { NextResponse } from 'next/server';
import { notificarAsignacion } from '@/services/notificaciones';
import { sanitizarBusqueda } from '@/lib/text';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { consumirLIO } from '@/lib/inventario';
import { errorInterno, fechaISO, horaHHMM, leerJSON, leerQuery, uuid } from '@/lib/api/validar';
import { z } from 'zod';

/** Ojo: '' (sin dato) u OD/OI/OU; la tabla tiene CHECK sobre esos valores (antes: 500 en BD). */
const ojoSchema = z
  .string()
  .max(10)
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => v === '' || v === 'OD' || v === 'OI' || v === 'OU', 'Ojo no válido (OD, OI u OU)');

const cirugiaCreateSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  nombre_paciente: z.string().min(1).max(255),
  expediente: z.string().max(50).optional().nullable(),
  fecha: fechaISO.optional().nullable(),
  hora: horaHHMM.optional().nullable(),
  jornada: z.string().max(100).optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  procedimiento: z.string().max(255).optional().nullable(),
  ojo: ojoSchema.optional().nullable(),
  lio: z.string().max(100).optional().nullable(),
  marca_lio: z.string().max(100).optional().nullable(),
  tiempo_estimado: z.string().max(50).optional().nullable(),
  tiempo_estancia: z.string().max(50).optional().nullable(),
  doctor_id: z.string().uuid().optional().nullable(),
  estado: z.enum(['agendada', 'aplazada', 'completada', 'cancelada']).optional(),
  procedencia: z.string().max(255).optional().nullable(),
  motivo_aplazamiento: z.string().max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  inventario_item_id: z.string().uuid().optional().nullable(),
}).strict();

/** Los `null` del body equivalen a «no enviado» (comportamiento previo). */
function quitarNulos(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(quitarNulos);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (val !== null) out[k] = quitarNulos(val);
    return out;
  }
  return v;
}
const cirugiaCreateBodySchema = z.preprocess(quitarNulos, cirugiaCreateSchema);

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

/** Rango máximo (días) que puede pedir el calendario/productividad sin búsqueda. */
const MAX_DIAS_RANGO = 731; // igual que los reportes de productividad (DoctorDetalle)
/** Tope de filas por fuente (cirugías / consultas) antes de fusionar y paginar. */
const MAX_FILAS_FUENTE = 2000;

const ESTADOS_AGENDA = ['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada'] as const;

const agendaQuerySchema = z.object({
  page: z.coerce.number().int().catch(1).transform((n) => Math.min(100_000, Math.max(1, n))),
  // El front pide 500; valores mayores se recortan (antes: Math.min(500, …)).
  pageSize: z.coerce.number().int().catch(50).transform((n) => Math.min(500, Math.max(1, n))),
  fechaDesde: fechaISO.optional(),
  fechaHasta: fechaISO.optional(),
  doctorId: uuid.optional(),
  estado: z.enum(ESTADOS_AGENDA).optional(),
  tipo: z.enum(['cirugia', 'consulta', 'estudio']).optional(),
  search: z.string().max(100).optional(),
});

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const authDur = performance.now() - startedAt;

  const q = leerQuery(request, agendaQuerySchema);
  if (q instanceof NextResponse) return q;
  const { page, pageSize, fechaDesde, fechaHasta, doctorId, estado, tipo, search } = q;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const searchSeguro = search ? sanitizarBusqueda(search) : '';

  // Rango obligatorio y acotado salvo búsqueda (evita barrer toda la agenda).
  if (!searchSeguro) {
    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json({ error: 'El rango de fechas (fechaDesde y fechaHasta) es obligatorio' }, { status: 400 });
    }
  }
  if (fechaDesde && fechaHasta) {
    const dias = diasEntre(fechaDesde, fechaHasta);
    if (Number.isNaN(dias) || dias < 0) {
      return NextResponse.json({ error: 'Rango de fechas no válido' }, { status: 400 });
    }
    if (dias > MAX_DIAS_RANGO) {
      return NextResponse.json({ error: `El rango de fechas no puede exceder ${MAX_DIAS_RANGO} días` }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();

  // RBAC con el perfil que ya trae requireAuth (sin otra consulta a `usuarios`).
  const profile = auth.perfil;
  const ROLES_AGENDA = ['admin', 'doctor', 'recepcionista'];
  if (!profile || profile.activo !== true || !ROLES_AGENDA.includes(profile.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const userRole = profile.rol;
  const focus = userRole === 'admin' && profile.preferencias?.modo_focus === true;

  // El vínculo usuario → doctores solo se consulta cuando filtra (doctor o admin en modo focus).
  let sessionDoctorId: string | null = null;
  if (userRole === 'doctor' || focus) {
    const { data: doctorProfile } = await supabase
      .from('doctores')
      .select('id')
      .eq('usuario_id', auth.user.id)
      .maybeSingle();
    sessionDoctorId = doctorProfile?.id ?? null;
  }
  const filtrarPorDoctor = userRole === 'doctor' || (userRole === 'admin' && focus && sessionDoctorId);
  const doctorFiltro = filtrarPorDoctor ? sessionDoctorId : doctorId;

  // Un doctor sin vínculo a `doctores` no debe ver la agenda de todos.
  if (userRole === 'doctor' && !sessionDoctorId) {
    return NextResponse.json({ data: [], total: 0, page, pageSize });
  }

  // ── Cirugías ──
  let queryCirugias = supabase
    .from('agenda_cirugias')
    .select(`
      id, paciente_id, nombre_paciente, fecha, hora, doctor_id, estado,
      procedimiento, procedencia, tiempo_estimado,
      doctores:doctor_id (alias),
      origen:origen_id (nombre),
      servicio:servicio_id (nombre)
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
  // Con `!inner` el filtro sobre pacientes sí reduce las consultas.
  if (searchSeguro) queryConsultas = queryConsultas.or(`nombre_completo.ilike.%${searchSeguro}%`, { foreignTable: 'pacientes' });

  const shouldQueryCirugias = !tipo || tipo === 'cirugia';
  const shouldQueryConsultas = !tipo || tipo === 'consulta' || tipo === 'estudio';

  const [{ data: cirugias, error: errorCirugias }, { data: consultas, error: errorConsultas }] = await Promise.all([
    shouldQueryCirugias
      ? queryCirugias.order('fecha', { ascending: true }).order('hora', { ascending: true }).limit(MAX_FILAS_FUENTE)
      : Promise.resolve({ data: [], error: null }),
    shouldQueryConsultas
      ? queryConsultas.order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }).limit(MAX_FILAS_FUENTE)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const dbDur = performance.now() - startedAt - authDur;

  if (errorCirugias || errorConsultas) {
    return errorInterno(errorCirugias || errorConsultas, 'agenda.listar');
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
    // Cirugías homologadas (RPC) no traen texto libre: se usa el catálogo.
    procedimiento: c.procedimiento || (c as any).servicio?.nombre || null,
    procedencia: c.procedencia || (c as any).origen?.nombre || null,
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

  const data = await leerJSON(request, cirugiaCreateBodySchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

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

  if (error || !cirugia) {
    return NextResponse.json(
      { error: handleSupabaseError(error, 'agenda.crear').mensaje },
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

  // Notifica al doctor asignado (best-effort: un fallo no invalida la cirugía ya creada)
  await notificarAsignacion({
    doctorId: cirugia.doctor_id,
    tipoServicio: 'Cirugía',
    paciente: cirugia.nombre_paciente,
    fecha: cirugia.fecha,
    hora: cirugia.hora,
    entidadTipo: 'agenda_cirugia',
    entidadId: cirugia.id,
    actorUserId: auth.user.id,
  }).catch(() => undefined);

  return NextResponse.json(cirugia, { status: 201 });
}
