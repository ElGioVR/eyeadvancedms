import { NextResponse } from 'next/server';
import { etiquetaTipoConsulta } from '@/lib/catalogos/tipos-consulta';
import { notificarAsignacion } from '@/services/notificaciones';
import { sanitizarBusqueda } from '@/lib/text';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { ROLES_GESTION_AGENDA, ROLES_VER_AGENDA, agendaSoloPropia } from '@/lib/permisos-agenda';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { reservarLente } from '@/lib/cirugia-lentes';
import { errorInterno, fechaISO, horaHHMM, leerJSON, leerQuery, uuid } from '@/lib/api/validar';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';
import { enSegundoPlano } from '@/lib/segundo-plano';
import { detalleEvento } from '@/lib/bandeja-agenda';
import { LOTE_FILAS, MAX_FILAS_FUENTE, leerPorLotes } from '@/lib/supabase/leer-por-lotes';

interface DatosConfirmacion { confirmacion: string | null; confirmacion_medio: string | null; confirmacion_at: string | null; origen_registro: string | null }
const SIN_CONFIRMACION: DatosConfirmacion = { confirmacion: null, confirmacion_medio: null, confirmacion_at: null, origen_registro: null };

/** Lee la confirmación de las citas por id; si faltan columnas, degrada sin romper la agenda. */
async function leerConfirmaciones(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tabla: 'agenda_cirugias' | 'consultas',
  ids: string[],
): Promise<Map<string, DatosConfirmacion>> {
  const mapa = new Map<string, DatosConfirmacion>();
  if (ids.length === 0) return mapa;
  // También el origen del registro (import masivo / agenda); cada columna faltante degrada sin romper.
  for (const columnas of ['id, confirmacion, confirmacion_medio, confirmacion_at, origen_registro', 'id, confirmacion, confirmacion_medio, confirmacion_at', 'id, confirmacion, confirmacion_at', 'id, origen_registro']) {
    let ok = true;
    // Lotes de 200 ids en paralelo (con miles de citas en serie era lento).
    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));
    const respuestas = await Promise.all(lotes.map((lote) => supabase.from(tabla).select(columnas).in('id', lote)));
    for (const { data, error } of respuestas) {
      if (error) { ok = false; mapa.clear(); break; }
      for (const f of (data || []) as unknown as Array<Record<string, string | null>>) {
        mapa.set(f.id as string, {
          confirmacion: f.confirmacion ?? null,
          confirmacion_medio: f.confirmacion_medio ?? null,
          confirmacion_at: f.confirmacion_at ?? null,
          origen_registro: f.origen_registro ?? null,
        });
      }
    }
    if (ok) break;
  }
  return mapa;
}

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
/** Tope de eventos por respuesta (el calendario pide el rango completo en una página). */
const MAX_PAGE_SIZE = 5000;

const ESTADOS_AGENDA = ['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada'] as const;

