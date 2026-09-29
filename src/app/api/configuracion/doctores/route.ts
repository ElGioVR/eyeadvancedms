import { NextResponse } from 'next/server';
import { invalidarDoctorDeUsuario } from '@/lib/auth-helpers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { emailOpcional, idDeQuery, monto, respuestaErrorDb, textoCorto } from '@/lib/api/configuracion';
import { z } from 'zod';

// El alias (ej. "DR BAYARDO") es el nombre de presentación usado en toda la app.
// `nombre`/`apellido` guardan la identidad real del doctor.
const doctorCreateSchema = z.object({
  alias: z.string().trim().min(1).max(255),
  nombre: textoCorto(255).optional().nullable(),
  apellido: textoCorto(255).optional().nullable(),
  cedula: textoCorto(50).optional(),
  especialidad: textoCorto(255).optional(),
  telefono: textoCorto(20).optional(),
  email: emailOpcional.optional(),
  usuario_id: z.string().uuid().optional().nullable(),
  honorario_consulta: monto.optional(),
  honorario_estudio: monto.optional(),
  honorario_procedimiento: monto.optional(),
}).strict();

const doctorUpdateSchema = z.object({
  id: z.string().uuid(),
  alias: z.string().trim().min(1).max(255).optional(),
  nombre: textoCorto(255).optional().nullable(),
  apellido: textoCorto(255).optional().nullable(),
  cedula: textoCorto(50).optional().nullable(),
  especialidad: textoCorto(255).optional(),
  telefono: textoCorto(20).optional().nullable(),
  email: emailOpcional.optional().nullable(),
  usuario_id: z.string().uuid().optional().nullable(),
  activo: z.boolean().optional(),
  honorario_consulta: monto.optional(),
  honorario_estudio: monto.optional(),
  honorario_procedimiento: monto.optional(),
}).strict();

/**
 * Valida el vínculo usuario↔doctor: el usuario existe, tiene rol doctor o
 * administrador y no está vinculado ya a OTRO doctor (ambas lecturas en paralelo).
 */
async function validarVinculo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  usuarioId: string,
  doctorId?: string,
): Promise<NextResponse | null> {
  let otroQ = supabase.from('doctores').select('id').eq('usuario_id', usuarioId).limit(1);
  if (doctorId) otroQ = otroQ.neq('id', doctorId);
  const [{ data: usuario, error: usuarioError }, { data: otros, error: otroError }] = await Promise.all([
    supabase.from('usuarios').select('rol, activo').eq('id', usuarioId).maybeSingle(),
    otroQ,
  ]);
  if (usuarioError || otroError) {
    return respuestaErrorDb((usuarioError || otroError)!, 'configuracion.doctores.vinculo');
  }
  if (!usuario) {
    return NextResponse.json({ error: 'El usuario a vincular no existe' }, { status: 404 });
  }
  if (!['doctor', 'admin'].includes(usuario.rol)) {
    return NextResponse.json({ error: 'Solo se puede vincular un usuario con rol doctor o administrador' }, { status: 400 });
  }
  if (otros && otros.length > 0) {
    return NextResponse.json({ error: 'El usuario ya está vinculado a otro doctor' }, { status: 409 });
  }
  return null;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('doctores')
    .select('id, alias, nombre, apellido, especialidad, cedula_profesional, telefono, email, usuario_id, activo, honorario_consulta, honorario_estudio, honorario_procedimiento, created_at')
    .eq('activo', true)
    .order('alias')
    .limit(1000);

  if (error) {
    return respuestaErrorDb(error, 'configuracion.doctores');
  }

  const result = data.map((d) => ({
    id: d.id,
    alias: d.alias,
    nombre: d.nombre,
    apellido: d.apellido,
    especialidad: d.especialidad,
    cedula: d.cedula_profesional,
    telefono: d.telefono,
    email: d.email,
    usuario_id: d.usuario_id || null,
    activo: d.activo,
    honorario_consulta: d.honorario_consulta || 0,
    honorario_estudio: d.honorario_estudio || 0,
    honorario_procedimiento: d.honorario_procedimiento || 0,
    created_at: d.created_at,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  const data = await leerJSON(request, doctorCreateSchema);
  if (data instanceof NextResponse) return data;

  // Validar vínculo: el usuario debe tener rol doctor o administrador
  if (data.usuario_id) {
    const vinculoError = await validarVinculo(supabase, data.usuario_id);
    if (vinculoError) return vinculoError;
  }

  const { data: doctor, error } = await supabase
    .from('doctores')
    .insert({
      alias: data.alias.trim(),
      nombre: data.nombre?.trim() || null,
      apellido: data.apellido?.trim() || null,
      cedula_profesional: data.cedula?.trim() || null,
      especialidad: data.especialidad?.trim() || 'Oftalmología',
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      usuario_id: data.usuario_id || null,
      honorario_consulta: data.honorario_consulta || 0,
      honorario_estudio: data.honorario_estudio || 0,
      honorario_procedimiento: data.honorario_procedimiento || 0,
    })
    .select()
    .single();

  if (error) {
    return respuestaErrorDb(error, 'configuracion.doctores');
  }

  invalidarDoctorDeUsuario(); // el vínculo usuario↔doctor pudo cambiar
  return NextResponse.json(doctor, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  const data = await leerJSON(request, doctorUpdateSchema);
  if (data instanceof NextResponse) return data;
  const { id, ...updates } = data;

  const profileUpdates: Record<string, unknown> = {};
  if (updates.alias) profileUpdates.alias = updates.alias.trim();
  if (updates.nombre !== undefined) profileUpdates.nombre = updates.nombre?.trim() || null;
  if (updates.apellido !== undefined) profileUpdates.apellido = updates.apellido?.trim() || null;
  if (updates.cedula !== undefined) profileUpdates.cedula_profesional = updates.cedula?.trim() || null;
  if (updates.especialidad) profileUpdates.especialidad = updates.especialidad.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.email !== undefined) profileUpdates.email = updates.email?.trim() || null;
  if (updates.usuario_id !== undefined) profileUpdates.usuario_id = updates.usuario_id || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;
  if (updates.honorario_consulta !== undefined) profileUpdates.honorario_consulta = updates.honorario_consulta;
  if (updates.honorario_estudio !== undefined) profileUpdates.honorario_estudio = updates.honorario_estudio;
  if (updates.honorario_procedimiento !== undefined) profileUpdates.honorario_procedimiento = updates.honorario_procedimiento;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  // Validar vínculo: el usuario debe tener rol doctor o administrador
  // (El perfil cacheado de sesión no incluye el vínculo doctor: no hace falta invalidarPerfil.)
  if (updates.usuario_id) {
    const vinculoError = await validarVinculo(supabase, updates.usuario_id, id);
    if (vinculoError) return vinculoError;
  }

  const { error: profileError } = await supabase
    .from('doctores')
    .update(profileUpdates)
    .eq('id', id);

  if (profileError) {
    return respuestaErrorDb(profileError, 'configuracion.doctores');
  }

  invalidarDoctorDeUsuario(); // el vínculo usuario↔doctor pudo cambiar
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'Falta el ID del doctor');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('doctores')
    .update({ activo: false })
    .eq('id', id);

  if (error) {
    return respuestaErrorDb(error, 'configuracion.doctores');
  }

  invalidarDoctorDeUsuario(); // el vínculo usuario↔doctor pudo cambiar
  return NextResponse.json({ success: true });
}
