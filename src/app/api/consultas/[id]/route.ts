import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { doctorRequerido, inicialesDe, verificarDueno } from '@/lib/consultas-acceso';
import { fechaISO, horaHHMM, leerJSON, validarId } from '@/lib/api/validar';
import { notificarCancelacion, notificarReagendado } from '@/services/notificaciones';
import { detectarConflictosAgenda, esEmpalmeAgenda, MENSAJE_EMPALME } from '@/lib/agenda-conflictos';
import { MotorDevengoService } from '@/services/productividad';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { z } from 'zod';

const consultaUpdateSchema = z.object({
  estatus: z.enum(['BORRADOR', 'AGENDADA', 'PROCESADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA', 'APLAZADA', 'REAGENDADA', 'COMPLETADA', 'CANCELADA']).optional(),
  estatus_pago: z.enum(['PENDIENTE_PAGO', 'PAGADO']).optional(),
  costo_total: z.number().min(0).max(10_000_000).optional(),
  monto_pagado: z.number().min(0).max(10_000_000).optional(),
  fecha_pago: z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de pago no válida').optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  metodo_pago: z.string().max(50).optional().nullable(),
  // Full edit fields
  doctor_id: z.string().uuid().optional(),
  fecha: fechaISO.optional(),
  hora_inicio: horaHHMM.optional(),
  hora_fin: horaHHMM.optional().nullable(),
  tipo_consulta: z.string().max(60).optional().nullable(),
  tipo_visita: z.string().max(60).optional().nullable(),
  especialidad_id: z.string().uuid().optional().nullable(),
  procedimiento: z.string().max(2000).optional().nullable(),
  procedimiento_doctor_id: z.string().uuid().optional().nullable(),
  estudio_1: z.string().max(255).optional().nullable(),
  estudio_2: z.string().max(255).optional().nullable(),
  estudio_3: z.string().max(255).optional().nullable(),
  estudio_1_doctor_id: z.string().uuid().optional().nullable(),
  estudio_2_doctor_id: z.string().uuid().optional().nullable(),
  estudio_3_doctor_id: z.string().uuid().optional().nullable(),
}).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;
  const supabase = getSupabaseAdmin();

  // Ronda 1 (paralelo): consulta + historial + conceptos + doctor del usuario (solo rol doctor).
  // Lecturas sin efectos: si el RBAC rechaza, se descartan sin devolverse.
  const [consultaResult, historialResult, conceptosResult, requerido, especialidadResult, indicadosResult] = await Promise.all([
    supabase
      .from('consultas')
      .select(`
        id, folio, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita, diagnostico, estudio_1, estudio_2, estudio_3, estudio_1_doctor_id, estudio_2_doctor_id, estudio_3_doctor_id, procedimiento, procedimiento_doctor_id, notas, estatus, estatus_pago, costo_total, monto_pagado, fecha_pago, metodo_pago, moneda, aseguranza_id, created_at, updated_at,
        pacientes:paciente_id (nombre_completo, fecha_nacimiento, telefono, sexo, email, numero_poliza, numero_afiliacion),
        doctores:doctor_id (alias),
        est1_doc:estudio_1_doctor_id (alias),
        est2_doc:estudio_2_doctor_id (alias),
        est3_doc:estudio_3_doctor_id (alias),
        proc_doc:procedimiento_doctor_id (alias)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('consulta_historial')
      .select('id, consulta_id, tipo_evento, usuario_id, payload, created_at')
      .eq('consulta_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('consulta_conceptos')
      .select('id, consulta_id, tipo_concepto, concepto_id, texto_original, precio_aplicado, doctor_id, created_at')
      .eq('consulta_id', id),
    doctorRequerido(auth.user.id, auth.perfil),
    // Especialidad (mig. 1800000000330) en lectura aparte y tolerante a error:
    // el detalle sigue funcionando aunque la columna aún no exista.
    supabase
      .from('consultas')
      .select('especialidad_id, especialidad:especialidad_id (nombre)')
      .eq('id', id)
      .maybeSingle(),
    // «Indicado por» (mig. 1800000000460) en lectura aparte y tolerante a error.
    supabase
      .from('consulta_conceptos')
      .select('id, tipo_concepto, texto_original, indicado_por_id, indicado:indicado_por_id (alias)')
      .eq('consulta_id', id)
      .in('tipo_concepto', ['ESTUDIO', 'PROCEDIMIENTO']),
  ]);

  const { data: consulta, error: consultaError } = consultaResult;
  if (consultaError || !consulta) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 });
  }

  // RBAC: solo el rol de agenda propia queda limitado a lo suyo (doctor: acceso total)
  const denegado = verificarDueno(requerido, consulta.doctor_id);
  if (denegado) return denegado;

  // Ronda 2 (paralelo): aseguranza, cobertura y nombres de usuarios del historial
  const historialBase = historialResult.data ?? [];
  const historialUserIds = [...new Set(historialBase.map((h) => h.usuario_id).filter((u): u is string => !!u))];
  const [aseguranzaResult, coberturaResult, usuariosResult] = await Promise.all([
    consulta.aseguranza_id
      // `aseguranzas` no tiene columna `notas` (el select anterior fallaba y devolvía siempre null)
      ? supabase.from('aseguranzas').select('id, nombre, telefono, direccion, contacto, activo, created_at').eq('id', consulta.aseguranza_id).maybeSingle()
      : Promise.resolve({ data: null }),
    consulta.aseguranza_id
      ? supabase.from('coberturas_aseguranza').select('id, porcentaje_cobertura, copago_fijo, monto_maximo, aplica_estudios, aplica_procedimientos').eq('aseguranza_id', consulta.aseguranza_id).eq('activo', true).maybeSingle()
      : Promise.resolve({ data: null }),
    historialUserIds.length > 0
      ? supabase.from('usuarios').select('id, nombre').in('id', historialUserIds)
      : Promise.resolve({ data: null }),
  ]);

  let historial: Array<Record<string, unknown>> = historialBase;
  if (historialUserIds.length > 0) {
    const hUserMap = new Map(((usuariosResult.data || []) as Array<{ id: string; nombre: string | null }>).map((u) => [u.id, u.nombre]));
    historial = historialBase.map((h) => ({
      ...h,
      usuario_nombre: h.usuario_id ? hUserMap.get(h.usuario_id) || null : null,
    }));
  }

  interface PacienteJoin { nombre_completo: string; fecha_nacimiento: string | null; telefono: string | null; sexo: string | null; email: string | null; numero_poliza: string | null; numero_afiliacion: string | null }
  interface DoctorJoin { alias: string }

  const pacienteData = (consulta as Record<string, unknown>).pacientes as PacienteJoin | undefined;
  const doctorData = (consulta as Record<string, unknown>).doctores as DoctorJoin | undefined;
  const est1Doc = (consulta as Record<string, unknown>).est1_doc as DoctorJoin | undefined;
  const est2Doc = (consulta as Record<string, unknown>).est2_doc as DoctorJoin | undefined;
  const est3Doc = (consulta as Record<string, unknown>).est3_doc as DoctorJoin | undefined;
  const procDoc = (consulta as Record<string, unknown>).proc_doc as DoctorJoin | undefined;

  // «Indicado por» de cada estudio / procedimiento. Se empareja por nombre y,
  // si no coincide, por orden. Registros anteriores (sin dato) → doctor de la consulta.
  type IndicadoRow = { tipo_concepto: string; texto_original: string | null; indicado: DoctorJoin | DoctorJoin[] | null };
  const indicadoRows = (indicadosResult.error ? [] : (indicadosResult.data ?? [])) as unknown as IndicadoRow[];
  const aliasDe = (r: IndicadoRow) => (Array.isArray(r.indicado) ? r.indicado[0]?.alias : r.indicado?.alias) || null;
  const norm = (t: string | null | undefined) => (t || '').trim().toLowerCase();
  const estudiosRows = indicadoRows.filter((r) => r.tipo_concepto === 'ESTUDIO');
  const usados = new Set<IndicadoRow>();
  const indicadoEstudio = (nombre: string | null, idx: number): string | null => {
    if (!nombre) return null;
    const porNombre = estudiosRows.find((r) => !usados.has(r) && norm(r.texto_original) === norm(nombre));
    const fila = porNombre ?? estudiosRows.filter((r) => !usados.has(r))[0] ?? estudiosRows[idx];
    if (fila) usados.add(fila);
    return (fila && aliasDe(fila)) || doctorData?.alias || null;
  };
  const c = consulta as { estudio_1?: string | null; estudio_2?: string | null; estudio_3?: string | null; procedimiento?: string | null };
  const est1Indicado = indicadoEstudio(c.estudio_1 ?? null, 0);
  const est2Indicado = indicadoEstudio(c.estudio_2 ?? null, 1);
  const est3Indicado = indicadoEstudio(c.estudio_3 ?? null, 2);
  const procIndicados = [...new Set(
    indicadoRows.filter((r) => r.tipo_concepto === 'PROCEDIMIENTO').map(aliasDe).filter((a): a is string => !!a)
  )];
  const procIndicado = c.procedimiento ? (procIndicados.length ? procIndicados.join(', ') : doctorData?.alias || null) : null;

  return NextResponse.json({
    consulta: {
      ...consulta,
      paciente: pacienteData?.nombre_completo || null,
      iniciales: inicialesDe(pacienteData?.nombre_completo || '?'),
      especialidad_id: (especialidadResult.data as { especialidad_id?: string | null } | null)?.especialidad_id ?? null,
      especialidad:
        ((especialidadResult.data as { especialidad?: { nombre: string } | { nombre: string }[] | null } | null)?.especialidad as { nombre?: string } | null)?.nombre ?? null,
      doctor: doctorData?.alias || null,
      est1_doctor: est1Doc?.alias || null,
      est2_doctor: est2Doc?.alias || null,
      est3_doctor: est3Doc?.alias || null,
      proc_doctor: procDoc?.alias || null,
      est1_indicado: est1Indicado,
      est2_indicado: est2Indicado,
      est3_indicado: est3Indicado,
      proc_indicado: procIndicado,
      paciente_sexo: pacienteData?.sexo || null,
      paciente_telefono: pacienteData?.telefono || null,
      paciente_fecha_nacimiento: pacienteData?.fecha_nacimiento || null,
      paciente_email: pacienteData?.email || null,
      paciente_poliza: pacienteData?.numero_poliza || null,
      paciente_afiliacion: pacienteData?.numero_afiliacion || null,
    },
    historial,
    conceptos: conceptosResult.data ?? [],
    aseguranza: aseguranzaResult.data ?? null,
    cobertura: coberturaResult.data ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;
  const supabase = getSupabaseAdmin();

  const data = await leerJSON(request, consultaUpdateSchema, { maxBytes: 50_000 });
  if (data instanceof NextResponse) return data;

  const [existingResult, requerido] = await Promise.all([
    supabase
      .from('consultas')
      .select('id, estatus, estatus_pago, fecha, hora_inicio, hora_fin, doctor_id, pacientes:paciente_id (nombre_completo)')
      .eq('id', id)
      .maybeSingle(),
    doctorRequerido(auth.user.id, auth.perfil),
  ]);
  const { data: existing, error: checkError } = existingResult;

  if (checkError || !existing) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  // RBAC: igual que en GET
  const denegado = verificarDueno(requerido, existing.doctor_id);
  if (denegado) return denegado;

  // AGE-001: detectar conflictos de agenda si cambian fecha/hora/doctor
  const cambiaFecha = data.fecha !== undefined && data.fecha !== existing.fecha;
  const cambiaHora = (data.hora_inicio !== undefined && data.hora_inicio !== existing.hora_inicio)
    || (data.hora_fin !== undefined && data.hora_fin !== existing.hora_fin);
  const cambiaDoctor = data.doctor_id !== undefined && data.doctor_id !== existing.doctor_id;

  if (cambiaFecha || cambiaHora || cambiaDoctor) {
    const nuevaFecha = data.fecha ?? existing.fecha;
    const nuevaHoraInicio = data.hora_inicio ?? existing.hora_inicio;
    const nuevaHoraFin = data.hora_fin ?? existing.hora_fin;
    const nuevoDoctor = data.doctor_id ?? existing.doctor_id;

    if (nuevaFecha && nuevaHoraInicio && nuevoDoctor) {
      const toMin = (t: string) => {
        const [h, m] = t.split(':');
        return parseInt(h || '0', 10) * 60 + parseInt(m || '0', 10);
      };
      const duracionMin = nuevaHoraFin
        ? Math.max(toMin(nuevaHoraFin) - toMin(nuevaHoraInicio), 15)
        : 60;

      const conflictos = await detectarConflictosAgenda({
        fecha: nuevaFecha,
        hora: nuevaHoraInicio,
        duracion_min: duracionMin,
        medicos: [nuevoDoctor],
      });

      // Excluir la propia consulta de los conflictos
      const relevantes = conflictos.filter((c) => c.entidad_id !== id);
      if (relevantes.length > 0) {
        return NextResponse.json(
          { error: 'Conflicto de agenda', conflictos: relevantes },
          { status: 409 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.costo_total !== undefined) updateData.costo_total = data.costo_total;
  if (data.monto_pagado !== undefined) updateData.monto_pagado = data.monto_pagado;
  if (data.fecha_pago !== undefined) updateData.fecha_pago = data.fecha_pago;
  if (data.diagnostico !== undefined) updateData.diagnostico = data.diagnostico;
  if (data.notas !== undefined) updateData.notas = data.notas;
  if (data.metodo_pago !== undefined) updateData.metodo_pago = data.metodo_pago;
  if (data.doctor_id !== undefined) updateData.doctor_id = data.doctor_id;
  if (data.fecha !== undefined) updateData.fecha = data.fecha;
  if (data.hora_inicio !== undefined) updateData.hora_inicio = data.hora_inicio;
  if (data.hora_fin !== undefined) updateData.hora_fin = data.hora_fin;
  if (data.tipo_consulta !== undefined) updateData.tipo_consulta = data.tipo_consulta;
  if (data.tipo_visita !== undefined) updateData.tipo_visita = data.tipo_visita;
  if (data.especialidad_id !== undefined) updateData.especialidad_id = data.especialidad_id;
  if (data.procedimiento !== undefined) updateData.procedimiento = data.procedimiento;
  if (data.procedimiento_doctor_id !== undefined) updateData.procedimiento_doctor_id = data.procedimiento_doctor_id;
  if (data.estudio_1 !== undefined) updateData.estudio_1 = data.estudio_1;
  if (data.estudio_2 !== undefined) updateData.estudio_2 = data.estudio_2;
  if (data.estudio_3 !== undefined) updateData.estudio_3 = data.estudio_3;
  if (data.estudio_1_doctor_id !== undefined) updateData.estudio_1_doctor_id = data.estudio_1_doctor_id;
  if (data.estudio_2_doctor_id !== undefined) updateData.estudio_2_doctor_id = data.estudio_2_doctor_id;
  if (data.estudio_3_doctor_id !== undefined) updateData.estudio_3_doctor_id = data.estudio_3_doctor_id;

  // Eventos de historial: se insertan en lote DESPUÉS de aplicar el update
  // (antes se registraban aunque el update fallara).
  const eventos: Array<{ tipo_evento: string; payload: Record<string, unknown> }> = [];

  // Status transitions
  if (data.estatus !== undefined) {
    updateData.estatus = data.estatus;
    eventos.push({ tipo_evento: 'CAMBIO_ESTATUS', payload: { de: existing.estatus, a: data.estatus } });
  }

  if (data.estatus_pago !== undefined) {
    updateData.estatus_pago = data.estatus_pago;
    if (data.estatus_pago === 'PAGADO') {
      updateData.fecha_pago = new Date().toISOString();
      eventos.push({ tipo_evento: 'PAGADO', payload: { monto: data.monto_pagado } });
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 });
  }

  // If any editable field changed (not just status), log as EDICION
  const hasFieldChanges = [data.diagnostico, data.notas, data.metodo_pago, data.doctor_id,
    data.fecha, data.hora_inicio, data.hora_fin, data.tipo_consulta, data.tipo_visita, data.especialidad_id,
    data.procedimiento, data.procedimiento_doctor_id,
    data.estudio_1, data.estudio_2, data.estudio_3,
    data.estudio_1_doctor_id, data.estudio_2_doctor_id, data.estudio_3_doctor_id,
  ].some(v => v !== undefined);

  if (hasFieldChanges && !data.estatus) {
    eventos.push({
      tipo_evento: 'EDICION',
      payload: {
        campos_modificados: Object.keys(updateData).filter(k => !['estatus', 'estatus_pago', 'costo_total', 'monto_pagado', 'fecha_pago'].includes(k)),
      },
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from('consultas')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (esEmpalmeAgenda(updateError)) {
    return NextResponse.json({ error: MENSAJE_EMPALME, conflictos: [] }, { status: 409 });
  }
  if (updateError) {
    return NextResponse.json(
      { error: handleSupabaseError(updateError, 'consultas.actualizar').mensaje },
      { status: 500 },
    );
  }

  // Notificaciones al doctor por cancelación / reagendado (best-effort)
  const cancelada = data.estatus === 'CANCELADA' && existing.estatus !== 'CANCELADA';
  const reprogramada =
    (data.estatus === 'REAGENDADA' || data.estatus === 'APLAZADA') && data.estatus !== existing.estatus;
  const cambioFecha =
    (data.fecha !== undefined && data.fecha !== existing.fecha) ||
    (data.hora_inicio !== undefined && data.hora_inicio !== existing.hora_inicio);

  const pacienteJoin = (existing as { pacientes?: { nombre_completo?: string | null } | { nombre_completo?: string | null }[] | null }).pacientes;
  const pacienteNombre =
    (Array.isArray(pacienteJoin) ? pacienteJoin[0]?.nombre_completo : pacienteJoin?.nombre_completo) || 'Paciente';

  const notificar = async () => {
    if (!updated || !(cancelada || reprogramada || cambioFecha)) return;
    const base = {
      doctorId: updated.doctor_id as string | null,
      paciente: pacienteNombre,
      entidadTipo: 'consulta' as const,
      entidadId: id,
      actorUserId: auth.user.id,
    };
    if (cancelada) {
      await notificarCancelacion({ ...base, fecha: existing.fecha, hora: existing.hora_inicio });
    } else {
      await notificarReagendado({ ...base, fecha: updated.fecha, hora: updated.hora_inicio, aplazada: data.estatus === 'APLAZADA' });
    }
  };

  await Promise.all([
    eventos.length > 0
      ? Promise.resolve(
          supabase.from('consulta_historial').insert(
            eventos.map((e) => ({ consulta_id: id, usuario_id: auth.user.id, ...e })),
          ),
        ).then(({ error }) => {
          if (error) handleSupabaseError(error, 'consultas.actualizar.historial');
        })
      : null,
    notificar().catch(() => undefined),
  ]);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;
  const supabase = getSupabaseAdmin();

  const [existingResult, requerido] = await Promise.all([
    supabase.from('consultas').select('id, estatus, doctor_id').eq('id', id).maybeSingle(),
    doctorRequerido(auth.user.id, auth.perfil),
  ]);
  const { data: existing, error: checkError } = existingResult;

  if (checkError || !existing) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  // RBAC: igual que en GET
  const denegado = verificarDueno(requerido, existing.doctor_id);
  if (denegado) return denegado;

  const { error: updError } = await supabase
    .from('consultas')
    .update({ estatus: 'CANCELADA' })
    .eq('id', id);
  if (updError) {
    return NextResponse.json(
      { error: handleSupabaseError(updError, 'consultas.cancelar').mensaje },
      { status: 500 },
    );
  }

  await Promise.all([
    Promise.resolve(
      supabase.from('consulta_historial').insert({
        consulta_id: id,
        tipo_evento: 'CANCELACION',
        usuario_id: auth.user.id,
        payload: { estatus_anterior: existing.estatus },
      }),
    ).then(({ error }) => {
      if (error) handleSupabaseError(error, 'consultas.cancelar.historial');
    }),
    // best-effort: no bloquea la cancelación de la consulta
    new MotorDevengoService().cancelarPorConsulta(id).catch(() => undefined),
  ]);

  return NextResponse.json({ ok: true });
}
