import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { z } from 'zod';

const pacienteCreateSchema = z
  .object({
    nombre_completo: z.string().min(1).max(255).optional(),
    nombre: z.string().min(1).max(255).optional(),
    sexo: z.enum(['H', 'M', 'MASCULINO', 'FEMENINO', 'OTRO']).optional(),
    fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    edad: z.number().int().min(0).max(150).optional(),
    telefono: z.string().max(20).optional(),
    email: z.string().email().max(255).optional(),
    direccion: z.string().max(1000).optional(),
    contacto_emergencia: z.string().max(255).optional(),
    tel_emergencia: z.string().max(20).optional(),
    aseguranza_id: z.string().uuid().optional().nullable(),
    numero_poliza: z.string().max(100).optional().nullable(),
    numero_afiliacion: z.string().max(100).optional().nullable(),
  })
  .strict()
  .refine((data) => data.nombre_completo || data.nombre, {
    message: 'El nombre del paciente es obligatorio',
  });

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
    .from('pacientes')
    .select('id, nombre_completo, sexo, fecha_nacimiento, edad, telefono, email, direccion, contacto_emergencia, tel_emergencia, aseguranza_id, numero_poliza, numero_afiliacion, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  // Get consultation counts and last visit for each patient
  const patientIds = data.map((p) => p.id);
  const [consultasResult, aseguranzasResult] = await Promise.all([
    supabase
      .from('consultas')
      .select('paciente_id, fecha')
      .in('paciente_id', patientIds),
    supabase
      .from('aseguranzas')
      .select('id, nombre')
      .eq('activo', true),
  ]);

  const consultas = consultasResult.data;
  const aseguranzasList = aseguranzasResult.data || [];

  const aseguranzasMap = new Map(aseguranzasList.map((a) => [a.id, a.nombre]));

  const consultasMap = new Map<string, { count: number; ultimaVisita: string }>();
  for (const c of consultas || []) {
    const existing = consultasMap.get(c.paciente_id) || { count: 0, ultimaVisita: '' };
    existing.count++;
    if (c.fecha > existing.ultimaVisita) existing.ultimaVisita = c.fecha;
    consultasMap.set(c.paciente_id, existing);
  }

  const result = data.map((p) => {
    const c = consultasMap.get(p.id);
    const nombre = p.nombre_completo || '';
    const iniciales = nombre
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return {
      id: p.id,
      nombre: p.nombre_completo,
      nombre_completo: p.nombre_completo,
      iniciales,
      sexo: p.sexo === 'MASCULINO' ? 'H' : 'M',
      fecha_nacimiento: p.fecha_nacimiento,
      edad: p.edad,
      telefono: p.telefono,
      email: p.email,
      direccion: p.direccion,
      contacto_emergencia: p.contacto_emergencia,
      tel_emergencia: p.tel_emergencia,
      aseguranza_id: p.aseguranza_id || null,
      aseguradora: p.aseguranza_id ? (aseguranzasMap.get(p.aseguranza_id) || null) : null,
      numero_poliza: p.numero_poliza || null,
      numero_afiliacion: p.numero_afiliacion || null,
      consultas_count: c?.count || 0,
      ultima_visita: c?.ultimaVisita || null,
      created_at: p.created_at,
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

  const validation = pacienteCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  const insertData: Record<string, any> = {
    nombre_completo: data.nombre_completo || data.nombre,
    sexo: 'MASCULINO',
    fecha_nacimiento: '2000-01-01',
  };

  if (data.sexo) {
    insertData.sexo = data.sexo === 'H' ? 'MASCULINO' : data.sexo === 'M' ? 'FEMENINO' : data.sexo;
  }
  if (data.fecha_nacimiento) insertData.fecha_nacimiento = data.fecha_nacimiento;
  if (data.edad !== undefined) insertData.edad = data.edad;
  if (data.telefono) insertData.telefono = data.telefono;
  if (data.email) insertData.email = data.email;
  if (data.direccion) insertData.direccion = data.direccion;
  if (data.contacto_emergencia) insertData.contacto_emergencia = data.contacto_emergencia;
  if (data.tel_emergencia) insertData.tel_emergencia = data.tel_emergencia;
  if (data.aseguranza_id) insertData.aseguranza_id = data.aseguranza_id;
  if (data.numero_poliza) insertData.numero_poliza = data.numero_poliza;
  if (data.numero_afiliacion) insertData.numero_afiliacion = data.numero_afiliacion;

  const { data: paciente, error } = await supabase
    .from('pacientes')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({
    id: paciente.id,
    nombre: paciente.nombre_completo,
    nombre_completo: paciente.nombre_completo,
    sexo: paciente.sexo === 'MASCULINO' ? 'H' : 'M',
    fecha_nacimiento: paciente.fecha_nacimiento,
    edad: paciente.edad,
    telefono: paciente.telefono,
    email: paciente.email,
    direccion: paciente.direccion,
    aseguranza_id: paciente.aseguranza_id || null,
    numero_poliza: paciente.numero_poliza || null,
    numero_afiliacion: paciente.numero_afiliacion || null,
    created_at: paciente.created_at,
  }, { status: 201 });
}
