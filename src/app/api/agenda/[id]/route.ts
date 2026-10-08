import { NextResponse } from 'next/server';
import { notificarAsignacion, notificarCancelacion, notificarReagendado } from '@/services/notificaciones';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { ROLES_GESTION_AGENDA } from '@/lib/permisos-agenda';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { fechaISO, horaHHMM, leerJSON, validarId } from '@/lib/api/validar';
import { liberarLIO } from '@/lib/inventario';
import { VALORES_ANESTESIA } from '@/lib/catalogos/cirugia';
import { completarLentesCirugia, liberarLentes, reservarLente, type OrdenLente } from '@/lib/cirugia-lentes';
import { esTransicionValida, type CirugiaEstado } from '@/lib/cirugia-estados';
import { detectarConflictosAgenda } from '@/lib/agenda-conflictos';
import { MotorDevengoService } from '@/services/productividad';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

/** Ojo: '' (sin dato) u OD/OI/OU; la tabla tiene CHECK sobre esos valores (antes: 500 en BD). */
const ojoSchema = z
  .string()
  .max(10)
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => v === '' || v === 'OD' || v === 'OI' || v === 'OU', 'Ojo no válido (OD, OI u OU)');

const cirugiaUpdateSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  nombre_paciente: z.string().min(1).max(255).optional(),
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
  estado: z.enum(['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada']).optional(),
  procedencia: z.string().max(255).optional().nullable(),
  anestesia: z.enum(VALORES_ANESTESIA).optional().nullable(),
  motivo_consulta: z.string().max(500).optional().nullable(),
  motivo_aplazamiento: z.string().max(500).optional().nullable(),
  motivo: z.string().min(1).max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notificado: z.boolean().optional(),
  inventario_item_id: z.string().uuid().optional().nullable(),
  lentes_requeridos: z.array(z.enum(['PRIMERO', 'SEGUNDO', 'RESPALDO'])).max(3).optional(),
}).strict();

async function manejarGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // El rol se verifica en paralelo con la lectura (ver leerConRol).
  const rolP = requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);

  const supabase = getSupabaseAdmin();

  const r = await leerConRol(rolP, async () =>
    supabase
      .from('agenda_cirugias')
      .select(`
        *,
        doctores:doctor_id (alias),
        paciente:paciente_id (sexo, fecha_nacimiento, edad, numero_expediente)
      `)
      .eq('id', id)
      .maybeSingle()
  );
  if ('denegado' in r) return r.denegado;
  const { data, error } = r.datos;

  if (error || !data) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    doctor_nombre: (data as any).doctores?.alias || null,
    doctores: undefined,
    // Ficha del paciente (si la cirugía está vinculada a uno).
    paciente_sexo: (data as any).paciente?.sexo ?? null,
    paciente_fecha_nacimiento: (data as any).paciente?.fecha_nacimiento ?? null,
    paciente_edad: (data as any).paciente?.edad ?? null,
    expediente: (data as any).expediente || (data as any).paciente?.numero_expediente || null,
    paciente: undefined,
  });
}

