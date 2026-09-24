import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { detectarConflictosAgenda } from '@/lib/agenda-conflictos';
import { calcularProductividadCirugia } from '@/lib/productividad';
import { consumirLIO } from '@/lib/inventario';
import { z } from 'zod';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('consulta_id');
  const pacienteId = searchParams.get('paciente_id');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agenda_cirugias')
    .select('id, codigo, paciente_id, nombre_paciente, fecha, hora, estado, ojo, servicio:servicio_id(nombre), origen:origen_id(nombre), consulta_id')
    .order('fecha', { ascending: false });

  if (consultaId) {
    query = query.eq('consulta_id', consultaId);
  }
  if (pacienteId) {
    query = query.eq('paciente_id', pacienteId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Error al listar cirugías' }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

const participanteSchema = z.object({
  medico_id: z.string().uuid(),
  rol_id: z.string().uuid(),
});

const cirugiaCreateSchema = z.object({
  paciente_id: z.string().uuid(),
  origen_id: z.string().uuid(),
  servicio_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
  hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'La hora debe tener formato HH:MM o HH:MM:SS'),
  duracion_min: z.number().int().positive('La duración estimada debe ser mayor a 0'),
  recurso_id: z.string().uuid().optional().nullable(),
  ojo: z.enum(['OD', 'OI', 'OU']),
  inventario_item_id: z.string().uuid().optional().nullable(),
  consulta_id: z.string().uuid().optional().nullable(),
  participantes: z.array(participanteSchema).min(1, 'Debe asignar al menos un participante'),
  notas: z.string().max(2000).optional().nullable(),
}).strict();

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = cirugiaCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const supabase = getSupabaseAdmin();

  // AGE-001 / AGE-002 / VAL-005: detectar conflictos de agenda antes de crear
  const medicos = data.participantes.map((p) => p.medico_id);
  const conflictos = await detectarConflictosAgenda({
    fecha: data.fecha,
    hora: data.hora,
    duracion_min: data.duracion_min,
    medicos,
    recurso_id: data.recurso_id,
  });

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
    p_consulta_id: data.consulta_id,
    p_participantes: data.participantes,
    p_notas: data.notas,
    p_created_by: auth.user.id,
  });

  if (error) {
    const friendly = errorTranslations[error.message];
    return NextResponse.json(
      { error: friendly || error.message || 'Error interno del servidor' },
      { status: friendly ? 400 : 500 }
    );
  }

  const cirugiaId = (result as any)?.cirugia_id;
  if (cirugiaId) {
    if (data.inventario_item_id) {
      await consumirLIO(data.inventario_item_id, cirugiaId, auth.user.id);
    }
    try {
      await calcularProductividadCirugia(cirugiaId);
    } catch {
      // No se interrumpe la creación; la productividad queda PENDIENTE sin monto.
    }
  }

  return NextResponse.json(result, { status: 201 });
}
