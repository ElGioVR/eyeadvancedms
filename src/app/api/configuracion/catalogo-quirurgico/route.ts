import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { idDeQuery, respuestaErrorDb } from '@/lib/api/configuracion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';
import { existeNombre } from '@/lib/api/catalogo-nombres';

const TABLA = 'catalogo_quirurgico';
const CONTEXTO = 'configuracion/catalogo-quirurgico';

// Lista de procedimientos quirúrgicos para crear cirugías: nombre, ojo y precio.
const baseSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  ojo: z.enum(['OD', 'OI', 'OU']).nullable().optional(),
  precio: z.number().min(0).max(10_000_000).optional(),
  activo: z.boolean().optional(),
}).strict();

const updateSchema = z.object({
  id: z.string().uuid(),
}).merge(baseSchema.partial()).strict();

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  // Con `precio` (sql/patch-catalogo-quirurgico-precio.sql); sin la columna, como antes.
  let res = await supabase.from(TABLA).select('id, nombre, ojo, precio, activo').order('nombre', { ascending: true }).limit(2000);
  if (res.error && /precio/.test(res.error.message)) {
    res = (await supabase.from(TABLA).select('id, nombre, ojo, activo').order('nombre', { ascending: true }).limit(2000)) as typeof res;
  }
  if (res.error) return respuestaErrorDb(res.error, CONTEXTO);
  return NextResponse.json(res.data);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Alta: también desde el formulario de cirugía («¿No está en la lista? Agregar cirugía»),
  // por quien agenda. Editar precio, renombrar o borrar sigue siendo solo de admin.
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista', 'doctor']);
  if (roleError) return roleError;

  const body = await leerJSON(request, baseSchema);
  if (body instanceof NextResponse) return body;
  // Solo admin fija precio/estado al crear; el resto crea con precio 0 (se captura en Configuración).
  if ((await requireRole(auth.user, ['admin'])) !== null) {
    delete body.precio;
    delete body.activo;
  }
  body.nombre = body.nombre.replace(/\s+/g, ' ');

  const supabase = getSupabaseAdmin();
  if (await existeNombre(TABLA, body.nombre, { ojo: body.ojo ?? null })) {
    // Desde la cirugía: si ya existe (aunque esté inactiva) se reutiliza en vez de fallar.
    if (!body.ojo) {
      const exacto = body.nombre.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: ya } = await supabase.from(TABLA).select('id, nombre, ojo, activo').ilike('nombre', exacto).is('ojo', null).limit(1).maybeSingle();
      if (ya) {
        if (ya.activo === false) await supabase.from(TABLA).update({ activo: true, updated_at: new Date().toISOString() }).eq('id', ya.id);
        return NextResponse.json({ ...ya, activo: true });
      }
    }
    return NextResponse.json({ error: 'Ya existe ese procedimiento para ese ojo' }, { status: 409 });
  }

  const { data, error } = await supabase.from(TABLA).insert(body).select().single();
  if (error) return respuestaErrorDb(error, CONTEXTO, { duplicado: 'Ya existe ese procedimiento para ese ojo' });

  return NextResponse.json(data, { status: 201 });
}

async function manejarPUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, updateSchema);
  if (body instanceof NextResponse) return body;

  const { id, ...updates } = body;
  const supabase = getSupabaseAdmin();

  if (updates.nombre !== undefined || updates.ojo !== undefined) {
    const { data: actual } = await supabase.from(TABLA).select('nombre, ojo').eq('id', id).maybeSingle();
    if (actual) {
      const nombreFinal = updates.nombre ?? actual.nombre;
      const ojoFinal = updates.ojo !== undefined ? updates.ojo : actual.ojo;
      if (await existeNombre(TABLA, nombreFinal, { excluirId: id, ojo: ojoFinal ?? null })) {
        return NextResponse.json({ error: 'Ya existe ese procedimiento para ese ojo' }, { status: 409 });
      }
    }
  }

  const { data, error } = await supabase
    .from(TABLA)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return respuestaErrorDb(error, CONTEXTO, { noEncontrado: 'Procedimiento no encontrado', duplicado: 'Ya existe ese procedimiento para ese ojo' });
  return NextResponse.json(data);
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'ID requerido');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(TABLA).delete().eq('id', id);
  if (error) return respuestaErrorDb(error, CONTEXTO, { referencia: 'No se puede eliminar: el procedimiento está en uso' });

  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/catalogo-quirurgico#GET', manejarGET);
export const POST = ruta('configuracion/catalogo-quirurgico#POST', manejarPOST);
export const PUT = ruta('configuracion/catalogo-quirurgico#PUT', manejarPUT);
export const DELETE = ruta('configuracion/catalogo-quirurgico#DELETE', manejarDELETE);
