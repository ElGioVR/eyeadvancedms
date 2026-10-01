import { NextResponse } from 'next/server';
import { faltantesPaciente } from '@/lib/import-agenda';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { fechaISO, leerJSON, uuid, validarId } from '@/lib/api/validar';

interface CobroJoin {
  monto: number | null;
  moneda: string | null;
  metodo_pago: string | null;
  pagado: boolean | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista', 'enfermero']);
  if (roleError) return roleError;
  // Enfermería: consulta clínica sin datos de cobro
  const verCobros = auth.perfil?.rol !== 'enfermero';

  const { id } = await params;
  const idError = validarId(id, 'ID de paciente');
  if (idError) return idError;
  const supabase = getSupabaseAdmin();

  // Paciente (+ nombre de aseguranza) y consultas (+ doctor + cobros) en paralelo:
  // 1 viaje en lugar de 4 en serie.
  const [pacienteRes, consultasRes, pendienteRes] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id, nombre_completo, sexo, fecha_nacimiento, edad, telefono, email, direccion, contacto_emergencia, tel_emergencia, aseguranza_id, numero_poliza, numero_afiliacion, created_at, aseguranzas:aseguranza_id (nombre)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('consultas')
      .select(`
        id, folio, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita,
        diagnostico, estudio_1, estudio_2, estudio_3, procedimiento, notas,
        doctores:doctor_id (alias, especialidad),
        cobros (monto, moneda, metodo_pago, pagado)
      `)
      .eq('paciente_id', id)
      .order('fecha', { ascending: false })
      .limit(200),
    // Alta automática con datos por completar (mig. 400; sin la columna → false)
    supabase.from('pacientes').select('pendiente_completar').eq('id', id).maybeSingle(),
  ]);
  const pendienteCompletar = !pendienteRes.error && (pendienteRes.data as { pendiente_completar?: boolean } | null)?.pendiente_completar === true;

  const patient = pacienteRes.data;
  if (pacienteRes.error || !patient) {
    return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
  }
  const consultas = consultasRes.data;

  const nombre = patient.nombre_completo || '';
  const iniciales = nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  const asegJoin = (patient as { aseguranzas?: { nombre?: string | null } | { nombre?: string | null }[] | null }).aseguranzas;
  const aseguradoraNombre: string | null = patient.aseguranza_id
    ? (Array.isArray(asegJoin) ? asegJoin[0]?.nombre : asegJoin?.nombre) || null
    : null;

  const consultasResult = (consultas || []).map((c) => {
    const doctor = (Array.isArray(c.doctores) ? c.doctores[0] : c.doctores) as { alias?: string; especialidad?: string } | null;
    const cobrosConsulta = (c as { cobros?: CobroJoin[] | CobroJoin | null }).cobros;
    // Antes: Map por consulta_id → ganaba el último cobro de la lista
    const cobro = Array.isArray(cobrosConsulta) ? cobrosConsulta[cobrosConsulta.length - 1] : cobrosConsulta || undefined;
    const estudios = [c.estudio_1, c.estudio_2, c.estudio_3].filter(Boolean);

    return {
      id: c.id,
      folio: c.folio || null,
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      diagnostico: c.diagnostico,
      estudios,
      procedimiento: c.procedimiento,
      notas: c.notas,
      doctor: doctor?.alias || '',
      especialidad: doctor?.especialidad || '',
      ...(verCobros
        ? {
            monto: cobro?.monto || 0,
            moneda: cobro?.moneda || 'PESOS',
            metodo_pago: cobro?.metodo_pago || 'NO_APLICA',
            pagado: cobro?.pagado || false,
          }
        : {}),
    };
  });

  return NextResponse.json({
    id: patient.id,
    nombre_completo: nombre,
    iniciales,
    sexo: patient.sexo,
    fecha_nacimiento: patient.fecha_nacimiento,
    edad: patient.edad,
    telefono: patient.telefono,
    email: patient.email,
    direccion: patient.direccion,
    contacto_emergencia: patient.contacto_emergencia,
    tel_emergencia: patient.tel_emergencia,
    aseguranza_id: patient.aseguranza_id || null,
    aseguradora: aseguradoraNombre,
    numero_poliza: patient.numero_poliza || null,
    numero_afiliacion: patient.numero_afiliacion || null,
    created_at: patient.created_at,
    consultas: consultasResult,
    total_consultas: consultasResult.length,
    pendiente_completar: pendienteCompletar,
    faltantes: pendienteCompletar ? faltantesPaciente(patient) : [],
  });
}

/* ─────────── PATCH — edición de paciente ─────────── */

const pacienteUpdateSchema = z
  .object({
    nombre_completo: z.string().trim().min(1).max(255).optional(),
    sexo: z.enum(['H', 'M', 'MASCULINO', 'FEMENINO', 'OTRO']).optional(),
    fecha_nacimiento: fechaISO.optional(),
    telefono: z.string().max(20).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    direccion: z.string().max(1000).optional().nullable(),
    contacto_emergencia: z.string().max(255).optional().nullable(),
    tel_emergencia: z.string().max(20).optional().nullable(),
    aseguranza_id: uuid.optional().nullable(),
    numero_poliza: z.string().max(100).optional().nullable(),
    numero_afiliacion: z.string().max(100).optional().nullable(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de paciente');
  if (idError) return idError;

  const data = await leerJSON(request, pacienteUpdateSchema, { maxBytes: 20_000 });
  if (data instanceof NextResponse) return data;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.nombre_completo !== undefined) updates.nombre_completo = data.nombre_completo.trim();
  if (data.sexo !== undefined) updates.sexo = data.sexo;
  if (data.fecha_nacimiento !== undefined) updates.fecha_nacimiento = data.fecha_nacimiento;
  if (data.telefono !== undefined) updates.telefono = data.telefono?.trim() || null;
  if (data.email !== undefined) updates.email = data.email?.trim() || null;
  if (data.direccion !== undefined) updates.direccion = data.direccion?.trim() || null;
  if (data.contacto_emergencia !== undefined) updates.contacto_emergencia = data.contacto_emergencia?.trim() || null;
  if (data.tel_emergencia !== undefined) updates.tel_emergencia = data.tel_emergencia?.trim() || null;
  if (data.aseguranza_id !== undefined) updates.aseguranza_id = data.aseguranza_id || null;
  if (data.numero_poliza !== undefined) updates.numero_poliza = data.numero_poliza?.trim() || null;
  if (data.numero_afiliacion !== undefined) updates.numero_afiliacion = data.numero_afiliacion?.trim() || null;

  const supabase = getSupabaseAdmin();
  const { data: actualizado, error } = await supabase
    .from('pacientes')
    .update(updates)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    const { mensaje, traducido } = handleSupabaseError(error, 'pacientes.actualizar');
    return NextResponse.json({ error: traducido ? mensaje : 'Error al actualizar el paciente' }, { status: 500 });
  }
  if (!actualizado) {
    return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
  }

  // Alta automática por importación: se quita la marca cuando la ficha ya está completa.
  const { data: ficha } = await supabase
    .from('pacientes')
    .select('sexo, fecha_nacimiento, edad, telefono, pendiente_completar')
    .eq('id', id)
    .maybeSingle();
  if (ficha?.pendiente_completar && faltantesPaciente(ficha).length === 0) {
    await supabase.from('pacientes').update({ pendiente_completar: false }).eq('id', id);
  }

  return NextResponse.json({ success: true });
}
