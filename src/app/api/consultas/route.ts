import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const errorTranslations: Record<string, string> = {
  'null value in column "paciente_id" violates not-null constraint': 'El paciente es obligatorio',
  'null value in column "doctor_id" violates not-null constraint': 'El doctor es obligatorio',
  'null value in column "fecha" violates not-null constraint': 'La fecha es obligatoria',
  'null value in column "hora_inicio" violates not-null constraint': 'La hora de inicio es obligatoria',
  'null value in column "tipo_consulta" violates not-null constraint': 'El tipo de consulta es obligatorio',
  'null value in column "tipo_visita" violates not-null constraint': 'El tipo de visita es obligatorio',
  'invalid input value for enum tipo_consulta': 'Tipo de consulta no válido',
  'invalid input value for enum tipo_visita': 'Tipo de visita no válido',
  'insert or update on table "consultas" violates foreign key constraint "consultas_paciente_id_fkey"': 'El paciente seleccionado no existe',
  'insert or update on table "consultas" violates foreign key constraint "consultas_doctor_id_fkey"': 'El doctor seleccionado no existe',
  'new row violates row-level security policy': 'No tienes permisos para realizar esta acción',
};

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

const consultaCreateSchema = z
  .object({
    paciente_id: z.string().uuid(),
    doctor_id: z.string().uuid(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
    tipo_consulta: z.string().optional(),
    tipo_visita: z.string().optional(),
    diagnostico: z.string().max(500).optional(),
    estudios: z.array(z.string().max(255)).max(3).optional(),
    procedimiento: z.string().optional(),
    notas: z.string().optional(),
    costo: z.union([z.string(), z.number()]).optional(),
    metodo_pago: z.string().optional(),
    aseguradora: z.string().optional(),
    moneda: z.string().optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('consultas')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      doctores:doctor_id (nombre_completo)
    `)
    .order('fecha', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
      estudios: [c.estudio_1, c.estudio_2, c.estudio_3].filter(Boolean).join(', '),
      procedimiento: c.procedimiento,
      notas: c.notas,
      created_at: c.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const validation = consultaCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  // IDOR-10: Verify referenced entities exist before insert
  const [pacienteCheck, doctorCheck] = await Promise.all([
    supabase.from('pacientes').select('id').eq('id', data.paciente_id).maybeSingle(),
    supabase.from('doctores').select('id').eq('id', data.doctor_id).maybeSingle(),
  ]);

  if (!pacienteCheck.data) {
    return NextResponse.json({ error: 'El paciente referenciado no existe' }, { status: 404 });
  }
  if (!doctorCheck.data) {
    return NextResponse.json({ error: 'El doctor referenciado no existe' }, { status: 404 });
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
      estudio_1: data.estudios?.[0] || null,
      estudio_2: data.estudios?.[1] || null,
      estudio_3: data.estudios?.[2] || null,
      procedimiento: data.procedimiento?.trim() || null,
      notas: data.notas?.trim() || null,
    })
    .select()
    .single();

  if (consultaError) {
    return NextResponse.json(
      { error: errorTranslations[consultaError.message] || consultaError.message },
      { status: 500 }
    );
  }

  // 2. Create cobro if payment data provided
  if (data.costo !== undefined || data.metodo_pago || data.aseguradora) {
    const metodoPago = metodoPagoMap[data.metodo_pago || ''] || 'NO_APLICA';
    const moneda = monedaMap[data.moneda || ''] || 'PESOS';
    const monto = typeof data.costo === 'string' ? parseFloat(data.costo) || 0 : (data.costo || 0);

    // Lookup aseguranza_id by name if provided
    let aseguranzaId = null;
    if (data.aseguradora && data.aseguradora !== 'Particular') {
      const { data: aseguranza } = await supabase
        .from('aseguranzas')
        .select('id')
        .ilike('nombre', data.aseguradora)
        .single();
      if (aseguranza) aseguranzaId = aseguranza.id;
    }

    const { error: cobroError } = await supabase
      .from('cobros')
      .insert({
        consulta_id: consultaData.id,
        paciente_id: consultaData.paciente_id,
        aseguranza_id: aseguranzaId,
        metodo_pago: metodoPago,
        monto,
        moneda,
        pagado: false,
      });

    if (cobroError) {
      console.error('Cobro insert error (consulta still created):', cobroError.message);
    }
  }

  return NextResponse.json(consultaData, { status: 201 });
}
