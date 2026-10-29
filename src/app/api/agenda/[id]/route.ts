import { NextResponse } from 'next/server';
import { notificarAsignacion, notificarCancelacion, notificarReagendado } from '@/services/notificaciones';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { ROLES_ANULAR_CIRUGIA, ROLES_GESTION_AGENDA } from '@/lib/permisos-agenda';
import { estadoCerrado } from '@/lib/permisos-edicion';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { fechaISO, horaHHMM, leerJSON, validarId } from '@/lib/api/validar';
import { liberarLIO } from '@/lib/inventario';
import { VALORES_ANESTESIA } from '@/lib/catalogos/cirugia';
import { completarLentesCirugia, liberarLentes, reservarLente, revertirLentesUsados, type OrdenLente } from '@/lib/cirugia-lentes';
import { esAnulacionDeCompletada, esTransicionValida, type CirugiaEstado } from '@/lib/cirugia-estados';
import { detectarConflictosAgenda } from '@/lib/agenda-conflictos';
import { MotorDevengoService } from '@/services/productividad';
import { resolverServicioFacturacion } from '@/lib/cirugia-servicio-facturacion';
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
  // Formulario de edición (mismo que la creación).
  duracion_min: z.number().int().min(1).max(1440).optional(),
  quirofano: z.string().max(100).optional().nullable(),
  documentos_faltantes: z.array(z.object({
    tipo_documento: z.string().trim().min(1).max(100),
    motivo: z.string().trim().min(1).max(300),
  })).max(10).optional().nullable(),
  especialidad_id: z.string().uuid().optional().nullable(),
  origen_id: z.string().uuid().optional().nullable(),
  servicio_id: z.string().uuid().optional().nullable(),
  catalogo_quirurgico_id: z.string().uuid().optional().nullable(),
  procedimientos_qx_ids: z.array(z.string().uuid()).max(20).optional(),
  modelo_lio_id: z.string().uuid().optional().nullable(),
  lio_torico: z.boolean().optional().nullable(),
  // Cierre de la cirugía (modal de completar).
  lentes_ingresar_inventario: z.array(z.enum(['PRIMERO', 'SEGUNDO', 'RESPALDO'])).max(3).optional(),
  diagnostico_definitivo: z.string().max(2000).optional().nullable(),
  cirugia_realizada: z.string().max(2000).optional().nullable(),
  complicaciones: z.string().max(2000).optional().nullable(),
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
  const rolP = requireRole(auth.user, [...ROLES_GESTION_AGENDA, 'enfermero']);
  const supabase = getSupabaseAdmin();

  // Lectura del estado actual (solo lectura) en paralelo con la verificación de
  // rol; nada se escribe antes de confirmar el rol.
  const prevP = Promise.resolve(
    supabase
      .from('agenda_cirugias')
      // Fila completa (una sola): permite registrar qué campos cambian al corregir una completada.
      .select('*')
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

  const cambiaDuracion = data.duracion_min !== undefined && data.duracion_min !== prev.duracion_min;

  // Al COMPLETAR (o al corregir una ya completada) se registra el horario real, que ya
  // ocurrió: no se revisan empalmes.
  const yaOcurrio = data.estado === 'completada' || prev.estado === 'completada';
  if (!yaOcurrio && (cambiaFecha || cambiaHora || cambiaDoctor || cambiaDuracion)) {
    const nuevaFecha = data.fecha ?? prev.fecha;
    const nuevaHora = data.hora ?? prev.hora;
    const nuevoDoctor = data.doctor_id ?? prev.doctor_id;
    const nuevoRecurso = prev.recurso_id;

    if (nuevaFecha && nuevaHora) {
      const conflictos = await detectarConflictosAgenda({
        fecha: nuevaFecha,
        hora: nuevaHora,
        duracion_min: data.duracion_min ?? prev.duracion_min ?? 60,
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

  // Enfermería: edita datos de la cirugía, pero no cambia estado, lentes ni inventario, y no edita cerradas.
  if ((await requireRole(auth.user, ['enfermero'])) === null) {
    if (data.estado !== undefined) {
      return NextResponse.json({ error: 'Enfermería no puede cambiar el estado de la cirugía' }, { status: 403 });
    }
    if (data.lentes_requeridos !== undefined || data.inventario_item_id !== undefined) {
      return NextResponse.json({ error: 'Enfermería no puede modificar lentes ni inventario' }, { status: 403 });
    }
    if (estadoCerrado(prev.estado)) {
      return NextResponse.json({ error: 'Una cirugía completada o cancelada no se puede editar' }, { status: 409 });
    }
  }

  // EST-002 / EST-003: validar transición de estados y requerir motivo
  const nuevoEstado = data.estado;
  const estadoAnterior = prev.estado as CirugiaEstado;

  // Anulación: completada → cancelada cuando la cirugía no se realizó (admin, doctor y recepción; no enfermería).
  const anulacion = !!nuevoEstado && esAnulacionDeCompletada(estadoAnterior, nuevoEstado);
  if (anulacion) {
    if ((await requireRole(auth.user, [...ROLES_ANULAR_CIRUGIA])) !== null) {
      return NextResponse.json({ error: 'No tienes permiso para anular una cirugía completada' }, { status: 403 });
    }
    const { data: pagados, error: errPag } = await supabase
      .from('eventos_honorario')
      .select('id')
      .eq('origen_tipo', 'OPERACION')
      .eq('origen_id', id)
      .eq('estado', 'PAGADO')
      .limit(1);
    if (errPag) return NextResponse.json({ error: 'No se pudo revisar los honorarios de la cirugía' }, { status: 500 });
    if ((pagados ?? []).length > 0) {
      return NextResponse.json(
        { error: 'La cirugía tiene honorarios ya pagados. Corrige el pago en Productividad antes de anularla.' },
        { status: 409 }
      );
    }
  }

  if (nuevoEstado && nuevoEstado !== estadoAnterior) {
    if (!anulacion && !esTransicionValida(estadoAnterior, nuevoEstado)) {
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
    duracion_min: 'duracion_min',
    quirofano: 'quirofano',
    documentos_faltantes: 'documentos_faltantes',
    especialidad_id: 'especialidad_id',
    origen_id: 'origen_id',
    servicio_id: 'servicio_id',
    catalogo_quirurgico_id: 'catalogo_quirurgico_id',
    modelo_lio_id: 'modelo_lio_id',
    lio_torico: 'lio_torico',
    diagnostico_definitivo: 'diagnostico_definitivo',
    cirugia_realizada: 'cirugia_realizada',
    complicaciones: 'complicaciones',
  };

  for (const [key, dbCol] of Object.entries(fieldMap)) {
    const val = (data as Record<string, unknown>)[key];
    if (val !== undefined) {
      updates[dbCol] = typeof val === 'string' ? val?.trim() || null : val;
    }
  }

  // Con modelo de LIO del catálogo, diseño y tórico salen del modelo (misma regla que la alta).
  if (data.modelo_lio_id) {
    const { data: modelo } = await supabase.from('cat_modelos_lio').select('diseno, torico').eq('id', data.modelo_lio_id).maybeSingle();
    if (modelo) {
      updates.lio_diseno = modelo.diseno === 'MONOFOCAL' || modelo.diseno === 'TRIFOCAL' ? modelo.diseno : null;
      updates.lio_torico = !!modelo.torico;
    }
  }

  // Cambian los procedimientos quirúrgicos sin servicio explícito: la facturación se resuelve desde el catálogo.
  if (data.procedimientos_qx_ids?.length && data.servicio_id === undefined) {
    const origen = (data.origen_id as string | null | undefined) ?? (prev as { origen_id?: string | null }).origen_id ?? null;
    if (origen) {
      const r = await resolverServicioFacturacion(supabase, origen, data.procedimientos_qx_ids);
      if (r.id) updates.servicio_id = r.id;
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

  // Procedimientos quirúrgicos (varios): se reemplazan y el primero queda como principal.
  if (data.procedimientos_qx_ids !== undefined) {
    const qxIds = Array.from(new Set(data.procedimientos_qx_ids));
    // El principal se guarda primero: aunque falle la tabla de varios, la cirugía queda coherente.
    await supabase.from('agenda_cirugias').update({ catalogo_quirurgico_id: qxIds[0] ?? null }).eq('id', id);
    const errorQx = (err: Parameters<typeof handleSupabaseError>[0]) => {
      handleSupabaseError(err, 'agenda.procedimientos-qx');
      return NextResponse.json(
        { error: 'Los demás cambios se guardaron, pero no la lista de procedimientos quirúrgicos. Intenta de nuevo o avisa a soporte.' },
        { status: 500 },
      );
    };
    const { error: errDel } = await supabase.from('agenda_cirugias_procedimientos_qx').delete().eq('cirugia_id', id);
    if (errDel) return errorQx(errDel);
    if (qxIds.length) {
      const { error: errQx } = await supabase
        .from('agenda_cirugias_procedimientos_qx')
        .insert(qxIds.map((qid, i) => ({ cirugia_id: id, catalogo_quirurgico_id: qid, orden: i + 1 })));
      if (errQx) return errorQx(errQx);
    }
  }

  // Trazabilidad: corrección de una cirugía ya completada (qué campos se tocaron).
  if (String(prev.estado).toLowerCase() === 'completada' && !nuevoEstado) {
    const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
    const previo = prev as Record<string, unknown>;
    const campos = Object.keys(updates).filter((k) => {
      if (k === 'updated_at') return false;
      if (k === 'hora') return norm(updates[k])?.slice(0, 5) !== norm(previo[k])?.slice(0, 5);
      return norm(updates[k]) !== norm(previo[k]);
    });
    if (campos.length) {
      await supabase.from('cirugia_historial').insert({
        cirugia_id: id,
        usuario_id: auth.user.id,
        accion: 'CIRUGIA_CORREGIDA',
        detalle: { campos },
      });
    }
  }

  // Trazabilidad: cambio de notas (texto anterior y nuevo).
  if (data.notas !== undefined) {
    const anterior = ((prev as { notas?: string | null }).notas ?? '').trim();
    const nueva = (data.notas ?? '').trim();
    if (anterior !== nueva) {
      await supabase.from('cirugia_historial').insert({
        cirugia_id: id,
        usuario_id: auth.user.id,
        accion: 'NOTAS_EDITADAS',
        detalle: { anterior: anterior || null, nueva: nueva || null },
      });
    }
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
        ...(anulacion ? { anulacion: true } : {}),
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

  if (nuevoEstado === 'completada' && estadoAnterior !== 'completada') {
    // Sin lentes_requeridos se conserva el comportamiento anterior (el primero, si hay pieza asignada).
    const requeridos: OrdenLente[] = data.lentes_requeridos ?? (itemId ? ['PRIMERO'] : []);
    const result = await completarLentesCirugia(id, requeridos, auth.user.id, data.lentes_ingresar_inventario ?? []);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    // Trazabilidad: qué lentes se usaron y cuáles se liberaron queda en el historial.
    await supabase.from('cirugia_historial').insert({
      cirugia_id: id,
      usuario_id: auth.user.id,
      accion: 'LENTES_RESUELTOS',
      detalle: {
        usados: result.data.filter((l) => l.estado === 'USADO').map((l) => ({ orden: l.orden, fabricante: l.fabricante, modelo: l.modelo, poder_d: l.poder_d })),
        liberados: result.data.filter((l) => l.estado === 'LIBERADO').map((l) => ({ orden: l.orden, fabricante: l.fabricante, modelo: l.modelo, poder_d: l.poder_d })),
      },
    });
  }

  if (nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    await liberarLentes(id);
    if (itemId) await liberarLIO(itemId, id, auth.user.id); // legado
  }

  // Anulación: el lente marcado como usado no se usó → vuelve al inventario.
  if (anulacion) {
    const r = await revertirLentesUsados(id, auth.user.id);
    await supabase.from('cirugia_historial').insert({
      cirugia_id: id,
      usuario_id: auth.user.id,
      // accion con CHECK en BD: se reutiliza LENTES_RESUELTOS (sin migración).
      accion: 'LENTES_RESUELTOS',
      detalle: { anulacion: true, motivo: data.motivo, ...(r.ok ? r.data : { error: r.error }) },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `La cirugía se anuló, pero no se pudo devolver el lente al inventario: ${r.error}. Revísalo en Inventario.` },
        { status: 500 }
      );
    }
  }

  // Devengo y notificaciones (best-effort) corren juntos; se esperan antes de responder.
  const pendientes: Array<Promise<unknown>> = [];
  if (nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    // best-effort: no bloquea la cancelación de agenda
    pendientes.push(new MotorDevengoService().cancelarPorCirugia(id).catch(() => undefined));
  }

  // Honorarios: solo se devengan al COMPLETAR la cirugía; si deja de estar completada se retiran los no pagados.
  if (nuevoEstado !== estadoAnterior && nuevoEstado !== 'cancelada' && (nuevoEstado === 'completada' || estadoAnterior === 'completada')) {
    pendientes.push((async () => {
      const motor = new MotorDevengoService();
      if (nuevoEstado === 'completada') {
        if (await motor.devengoAutomaticoActivo()) await motor.generarDesdeCirugia(id);
      } else {
        await motor.cancelarPorCirugia(id);
      }
    })().catch((err) => console.error('Honorarios al cambiar estado de la cirugía:', err)));
  }

  // Notificaciones al doctor (best-effort, nunca bloquean la respuesta)
  const doctorFinal = data.doctor_id !== undefined ? data.doctor_id : prev.doctor_id;
  const fechaFinal = data.fecha !== undefined ? data.fecha : prev.fecha;
  const horaFinal = data.hora !== undefined ? data.hora : prev.hora;
  const paciente = (data.nombre_paciente as string | undefined) || prev.nombre_paciente || 'Paciente';
  const base = { paciente, entidadTipo: 'agenda_cirugia' as const, entidadId: id, actorUserId: auth.user.id };
  if (anulacion) {
    // Corrección de un registro pasado: no se avisa al doctor como si fuera una cancelación nueva.
  } else if (nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
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
