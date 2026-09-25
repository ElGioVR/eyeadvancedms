import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { consumirLIO, liberarLIO } from '@/lib/inventario';
import { esTransicionValida, type CirugiaEstado } from '@/lib/cirugia-estados';
import { detectarConflictosAgenda } from '@/lib/agenda-conflictos';
import { MotorDevengoService } from '@/services/productividad';
import { z } from 'zod';

const cirugiaUpdateSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  nombre_paciente: z.string().min(1).max(255).optional(),
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
  estado: z.enum(['agendada', 'aplazada', 'reagendada', 'completada', 'cancelada']).optional(),
  procedencia: z.string().max(255).optional().nullable(),
  motivo_aplazamiento: z.string().max(500).optional().nullable(),
  motivo: z.string().min(1).max(500).optional().nullable(),
  notas: z.string().optional().nullable(),
  notificado: z.boolean().optional(),
  inventario_item_id: z.string().uuid().optional().nullable(),
}).strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('agenda_cirugias')
    .select(`
      *,
      doctores:doctor_id (alias)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    doctor_nombre: (data as any).doctores?.alias || null,
    doctores: undefined,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = cirugiaUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const updates: Record<string, unknown> = {};

  // Read current state before update (for side-effects and state machine)
  const { data: prev, error: prevError } = await supabase
    .from('agenda_cirugias')
    .select('estado, inventario_item_id, fecha, hora, doctor_id, duracion_min, recurso_id, estado')
    .eq('id', id)
    .single();

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
      { error: errorTranslations[error.message] || 'Error interno del servidor' },
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
      const consume = await consumirLIO(newId, id, auth.user.id);
      if (!consume.success) {
        await supabase
          .from('agenda_cirugias')
          .update({ inventario_item_id: prevItem, updated_at: new Date().toISOString() })
          .eq('id', id);
        return NextResponse.json({ error: consume.error || 'No se pudo descontar el LIO' }, { status: 400 });
      }
    }

    if (prevItem && prevItem !== newId) {
      await liberarLIO(prevItem, id, auth.user.id);
    }

    itemId = newId;
  }

  if (itemId && nuevoEstado === 'completada' && estadoAnterior !== 'completada') {
    const result = await consumirLIO(itemId, id, auth.user.id);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  if (itemId && nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    await liberarLIO(itemId, id, auth.user.id);
  }

  if (nuevoEstado === 'cancelada' && estadoAnterior !== 'cancelada') {
    try {
      await new MotorDevengoService().cancelarPorCirugia(id);
    } catch {
      // best-effort: no bloquea la cancelación de agenda
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('agenda_cirugias')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: errorTranslations[error.message] || 'Error interno del servidor' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
