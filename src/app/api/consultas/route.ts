import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { z } from 'zod';

async function crearNotificacion(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  tipo: 'info' | 'warning' | 'error',
  titulo: string,
  mensaje: string,
  entidadTipo?: string,
  entidadId?: string,
) {
  await supabase.from('notificaciones').insert({
    user_id: userId,
    tipo,
    titulo,
    mensaje,
    entidad_tipo: entidadTipo ?? null,
    entidad_id: entidadId ?? null,
  });
}

const tipoConsultaMap: Record<string, string> = {
  'Primera Consulta': 'CONSULTA',
  'Consulta de Urgencia': 'CONSULTA',
  'Revisión Pre-Operatoria': 'REVISION',
  'Control Post-Operatorio': 'REVISION',
  'Consulta': 'CONSULTA',
  'Estudio': 'ESTUDIO',
  'Revisión': 'REVISION',
  'Procedimiento': 'PROCEDIMIENTO',
};

const tipoVisitaMap: Record<string, string> = {
  'Visita de Retorno': 'SUBSECUENTE',
  'Primera Vez': 'PRIMERA_VEZ',
  'PRIMERA_VEZ': 'PRIMERA_VEZ',
  'SUBSECUENTE': 'SUBSECUENTE',
};

const metodoPagoMap: Record<string, string> = {
  'Efectivo': 'EFECTIVO',
  'Tarjeta de Crédito': 'TARJETA',
  'Tarjeta de Débito': 'TARJETA',
  'Transferencia': 'TRANSFERENCIA',
  'No aplica': 'NO_APLICA',
};

const monedaMap: Record<string, string> = {
  'MXN - Peso Mexicano': 'PESOS',
  'USD - Dólar': 'DOLARES',
  'PESOS': 'PESOS',
  'DOLARES': 'DOLARES',
};

const estudioConDoctorSchema = z.object({
  nombre: z.string().max(255),
  doctor_id: z.string().uuid().optional().nullable(),
});