async function manejarPATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const rolP = requireRole(auth.user, ROLES_GESTION_AGENDA);
  const supabase = getSupabaseAdmin();

  // Lectura del estado actual (solo lectura) en paralelo con la verificación de
  // rol; nada se escribe antes de confirmar el rol.
  const prevP = Promise.resolve(
    supabase
      .from('agenda_cirugias')
      .select('estado, inventario_item_id, fecha, hora, doctor_id, duracion_min, recurso_id, nombre_paciente')
      .eq('id', id)
      .maybeSingle()
  );
  const roleError = await rolP;
  if (roleError) {
    void prevP.catch(() => undefined);
    return roleError;
  }

  const data = await leerJSON(request, cirugiaUpdateSchema);
  if (data instanceof NextResponse) {
    void prevP.catch(() => undefined);
    return data;
  }
  const updates: Record<string, unknown> = {};

  // Estado actual antes de actualizar (efectos secundarios y máquina de estados)
  const { data: prev, error: prevError } = await prevP;

  if (prevError || !prev) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }

  // AGE-001: detectar conflictos si cambian fecha/hora/doctor/recurso
  const cambiaFecha = data.fecha !== undefined && data.fecha !== prev.fecha;
  const cambiaHora = data.hora !== undefined && data.hora !== prev.hora;
  const cambiaDoctor = data.doctor_id !== undefined && data.doctor_id !== prev.doctor_id;

  if (cambiaFecha || cambiaHora || cambiaDoctor) {
    const nuevaFecha = data.fecha ?? prev.fecha;
    const nuevaHora = data.hora ?? prev.hora;
    const nuevoDoctor = data.doctor_id ?? prev.doctor_id;
    const nuevoRecurso = prev.recurso_id;

    if (nuevaFecha && nuevaHora) {
      const conflictos = await detectarConflictosAgenda({
        fecha: nuevaFecha,
        hora: nuevaHora,
        duracion_min: prev.duracion_min ?? 60,
        medicos: nuevoDoctor ? [nuevoDoctor] : [],
        recurso_id: nuevoRecurso,
      });

      const relevantes = conflictos.filter((c) => c.entidad_id !== id);
      if (relevantes.length > 0) {
        return NextResponse.json(
          { error: 'Conflicto de agenda', conflictos: relevantes },
          { status: 409 }
        );
      }
    }
  }

  // EST-002 / EST-003: validar transición de estados y requerir motivo
  const nuevoEstado = data.estado;
  const estadoAnterior = prev.estado as CirugiaEstado;

  if (nuevoEstado && nuevoEstado !== estadoAnterior) {
    if (!esTransicionValida(estadoAnterior, nuevoEstado)) {
      return NextResponse.json(
        { error: `Transición de estado no permitida: ${estadoAnterior} → ${nuevoEstado}` },
        { status: 400 }
      );
    }
    if (!data.motivo) {
      return NextResponse.json(
        { error: 'El motivo es obligatorio para cambiar el estado de la cirugía' },
        { status: 400 }
      );
    }
    if (nuevoEstado === 'aplazada' && data.motivo) {
      updates.motivo_aplazamiento = data.motivo.trim();
    }
  }

  const fieldMap: Record<string, string> = {
    paciente_id: 'paciente_id',
    nombre_paciente: 'nombre_paciente',
    expediente: 'expediente',
    fecha: 'fecha',
    hora: 'hora',
    jornada: 'jornada',
    diagnostico: 'diagnostico',
    procedimiento: 'procedimiento',
    ojo: 'ojo',
    lio: 'lio',
    marca_lio: 'marca_lio',
    tiempo_estimado: 'tiempo_estimado',
    tiempo_estancia: 'tiempo_estancia',
    doctor_id: 'doctor_id',
    estado: 'estado',
    procedencia: 'procedencia',
    anestesia: 'anestesia',
    motivo_consulta: 'motivo_consulta',
    motivo_aplazamiento: 'motivo_aplazamiento',
    notas: 'notas',
    notificado: 'notificado',
    inventario_item_id: 'inventario_item_id',
  };

  for (const [key, dbCol] of Object.entries(fieldMap)) {
    const val = (data as Record<string, unknown>)[key];
    if (val !== undefined) {
      updates[dbCol] = typeof val === 'string' ? val?.trim() || null : val;
    }
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('agenda_cirugias')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: handleSupabaseError(error, 'agenda.actualizar').mensaje },
      { status: 500 }
    );
  }

  // EST-003: Registrar cambio de estado en historial
  if (nuevoEstado && nuevoEstado !== estadoAnterior) {
    await supabase.from('cirugia_historial').insert({
      cirugia_id: id,
      usuario_id: auth.user.id,
      accion: 'ESTADO_CAMBIADO',
      detalle: {
        de: estadoAnterior,
        a: nuevoEstado,
        motivo: data.motivo,
      },
    });
  }

  // Side-effects: LIO assign/change consumes stock; status transitions adjust as needed
  const prevItem = prev.inventario_item_id ?? null;
  const payloadItem = data.inventario_item_id;
  let itemId = payloadItem !== undefined ? (payloadItem || null) : prevItem;

  if (payloadItem !== undefined) {
    const newId = payloadItem || null;

    if (newId && newId !== prevItem && nuevoEstado !== 'cancelada') {
      // Comentarios clinica (oct 2026): programar RESERVA el lente; el stock baja al completar.
      const reserva = await reservarLente({ cirugiaId: id, orden: 'PRIMERO', origen: 'INVENTARIO', inventarioItemId: newId });
      if (!reserva.ok) {
        await supabase
          .from('agenda_cirugias')
          .update({ inventario_item_id: prevItem, updated_at: new Date().toISOString() })
          .eq('id', id);
        return NextResponse.json({ error: reserva.error }, { status: 400 });
      }
    }

    if (prevItem && prevItem !== newId) {
      await liberarLentes(id, 'PRIMERO');
      await liberarLIO(prevItem, id, auth.user.id); // legado: cirugías que descontaron al programar
    }

    itemId = newId;
  }

  if (itemId && nuevoEstado === 'completada' && estadoAnterior !== 'completada') {
    const requeridos: OrdenLente[] = data.lentes_requeridos ?? ['PRIMERO'];
    const result = await completarLentesCirugia(id, requeridos, auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  if (itemId && nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    await liberarLentes(id);
    await liberarLIO(itemId, id, auth.user.id); // legado
  }

  // Devengo y notificaciones (best-effort) corren juntos; se esperan antes de responder.
  const pendientes: Array<Promise<unknown>> = [];
  if (nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    // best-effort: no bloquea la cancelación de agenda
    pendientes.push(new MotorDevengoService().cancelarPorCirugia(id).catch(() => undefined));
  }

  // Notificaciones al doctor (best-effort, nunca bloquean la respuesta)
  const doctorFinal = data.doctor_id !== undefined ? data.doctor_id : prev.doctor_id;
  const fechaFinal = data.fecha !== undefined ? data.fecha : prev.fecha;
  const horaFinal = data.hora !== undefined ? data.hora : prev.hora;
  const paciente = (data.nombre_paciente as string | undefined) || prev.nombre_paciente || 'Paciente';
  const base = { paciente, entidadTipo: 'agenda_cirugia' as const, entidadId: id, actorUserId: auth.user.id };
  if (nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    pendientes.push(notificarCancelacion({ ...base, doctorId: doctorFinal, fecha: prev.fecha, hora: prev.hora, motivo: data.motivo }));
  } else {
    if (data.doctor_id !== undefined && data.doctor_id !== prev.doctor_id) {
      pendientes.push(notificarAsignacion({ ...base, doctorId: data.doctor_id, tipoServicio: 'Cirugía', fecha: fechaFinal, hora: horaFinal }));
    }
    const cambioFechaHora =
      (data.fecha !== undefined && data.fecha !== prev.fecha) || (data.hora !== undefined && data.hora !== prev.hora);
    const reprogramada = (nuevoEstado === 'reagendada' || nuevoEstado === 'aplazada') && nuevoEstado !== estadoAnterior;
    if ((cambioFechaHora || reprogramada) && doctorFinal === prev.doctor_id) {
      pendientes.push(notificarReagendado({ ...base, doctorId: doctorFinal, fecha: fechaFinal, hora: horaFinal, aplazada: nuevoEstado === 'aplazada' }));
    }
  }

  // Antes: devengo y cada notificación en serie.
  await Promise.allSettled(pendientes);

  return NextResponse.json({ success: true });
}

async function manejarDELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('agenda_cirugias')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: handleSupabaseError(error, 'agenda.eliminar').mensaje },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export const GET = ruta('agenda/[id]#GET', manejarGET);
export const PATCH = ruta('agenda/[id]#PATCH', manejarPATCH);
export const DELETE = ruta('agenda/[id]#DELETE', manejarDELETE);
