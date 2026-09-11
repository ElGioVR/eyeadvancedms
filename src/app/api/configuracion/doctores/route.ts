import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { z } from 'zod';

const doctorCreateSchema = z.object({
  nombre: z.string().min(1).max(255),
  cedula: z.string().max(50).optional(),
  especialidad: z.string().max(255).optional(),
  telefono: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  honorario_consulta: z.number().min(0).optional(),
  honorario_estudio: z.number().min(0).optional(),
  honorario_procedimiento: z.number().min(0).optional(),
}).strict();

const doctorUpdateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(255).optional(),
  cedula: z.string().max(50).optional().nullable(),
  especialidad: z.string().max(255).optional(),
  telefono: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  activo: z.boolean().optional(),
  honorario_consulta: z.number().min(0).optional(),
  honorario_estudio: z.number().min(0).optional(),
  honorario_procedimiento: z.number().min(0).optional(),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('doctores')
    .select('id, nombre_completo, especialidad, cedula_profesional, telefono, email, activo, honorario_consulta, honorario_estudio, honorario_procedimiento, created_at')
    .eq('activo', true)
    .order('nombre_completo');

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  const result = data.map((d) => ({
    id: d.id,
    nombre: d.nombre_completo,
    especialidad: d.especialidad,
    cedula: d.cedula_profesional,
    telefono: d.telefono,
    email: d.email,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = doctorCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const { data: doctor, error } = await supabase
    .from('doctores')
    .insert({
      nombre_completo: data.nombre.trim(),
      cedula_profesional: data.cedula?.trim() || null,
      especialidad: data.especialidad?.trim() || 'Oftalmología',
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      honorario_consulta: data.honorario_consulta || 0,
      honorario_estudio: data.honorario_estudio || 0,
      honorario_procedimiento: data.honorario_procedimiento || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(doctor, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = doctorUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const { id, ...updates } = data;

  const profileUpdates: Record<string, any> = {};
  if (updates.nombre) profileUpdates.nombre_completo = updates.nombre.trim();
  if (updates.cedula !== undefined) profileUpdates.cedula_profesional = updates.cedula?.trim() || null;
  if (updates.especialidad) profileUpdates.especialidad = updates.especialidad.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.email !== undefined) profileUpdates.email = updates.email?.trim() || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;
  if (updates.honorario_consulta !== undefined) profileUpdates.honorario_consulta = updates.honorario_consulta;
  if (updates.honorario_estudio !== undefined) profileUpdates.honorario_estudio = updates.honorario_estudio;
  if (updates.honorario_procedimiento !== undefined) profileUpdates.honorario_procedimiento = updates.honorario_procedimiento;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('doctores')
    .update(profileUpdates)
    .eq('id', id);

  if (profileError) {
    return NextResponse.json({ error: errorTranslations[profileError.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Falta el ID del doctor' }, { status: 400 });
  }

  const { error } = await supabase
    .from('doctores')
    .update({ activo: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