const agendaQuerySchema = z.object({
  page: z.coerce.number().int().catch(1).transform((n) => Math.min(100_000, Math.max(1, n))),
  // El calendario pide el rango completo (antes se recortaba a 500 y se perdían citas).
  pageSize: z.coerce.number().int().catch(50).transform((n) => Math.min(MAX_PAGE_SIZE, Math.max(1, n))),
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

/** Datos de la ficha del paciente para la vista rápida de la agenda. */
function fichaPaciente(
  p: { sexo?: string | null; fecha_nacimiento?: string | null; edad?: number | null; numero_expediente?: string | null } | null | undefined,
  expedienteEvento?: string | null,
) {
  return {
    paciente_expediente: expedienteEvento || p?.numero_expediente || null,
    paciente_sexo: p?.sexo ?? null,
    paciente_fecha_nacimiento: p?.fecha_nacimiento ?? null,
    paciente_edad: p?.edad ?? null,
  };
}

async function manejarGET(request: Request) {
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
  if (!profile || profile.activo !== true || !ROLES_VER_AGENDA.includes(profile.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const userRole = profile.rol;
  // Enfermería ve solo su propia ocupación; admin, recepción y doctor ven todo.
  const propia = agendaSoloPropia(userRole);
  const focus = userRole === 'admin' && profile.preferencias?.modo_focus === true;

  // El vínculo usuario → doctores solo se consulta cuando filtra (enfermería o admin en modo focus).
  let sessionDoctorId: string | null = null;
  if (propia || focus) {
    const { data: doctorProfile } = await supabase
      .from('doctores')
      .select('id')
      .eq('usuario_id', auth.user.id)
      .maybeSingle();
    sessionDoctorId = doctorProfile?.id ?? null;
  }
  const filtrarPorDoctor = propia || (userRole === 'admin' && focus && sessionDoctorId);
  const doctorFiltro = filtrarPorDoctor ? sessionDoctorId : doctorId;


  // ── Cirugías ──
  // Equipo de la persona filtrada (cirujano principal o participante: anestesiólogo,
  // instrumentista, enfermero, circulante…). Se resuelve antes de armar la consulta.
  // Enfermería ve todas las cirugías (solo se marcan las suyas); el filtro de doctor aplica a los demás.
  const doctorFiltroCirugias = propia ? null : doctorFiltro;
  let idsParticipacion: string[] = [];
  if (doctorFiltroCirugias) {
    const { data: participaciones } = await leerPorLotes<{ cirugia_id: string }>(() => {
      let qPart = supabase
        .from('cirugia_participantes')
        .select('cirugia_id, agenda_cirugias!inner(fecha)')
        .eq('medico_id', doctorFiltroCirugias)
        .order('cirugia_id', { ascending: true });
      if (fechaDesde) qPart = qPart.gte('agenda_cirugias.fecha', fechaDesde);
      if (fechaHasta) qPart = qPart.lte('agenda_cirugias.fecha', fechaHasta);
      return qPart;
    });
    idsParticipacion = Array.from(new Set(participaciones.map((p) => p.cirugia_id)));
  }

  // Cada lote necesita un builder nuevo (los builders de supabase-js acumulan filtros).
  const construirCirugias = () => {
    let queryCirugias = supabase
      .from('agenda_cirugias')
      .select(`
        id, paciente_id, nombre_paciente, expediente, fecha, hora, doctor_id, estado,
        procedimiento, procedencia, tiempo_estimado, ojo, diagnostico, notas,
        doctores:doctor_id (alias),
        paciente:paciente_id (sexo, fecha_nacimiento, edad, numero_expediente),
        origen:origen_id (nombre),
        servicio:servicio_id (nombre)
      `);
    if (fechaDesde) queryCirugias = queryCirugias.gte('fecha', fechaDesde);
    if (fechaHasta) queryCirugias = queryCirugias.lte('fecha', fechaHasta);
    if (doctorFiltroCirugias) {
      queryCirugias = idsParticipacion.length
        ? queryCirugias.or(`doctor_id.eq.${doctorFiltroCirugias},id.in.(${idsParticipacion.join(',')})`)
        : queryCirugias.eq('doctor_id', doctorFiltroCirugias);
    }
    if (estado) queryCirugias = queryCirugias.eq('estado', estado);
    if (searchSeguro) queryCirugias = queryCirugias.or(`nombre_paciente.ilike.%${searchSeguro}%,expediente.ilike.%${searchSeguro}%`);
    // Orden total (id desempata): sin él, los lotes por rango pueden repetir u omitir filas.
    return queryCirugias
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
      .order('id', { ascending: true });
  };

  // ── Consultas ──
  const construirConsultas = () => {
    let queryConsultas = supabase
      .from('consultas')
      .select(`
        id,
        paciente_id,
        doctor_id,
        fecha,
        hora_inicio,
        tipo_consulta,
        tipo_visita,
        estatus,
        estudio_1,
        estudio_2,
        estudio_3,
        procedimiento,
        notas,
        doctores:doctor_id (alias),
        especialidad:especialidad_id (nombre),
        pacientes:paciente_id${searchSeguro ? '!inner' : ''} (nombre_completo, sexo, fecha_nacimiento, edad, numero_expediente)
      `);
    if (fechaDesde) queryConsultas = queryConsultas.gte('fecha', fechaDesde);
    if (fechaHasta) queryConsultas = queryConsultas.lte('fecha', fechaHasta);
    // Consultas propias y estudios asignados a la persona (p. ej. enfermería con honorarios).
    if (doctorFiltro) {
      queryConsultas = queryConsultas.or(
        `doctor_id.eq.${doctorFiltro},estudio_1_doctor_id.eq.${doctorFiltro},estudio_2_doctor_id.eq.${doctorFiltro},estudio_3_doctor_id.eq.${doctorFiltro}`
      );
    }
    // Con `!inner` el filtro sobre pacientes sí reduce las consultas.
    if (searchSeguro) queryConsultas = queryConsultas.or(`nombre_completo.ilike.%${searchSeguro}%`, { foreignTable: 'pacientes' });
    return queryConsultas
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .order('id', { ascending: true });
  };

  const shouldQueryCirugias = !tipo || tipo === 'cirugia';
  // Consultas: enfermería solo ve las suyas (sin vínculo a `doctores`, ninguna).
  const shouldQueryConsultas = (!tipo || tipo === 'consulta' || tipo === 'estudio') && !(propia && !sessionDoctorId);

  const vacio = { data: [], error: null, truncado: false };
  const [resCirugias, resConsultas] = await Promise.all([
    // Cada fuente viene ordenada: para la página pedida bastan sus primeras `to + 1` filas.
    shouldQueryCirugias ? leerPorLotes(construirCirugias, to + 1) : Promise.resolve(vacio),
    shouldQueryConsultas ? leerPorLotes(construirConsultas, to + 1) : Promise.resolve(vacio),
  ]);
  const { data: cirugias, error: errorCirugias } = resCirugias;
  const { data: consultas, error: errorConsultas } = resConsultas;
  const truncado = resCirugias.truncado || resConsultas.truncado;
  if (truncado) {
    console.warn('[agenda.listar] tope de filas alcanzado', { fechaDesde, fechaHasta, doctorFiltro, tope: MAX_FILAS_FUENTE });
  }
  const dbDur = performance.now() - startedAt - authDur;

  // Cirugías en las que participa la persona (cirujano o equipo), para resaltarlas.
  const mias = new Set<string>();
  if (sessionDoctorId) {
    let qMias = supabase
      .from('cirugia_participantes')
      .select('cirugia_id, agenda_cirugias!inner(fecha)')
      .eq('medico_id', sessionDoctorId)
      .limit(LOTE_FILAS);
    if (fechaDesde) qMias = qMias.gte('agenda_cirugias.fecha', fechaDesde);
    if (fechaHasta) qMias = qMias.lte('agenda_cirugias.fecha', fechaHasta);
    const { data: partMias } = await qMias;
    for (const p of partMias || []) mias.add((p as { cirugia_id: string }).cirugia_id);
  }

  if (errorCirugias || errorConsultas) {
    return errorInterno(errorCirugias || errorConsultas, 'agenda.listar');
  }

  // Confirmación de la cita (best-effort: si falta el SQL de confirmación o del medio, la agenda sigue igual).
  const [confCirugias, confConsultas] = await Promise.all([
    leerConfirmaciones(supabase, 'agenda_cirugias', (cirugias || []).map((c) => c.id as string)),
    leerConfirmaciones(supabase, 'consultas', (consultas || []).map((c) => c.id as string)),
  ]);

  const eventosCirugias = (cirugias || []).map((c) => ({
    ...(confCirugias.get(c.id as string) ?? SIN_CONFIRMACION),
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
    // Lo que se ve en la tarjeta: procedimiento + ojo; si no hay, el diagnóstico (a qué viene el paciente).
    detalle:
      detalleEvento({ tipo: 'cirugia', procedimiento: c.procedimiento || (c as any).servicio?.nombre, ojo: (c as any).ojo }) ||
      c.diagnostico || null,
    procedencia: c.procedencia || (c as any).origen?.nombre || null,
    notas: (c as any).notas || null,
    tiempo_estimado: c.tiempo_estimado || null,
    mi_participacion: !!sessionDoctorId && (mias.has(c.id) || c.doctor_id === sessionDoctorId),
    tipo: 'cirugia' as const,
    ...fichaPaciente((c as any).paciente, (c as any).expediente),
  }));

  const eventosConsultas = (consultas || [])
    .filter(c => {
      if (tipo === 'estudio') return c.tipo_consulta?.toUpperCase().includes('ESTUDIO');
      if (tipo === 'consulta') return !c.tipo_consulta?.toUpperCase().includes('ESTUDIO');
      return true;
    })
    .map((c) => {
    const tipoEv = (c.tipo_consulta?.toUpperCase().includes('ESTUDIO') ? 'estudio' : 'consulta') as 'consulta' | 'estudio';
    // Tarjeta: qué estudio, qué procedimiento o qué tipo de consulta (antes solo «CONSULTA»/«ESTUDIO»).
    const detalle = detalleEvento({
      tipo: tipoEv,
      tipo_consulta: c.tipo_consulta,
      tipo_consulta_label: etiquetaTipoConsulta(c.tipo_consulta, (c as any).tipo_visita),
      especialidad: (c as any).especialidad?.nombre,
      procedimiento: (c as any).procedimiento,
      estudios: [(c as any).estudio_1, (c as any).estudio_2, (c as any).estudio_3],
    });
    return {
    ...(confConsultas.get(c.id as string) ?? SIN_CONFIRMACION),
    id: c.id,
    paciente_id: c.paciente_id,
    nombre_paciente: (c as any).pacientes?.nombre_completo || '',
    fecha: c.fecha,
    hora: c.hora_inicio,
    procedimiento: detalle || c.tipo_consulta || 'Consulta',
    detalle,
    notas: (c as any).notas || null,
    // Punto II: especialidad y tipo (Primera / Subsecuente / Estudios / Procedimientos).
    especialidad: (c as any).especialidad?.nombre || null,
    tipo_consulta_label: etiquetaTipoConsulta(c.tipo_consulta, (c as any).tipo_visita),
    doctor_id: c.doctor_id,
    doctor_nombre: (c as any).doctores?.alias || null,
    estado: (ESTADO_CONSULTA_A_AGENDA[c.estatus || ''] || 'agendada') as any,
    tipo: tipoEv,
    ...fichaPaciente((c as any).pacientes),
  };
  });

  const todos = [...eventosCirugias, ...eventosConsultas].sort((a, b) => {
    const fa = (a.fecha || '').localeCompare(b.fecha || '');
    if (fa !== 0) return fa;
    return (a.hora || '').localeCompare(b.hora || '');
  });

  const total = todos.length;
  const result = todos.slice(from, to + 1);

  const response = NextResponse.json({ data: result, total, page, pageSize, truncado });
  response.headers.set(
    'Server-Timing',
    `auth;dur=${authDur.toFixed(1)}, db;dur=${dbDur.toFixed(1)}, agenda;dur=${(performance.now() - startedAt).toFixed(1)}`
  );
  return response;
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ROLES_GESTION_AGENDA);
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
    // Comentarios clinica (oct 2026): programar RESERVA el lente; el stock baja al completar.
    const reserva = await reservarLente({
      cirugiaId: cirugia.id,
      orden: 'PRIMERO',
      origen: 'INVENTARIO',
      inventarioItemId: data.inventario_item_id,
    });
    if (!reserva.ok) {
      await supabase.from('agenda_cirugias').delete().eq('id', cirugia.id);
      return NextResponse.json({ error: reserva.error }, { status: 400 });
    }
  }

  // Notifica al doctor asignado (best-effort: un fallo no invalida la cirugía ya creada)
  enSegundoPlano(
    notificarAsignacion({
      doctorId: cirugia.doctor_id,
      tipoServicio: 'Cirugía',
      paciente: cirugia.nombre_paciente,
      fecha: cirugia.fecha,
      hora: cirugia.hora,
      entidadTipo: 'agenda_cirugia',
      entidadId: cirugia.id,
      actorUserId: auth.user.id,
    }),
    'agenda.crear.notificar',
  );

  return NextResponse.json(cirugia, { status: 201 });
}

export const GET = ruta('agenda#GET', manejarGET);
export const POST = ruta('agenda#POST', manejarPOST);
