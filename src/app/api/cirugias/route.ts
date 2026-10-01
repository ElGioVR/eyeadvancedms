import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError, mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { detectarConflictosAgenda, detectarConflictosPersonal } from '@/lib/agenda-conflictos';
import { horarioCirugia, seTraslapan } from '@/lib/catalogos/equipo-quirurgico';
import { aMinutos } from '@/lib/agenda-slots';
import { calcularProductividadCirugia } from '@/lib/productividad';
import { ROL_ANESTESIOLOGO, esAnestesiologo } from '@/lib/catalogos/personal';
import { consumirLIO } from '@/lib/inventario';
import { enSegundoPlano } from '@/lib/segundo-plano';
import { horaHHMM, leerJSON, uuid } from '@/lib/api/validar';
import { z } from 'zod';
import { TIPOS_LIO, VALORES_ANESTESIA, VALORES_ROL_PERSONAL } from '@/lib/catalogos/cirugia';

/** Tope del listado (se usa filtrado por paciente o consulta). */
const MAX_LISTADO = 500;

const listarQuerySchema = z.object({
  consulta_id: uuid.optional(),
  paciente_id: uuid.optional(),
});

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Perfil ya memorizado por requireAuth: sin viaje extra.
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('consulta_id') || undefined;
  const pacienteId = searchParams.get('paciente_id') || undefined;
  const filtros = listarQuerySchema.safeParse({ consulta_id: consultaId, paciente_id: pacienteId });
  if (!filtros.success) {
    return NextResponse.json({ error: 'Filtro no válido (se esperaba un ID)' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agenda_cirugias')
    .select('id, codigo, paciente_id, nombre_paciente, fecha, hora, estado, ojo, servicio:servicio_id(nombre), origen:origen_id(nombre), consulta_id')
    .order('fecha', { ascending: false })
    .limit(MAX_LISTADO);

  if (consultaId) {
    query = query.eq('consulta_id', consultaId);
  }
  if (pacienteId) {
    query = query.eq('paciente_id', pacienteId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'cirugias.listar').mensaje }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

const horarioValido = (d: { hora_inicio?: string | null; hora_fin?: string | null }) =>
  !d.hora_inicio || !d.hora_fin || d.hora_fin.slice(0, 5) > d.hora_inicio.slice(0, 5);

const participanteSchema = z.object({
  medico_id: z.string().uuid(),
  rol_id: z.string().uuid(),
  // Equipo homologado (mig. 370): horario propio dentro de la cirugía
  hora_inicio: horaHHMM.optional().nullable(),
  hora_fin: horaHHMM.optional().nullable(),
}).strict().refine(horarioValido, { message: 'El horario de un participante debe terminar después de iniciar' });

const personalSchema = z.object({
  rol: z.enum(VALORES_ROL_PERSONAL),
  personal_id: z.string().uuid(),
  hora_inicio: horaHHMM,
  hora_fin: horaHHMM,
}).strict().refine(horarioValido, { message: 'El horario del personal de apoyo debe terminar después de iniciar' });

const cirugiaCreateSchema = z.object({
  paciente_id: z.string().uuid(),
  origen_id: z.string().uuid(),
  servicio_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'La hora debe tener formato HH:MM o HH:MM:SS'),
  duracion_min: z.number().int().positive('La duración estimada debe ser mayor a 0').max(24 * 60, 'La duración estimada no puede exceder 24 horas'),
  recurso_id: z.string().uuid().optional().nullable(),
  ojo: z.enum(['OD', 'OI', 'OU']),
  inventario_item_id: z.string().uuid().optional().nullable(),
  lio: z.string().min(1).max(255).optional().nullable(),
  marca_lio: z.string().min(1).max(255).optional().nullable(),
  consulta_id: z.string().uuid().optional().nullable(),
  participantes: z.array(participanteSchema).min(1, 'Debe asignar al menos un participante').max(20, 'Demasiados participantes'),
  notas: z.string().max(2000).optional().nullable(),
  // Punto I (Modificaciones agenda): diagnóstico propio y anestesia obligatoria.
  diagnostico: z.string().trim().max(500).optional().nullable(),
  anestesia: z.enum(VALORES_ANESTESIA, { errorMap: () => ({ message: 'Selecciona el tipo de anestesia' }) }),
  // I.1 Datos generales
  procedencia: z.string().trim().max(255).optional().nullable(),
  motivo_consulta: z.string().trim().max(500).optional().nullable(),
  especialidad_id: z.string().uuid().optional().nullable(),
  // I.2 Tipo de LIO (monofocal/trifocal × tórico/no tórico)
  tipo_lio: z.enum(TIPOS_LIO.map((t) => t.value) as [string, ...string[]]).optional().nullable(),
  // Modelo del catálogo cat_modelos_lio (mig. 1800000000360)
  modelo_lio_id: z.string().uuid().optional().nullable(),
  // Bandera «Tórico» del selector de LIO (se usa si no hay modelo ni tipo)
  lio_torico: z.boolean().optional().nullable(),
  // I.2 Procedimientos adicionales (ids de aseguranza_servicios; el principal es servicio_id)
  procedimientos_adicionales: z.array(z.string().uuid()).max(10, 'Demasiados procedimientos').optional().nullable(),
  // I.2 Personal de apoyo (personal_clinico) con horario; varias personas por rol
  personal: z.array(personalSchema).max(20, 'Demasiado personal de apoyo').optional().nullable(),
})
  .strict()
  .refine(
    (d) => !(d.inventario_item_id && (d.lio || d.marca_lio)),
    { message: 'Asigne solo un LIO: de inventario o manual, no ambos' }
  )
  .refine(
    (d) => {
      const p = d.personal || [];
      return !p.some((a, i) => p.some((b, j) => j > i && a.personal_id === b.personal_id && seTraslapan(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)));
    },
    { message: 'La misma persona de apoyo aparece dos veces en horarios que se empalman' }
  );

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, cirugiaCreateSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

  // AGE-001 / AGE-002 / VAL-005: detectar conflictos de agenda antes de crear.
  // Médicos con horario propio (equipo homologado) se revisan con su rango;
  // el resto, y el quirófano, con el horario de la cirugía.
  const hCirugia = horarioCirugia(data.hora, data.duracion_min);
  const conHorarioPropio = data.participantes.filter(
    (p) => p.hora_inicio && p.hora_fin && (p.hora_inicio.slice(0, 5) !== hCirugia.inicio || p.hora_fin.slice(0, 5) !== hCirugia.fin)
  );
  const medicos = data.participantes.filter((p) => !conHorarioPropio.includes(p)).map((p) => p.medico_id);
  const personal = data.personal || [];
  const personalIds = Array.from(new Set(personal.map((p) => p.personal_id)));
  const adicionalesIds = Array.from(new Set((data.procedimientos_adicionales || []).filter((id) => id !== data.servicio_id)));
  const rolIds = Array.from(new Set(data.participantes.map((p) => p.rol_id)));
  const medicoIds = Array.from(new Set(data.participantes.map((p) => p.medico_id)));
  const [conflictos, conflictosPropios, conflictosPersonal, personalRes, adicionalesRes, rolesRes, tiposRes] = await Promise.all([
    detectarConflictosAgenda({
      fecha: data.fecha,
      hora: data.hora,
      duracion_min: data.duracion_min,
      medicos,
      recurso_id: data.recurso_id,
    }),
    Promise.all(
      conHorarioPropio.map((p) =>
        detectarConflictosAgenda({
          fecha: data.fecha,
          hora: p.hora_inicio!,
          duracion_min: Math.max(1, aMinutos(p.hora_fin) - aMinutos(p.hora_inicio)),
          medicos: [p.medico_id],
        })
      )
    ).then((r) => r.flat()),
    detectarConflictosPersonal({ fecha: data.fecha, miembros: personal }),
    personalIds.length
      ? supabase.from('personal_clinico').select('id, nombre, activo').in('id', personalIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string; activo: boolean }[], error: null }),
    adicionalesIds.length
      ? supabase.from('aseguranza_servicios').select('id, nombre').in('id', adicionalesIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[], error: null }),
    supabase.from('cat_roles_participante').select('id, clave').in('id', rolIds),
    supabase.from('doctores').select('id, tipo_personal').in('id', medicoIds),
  ]);
  // Anestesiólogos: solo en el rol «Anestesiólogo», y ese rol solo para ellos.
  // (Si la BD aún no tiene tipo_personal, la lectura falla y no se valida, como antes.)
  if (!rolesRes.error && !tiposRes.error) {
    const claveRol = new Map((rolesRes.data || []).map((r: { id: string; clave: string }) => [r.id, r.clave]));
    const tipoDe = new Map((tiposRes.data || []).map((d: { id: string; tipo_personal: string | null }) => [d.id, d.tipo_personal]));
    for (const p of data.participantes) {
      const clave = claveRol.get(p.rol_id) || '';
      const persona = { tipo_personal: tipoDe.get(p.medico_id) ?? null };
      if (clave === ROL_ANESTESIOLOGO && !esAnestesiologo(persona)) {
        return NextResponse.json(
          { error: 'En el rol Anestesiólogo solo se puede asignar personal registrado como anestesiólogo' },
          { status: 400 }
        );
      }
      if (clave && clave !== ROL_ANESTESIOLOGO && esAnestesiologo(persona)) {
        return NextResponse.json(
          { error: 'Los anestesiólogos solo pueden asignarse en el rol Anestesiólogo' },
          { status: 400 }
        );
      }
    }
  }
  const personalCat = (personalRes.data || []) as { id: string; nombre: string; activo: boolean }[];
  if (personalRes.error || personalCat.filter((p) => p.activo).length !== personalIds.length) {
    return NextResponse.json({ error: 'Alguna persona del personal de apoyo no existe o está inactiva' }, { status: 400 });
  }
  conflictos.push(...conflictosPropios);
  if (conflictosPersonal.length > 0) {
    return NextResponse.json(
      { error: conflictosPersonal[0].descripcion, conflictos: conflictosPersonal },
      { status: 409 }
    );
  }
  const adicionales = (adicionalesRes.data || []) as { id: string; nombre: string }[];
  if (adicionalesRes.error || adicionales.length !== adicionalesIds.length) {
    return NextResponse.json({ error: 'Alguno de los procedimientos adicionales no existe' }, { status: 400 });
  }

  if (conflictos.length > 0) {
    return NextResponse.json(
      { error: 'Conflicto de agenda', conflictos },
      { status: 409 }
    );
  }

  const { data: result, error } = await supabase.rpc('crear_cirugia', {
    p_paciente_id: data.paciente_id,
    p_origen_id: data.origen_id,
    p_servicio_id: data.servicio_id,
    p_fecha: data.fecha,
    p_hora: data.hora,
    p_duracion_min: data.duracion_min,
    p_recurso_id: data.recurso_id,
    p_ojo: data.ojo,
    p_inventario_item_id: data.inventario_item_id,
    p_lio: data.lio ?? null,
    p_marca_lio: data.marca_lio ?? null,
    p_consulta_id: data.consulta_id,
    // El RPC solo usa medico_id y rol_id; el horario se guarda después.
    p_participantes: data.participantes.map((p) => ({ medico_id: p.medico_id, rol_id: p.rol_id })),
    p_notas: data.notas,
    p_created_by: auth.user.id,
  });

  if (error) {
    const friendly = errorTranslations[error.message];
    return NextResponse.json(
      { error: friendly || mensajeSeguro(error, 'cirugias') },
      { status: friendly ? 400 : 500 }
    );
  }

  const cirugiaId = (result as any)?.cirugia_id;
  let advertencia: string | null = null;
  if (cirugiaId) {
    // Diagnóstico y anestesia van fuera del RPC crear_cirugia (no se altera su firma):
    // UPDATE inmediato de la fila recién creada, en paralelo con LIO y productividad.
    const tipoLio = TIPOS_LIO.find((t) => t.value === data.tipo_lio);
    // Con modelo del catálogo, diseño y tórico salen del modelo (fuente de verdad).
    let lioDiseno: string | null = tipoLio?.diseno ?? null;
    let lioTorico: boolean | null = tipoLio ? tipoLio.torico : (data.lio_torico ?? null);
    if (data.modelo_lio_id) {
      const { data: modelo } = await supabase
        .from('cat_modelos_lio')
        .select('diseno, torico')
        .eq('id', data.modelo_lio_id)
        .maybeSingle();
      if (modelo) {
        // El CHECK de agenda_cirugias.lio_diseno solo admite MONOFOCAL / TRIFOCAL.
        lioDiseno = modelo.diseno === 'MONOFOCAL' || modelo.diseno === 'TRIFOCAL' ? modelo.diseno : null;
        lioTorico = !!modelo.torico;
      }
    }
    const avisar = (err: unknown, contexto: string) => {
      mensajeSeguro(err, contexto);
      advertencia = 'La cirugía se creó, pero algunos datos clínicos no se guardaron; revísalos en el detalle.';
    };
    const camposClinicosP = Promise.all([
      supabase
        .from('agenda_cirugias')
        .update({
          anestesia: data.anestesia,
          diagnostico: data.diagnostico || null,
          procedencia: data.procedencia || null,
          motivo_consulta: data.motivo_consulta || null,
          especialidad_id: data.especialidad_id || null,
          lio_diseno: lioDiseno,
          lio_torico: lioTorico,
          modelo_lio_id: data.modelo_lio_id || null,
        })
        .eq('id', cirugiaId)
        .then(({ error: e }) => { if (e) avisar(e, 'cirugias.campos-clinicos'); }),
      adicionales.length
        ? supabase
            .from('cirugia_procedimientos')
            .insert(adicionalesIds.map((id, i) => ({
              cirugia_id: cirugiaId,
              servicio_id: id,
              nombre: adicionales.find((a) => a.id === id)!.nombre,
              orden: i + 1,
            })))
            .then(({ error: e }) => { if (e) avisar(e, 'cirugias.procedimientos-adicionales'); })
        : null,
      personal.length
        ? supabase
            .from('cirugia_personal')
            .insert(personal.map((p) => ({
              cirugia_id: cirugiaId,
              rol: p.rol,
              personal_id: p.personal_id,
              nombre: personalCat.find((c) => c.id === p.personal_id)!.nombre,
              hora_inicio: p.hora_inicio,
              hora_fin: p.hora_fin,
            })))
            .then(({ error: e }) => { if (e) avisar(e, 'cirugias.personal'); })
        : null,
      // Horario de cada médico del equipo (columnas de mig. 370)
      ...data.participantes
        .filter((p) => p.hora_inicio && p.hora_fin)
        .map((p) =>
          supabase
            .from('cirugia_participantes')
            .update({ hora_inicio: p.hora_inicio, hora_fin: p.hora_fin })
            .eq('cirugia_id', cirugiaId)
            .eq('medico_id', p.medico_id)
            .eq('rol_id', p.rol_id)
            .then(({ error: e }) => { if (e) avisar(e, 'cirugias.horario-participante'); })
        ),
    ]);
    // Independientes entre sí: en paralelo (antes en serie). consumirLIO es
    // idempotente por cirugía (el RPC ya registra la salida en el Kardex).
    // Productividad: best-effort y fuera del camino de la respuesta (antes se esperaba).
    // Si falla, la productividad queda PENDIENTE sin monto, igual que antes.
    enSegundoPlano(
      (async () => {
        try {
          await calcularProductividadCirugia(cirugiaId);
        } catch {
          // No se interrumpe la creación; la productividad queda PENDIENTE sin monto.
        }
      })(),
      'cirugias.productividad'
    );
    await Promise.allSettled([
      camposClinicosP,
      data.inventario_item_id ? consumirLIO(data.inventario_item_id, cirugiaId, auth.user.id) : Promise.resolve(null),
    ]);
  }

  if (advertencia && result && typeof result === 'object') {
    return NextResponse.json({ ...(result as object), advertencia }, { status: 201 });
  }
  return NextResponse.json(result, { status: 201 });
}