const consultaCreateSchema = z.object({
  paciente_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  tipo_consulta: z.string().optional().nullable(),
  tipo_visita: z.string().optional().nullable(),
  diagnostico: z.string().max(500).optional().nullable(),
  estudios: z.array(z.union([z.string().max(255), estudioConDoctorSchema])).max(3).optional().nullable(),
  procedimiento: z.string().optional().nullable(),
  procedimiento_doctor_id: z.string().uuid().optional().nullable(),
  notas: z.string().optional().nullable(),
  costo: z.union([z.string(), z.number()]).optional().nullable(),
  metodo_pago: z.string().optional().nullable(),
  aseguradora: z.string().optional().nullable(),
  moneda: z.string().optional().nullable(),
  pago_inmediato: z.boolean().optional().nullable(),
  doctor_costos: z.array(z.object({
    doctor_id: z.string().uuid(),
    tipo_costo: z.enum(['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO']),
    monto: z.number().min(0),
    descripcion: z.string().optional().nullable(),
  })).optional().nullable(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from('consultas')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      doctores:doctor_id (nombre_completo),
      est1_doc:estudio_1_doctor_id (nombre_completo),
      est2_doc:estudio_2_doctor_id (nombre_completo),
      est3_doc:estudio_3_doctor_id (nombre_completo),
      proc_doc:procedimiento_doctor_id (nombre_completo)
    `, { count: 'exact' })
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  const result = data.map((c) => {
    const nombrePaciente = (c.pacientes as any)?.nombre_completo || '';
    const nombreDoctor = (c.doctores as any)?.nombre_completo || '';
    const iniciales = nombrePaciente
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const estudiosDetalle = [
      c.estudio_1 ? { nombre: c.estudio_1, doctor: (c as any).est1_doc?.nombre_completo || null } : null,
      c.estudio_2 ? { nombre: c.estudio_2, doctor: (c as any).est2_doc?.nombre_completo || null } : null,
      c.estudio_3 ? { nombre: c.estudio_3, doctor: (c as any).est3_doc?.nombre_completo || null } : null,
    ].filter(Boolean);

    return {
      id: c.id,
      folio: c.folio || null,
      paciente_id: c.paciente_id,
      paciente: nombrePaciente,
      iniciales,
      doctor_id: c.doctor_id,
      doctor: nombreDoctor,
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      diagnostico: c.diagnostico,
      estudios: estudiosDetalle.map(e => e!.nombre).join(', '),
      estudios_detalle: estudiosDetalle,
      procedimiento: c.procedimiento,
      procedimiento_doctor: (c as any).proc_doc?.nombre_completo || null,
      notas: c.notas,
      costo_total: (c as any).costo_total || 0,
      estado_pago: (c as any).estado_pago || 'PENDIENTE',
      monto_pagado: (c as any).monto_pagado || 0,
      created_at: c.created_at,
    };
  });

  return NextResponse.json({ data: result, total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Strip null values → undefined so Zod optional fields work
  const clean = JSON.parse(JSON.stringify(body), (_key, value) =>
    value === null ? undefined : value
  );

  const validation = consultaCreateSchema.safeParse(clean);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  // IDOR-10: Verify referenced entities exist before insert
  const [pacienteCheck, doctorCheck] = await Promise.all([
    supabase.from('pacientes').select('id').eq('id', data.paciente_id).maybeSingle(),
    supabase.from('doctores').select('id, activo').eq('id', data.doctor_id).maybeSingle(),
  ]);

  if (!pacienteCheck.data) {
    return NextResponse.json({ error: 'El paciente referenciado no existe' }, { status: 404 });
  }
  if (!doctorCheck.data) {
    return NextResponse.json({ error: 'El doctor referenciado no existe' }, { status: 404 });
  }
  if (doctorCheck.data && !doctorCheck.data.activo) {
    return NextResponse.json({ error: 'El doctor seleccionado no está activo' }, { status: 400 });
  }

  const tipoConsulta = tipoConsultaMap[data.tipo_consulta || ''] || data.tipo_consulta || 'CONSULTA';
  const tipoVisita = tipoVisitaMap[data.tipo_visita || ''] || data.tipo_visita || 'PRIMERA_VEZ';

  // Generate folio: CON-YY-NNNNN
  const year = new Date().getFullYear().toString().slice(-2);
  const { count } = await supabase
    .from('consultas')
    .select('id', { count: 'exact', head: true });
  const seq = ((count || 0) + 1).toString().padStart(5, '0');
  const folio = `CON-${year}-${seq}`;

  // Parse estudios - support both string and {nombre, doctor_id} formats
  const parseEstudio = (e: string | { nombre: string; doctor_id?: string | null }) => {
    if (typeof e === 'string') return { nombre: e, doctor_id: null };
    return { nombre: e.nombre, doctor_id: e.doctor_id || null };
  };
  const est0 = data.estudios?.[0] ? parseEstudio(data.estudios[0]) : null;
  const est1 = data.estudios?.[1] ? parseEstudio(data.estudios[1]) : null;
  const est2 = data.estudios?.[2] ? parseEstudio(data.estudios[2]) : null;

  // 1. Create consulta
  const { data: consultaData, error: consultaError } = await supabase
    .from('consultas')
    .insert({
      folio,
      paciente_id: data.paciente_id,
      doctor_id: data.doctor_id,
      fecha: data.fecha,
      hora_inicio: data.hora_inicio,
      hora_fin: data.hora_fin || null,
      tipo_consulta: tipoConsulta,
      tipo_visita: tipoVisita,
      diagnostico: data.diagnostico?.trim() || null,
      estudio_1: est0?.nombre || null,
      estudio_2: est1?.nombre || null,
      estudio_3: est2?.nombre || null,
      estudio_1_doctor_id: est0?.doctor_id || null,
      estudio_2_doctor_id: est1?.doctor_id || null,
      estudio_3_doctor_id: est2?.doctor_id || null,
      procedimiento: data.procedimiento?.trim() || null,
      procedimiento_doctor_id: data.procedimiento_doctor_id || null,
      notas: data.notas?.trim() || null,
    })
    .select()
    .single();

  if (consultaError) {
    return NextResponse.json(
      { error: errorTranslations[consultaError.message] || 'Error interno del servidor' },
      { status: 500 }
    );
  }

  // 2. Create doctor cost distribution if provided
  if (data.doctor_costos && data.doctor_costos.length > 0) {
    const rows = data.doctor_costos.map((dc) => ({
      consulta_id: consultaData.id,
      doctor_id: dc.doctor_id,
      tipo_costo: dc.tipo_costo,
      monto: dc.monto,
      descripcion: dc.descripcion || null,
    }));

    const { error: doctorCostoError } = await supabase
      .from('consulta_doctor_costo')
      .insert(rows);

    if (doctorCostoError) {
      console.error('Error al insertar costos de doctor:', doctorCostoError);
    }
  }

  // 3. Calculate total cost from doctor costos
  let costoTotal = 0;
  if (data.doctor_costos && data.doctor_costos.length > 0) {
    costoTotal = data.doctor_costos.reduce((sum, dc) => sum + dc.monto, 0);
  } else if (data.costo) {
    costoTotal = typeof data.costo === 'string' ? parseFloat(data.costo) || 0 : (data.costo || 0);
  }

  // 4. Determine payment status
  const pagoInmediato = data.pago_inmediato ?? false;
  const estadoPago = pagoInmediato ? 'PAGADO' : (costoTotal > 0 ? 'PENDIENTE' : 'PAGADO');

  // 5. Update consulta with cost info
  if (costoTotal > 0 || pagoInmediato) {
    await supabase
      .from('consultas')
      .update({
        costo_total: costoTotal,
        estado_pago: estadoPago,
        monto_pagado: pagoInmediato ? costoTotal : 0,
        fecha_pago: pagoInmediato ? new Date().toISOString() : null,
      })
      .eq('id', consultaData.id);
  }

  // 6. Create cobro if payment data provided OR if pago inmediato
  if (data.costo !== undefined || data.metodo_pago || data.aseguradora || pagoInmediato) {
    const metodoPago = metodoPagoMap[data.metodo_pago || ''] || 'NO_APLICA';
    const moneda = monedaMap[data.moneda || ''] || 'PESOS';
    const monto = costoTotal;

    // Lookup aseguranza_id by name if provided
    let aseguranzaId = null;
    if (data.aseguradora && data.aseguradora !== 'Particular') {
      const { data: aseguranza } = await supabase
        .from('aseguranzas')
        .select('id')
        .ilike('nombre', data.aseguradora)
        .eq('activo', true)
        .single();
      if (aseguranza) aseguranzaId = aseguranza.id;
    }

    // Generate cobro folio
    const year = new Date().getFullYear().toString().slice(-2);
    const { count: cobroCount } = await supabase
      .from('cobros')
      .select('id', { count: 'exact', head: true });
    const cobroSeq = ((cobroCount || 0) + 1).toString().padStart(5, '0');
    const cobroFolio = `CF-${year}-${cobroSeq}`;

    const { error: cobroError } = await supabase
      .from('cobros')
      .insert({
        consulta_id: consultaData.id,
        paciente_id: consultaData.paciente_id,
        aseguranza_id: aseguranzaId,
        metodo_pago: metodoPago,
        monto,
        moneda,
        pagado: pagoInmediato,
        estado: pagoInmediato ? 'PAGADO' : 'PENDIENTE',
        folio: cobroFolio,
        fecha_pago: pagoInmediato ? new Date().toISOString() : null,
      });

    if (cobroError) {
      console.error('Error al insertar cobro asociado a consulta');
    }
  } else {
    // Create a pending cobro if there's a cost but no immediate payment
    if (costoTotal > 0 && !pagoInmediato) {
      const year = new Date().getFullYear().toString().slice(-2);
      const { count: cobroCount } = await supabase
        .from('cobros')
        .select('id', { count: 'exact', head: true });
      const cobroSeq = ((cobroCount || 0) + 1).toString().padStart(5, '0');
      const cobroFolio = `CF-${year}-${cobroSeq}`;

      await supabase
        .from('cobros')
        .insert({
          consulta_id: consultaData.id,
          paciente_id: consultaData.paciente_id,
          metodo_pago: 'NO_APLICA',
          monto: costoTotal,
          moneda: 'PESOS',
          pagado: false,
          estado: 'PENDIENTE',
          folio: cobroFolio,
        });
    }
  }

  // 7. Generate notification for the doctor
  if (consultaData.doctor_id) {
    const nombrePaciente = pacienteCheck.data
      ? (await supabase.from('pacientes').select('nombre_completo').eq('id', data.paciente_id).maybeSingle())?.data?.nombre_completo ?? 'un paciente'
      : 'un paciente';

    await crearNotificacion(
      supabase,
      consultaData.doctor_id,
      'info',
      'Nueva consulta asignada',
      `Consulta ${folio} registrada para ${nombrePaciente} el ${data.fecha}`,
      'consulta',
      consultaData.id,
    );
  }

  return NextResponse.json(consultaData, { status: 201 });
}
