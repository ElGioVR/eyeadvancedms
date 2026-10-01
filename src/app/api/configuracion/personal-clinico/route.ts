import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { respuestaErrorDb } from '@/lib/api/configuracion';
import { ROLES_APOYO } from '@/lib/catalogos/equipo-quirurgico';

/** Personal de apoyo de quirófano (instrumentista, enfermero, circulante). */

const COLUMNAS = 'id, nombre, rol_principal, telefono, activo';
const rol = z.enum(ROLES_APOYO);

const crearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  rol_principal: rol,
  telefono: z.string().trim().max(20).optional().nullable(),
}).strict();

const actualizarSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(120).optional(),
  rol_principal: rol.optional(),
  telefono: z.string().trim().max(20).optional().nullable(),
  activo: z.boolean().optional(),
}).strict();

async function autorizar() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  return requireRole(auth.user, ['admin', 'recepcionista']);
}

/** GET — todo el personal, incluido el inactivo. */
export async function GET() {
  const denegado = await autorizar();
  if (denegado) return denegado;
  const { data, error } = await getSupabaseAdmin().from('personal_clinico').select(COLUMNAS).order('nombre').limit(1000);
  if (error) return respuestaErrorDb(error, 'configuracion.personal-clinico');
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const denegado = await autorizar();
  if (denegado) return denegado;
  const data = await leerJSON(request, crearSchema);
  if (data instanceof NextResponse) return data;
  const { data: creado, error } = await getSupabaseAdmin()
    .from('personal_clinico')
    .insert({ nombre: data.nombre, rol_principal: data.rol_principal, telefono: data.telefono || null })
    .select(COLUMNAS)
    .single();
  if (error) return respuestaErrorDb(error, 'configuracion.personal-clinico', { duplicado: 'Ya existe una persona con ese nombre' });
  return NextResponse.json(creado, { status: 201 });
}

/** PATCH — editar o activar/desactivar (no se borra: puede estar en cirugías). */
export async function PATCH(request: Request) {
  const denegado = await autorizar();
  if (denegado) return denegado;
  const data = await leerJSON(request, actualizarSchema);
  if (data instanceof NextResponse) return data;
  const { id, ...cambios } = data;
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 });
  const { data: actualizado, error } = await getSupabaseAdmin()
    .from('personal_clinico')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) return respuestaErrorDb(error, 'configuracion.personal-clinico', { duplicado: 'Ya existe una persona con ese nombre' });
  return NextResponse.json(actualizado);
}
