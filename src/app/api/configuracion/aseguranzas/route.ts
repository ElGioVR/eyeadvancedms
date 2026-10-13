import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { fechaISO, leerJSON } from '@/lib/api/validar';
import { idDeQuery, respuestaErrorDb, textoCorto, textoLargo } from '@/lib/api/configuracion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const tipoAseguranzaEnum = z.enum(['PRIVADA', 'CONVENIO', 'PARTICULAR']);

const COLUMNAS = 'id, nombre, contacto, telefono, direccion, activo, porcentaje_cobertura, tipo, vigente_desde, vigente_hasta';

const aseguranzaCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  telefono: textoCorto(20).optional(),
  direccion: textoLargo.optional(),
  contacto: textoCorto(255).optional(),
  porcentaje_cobertura: z.number().finite().min(0).max(100).optional(),
  tipo: tipoAseguranzaEnum.optional(),
  vigente_desde: fechaISO.optional().nullable(),
  vigente_hasta: fechaISO.optional().nullable(),
}).strict();

const aseguranzaUpdateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(255).optional(),
  telefono: textoCorto(20).optional().nullable(),
  direccion: textoLargo.optional().nullable(),
  contacto: textoCorto(255).optional().nullable(),
  activo: z.boolean().optional(),
  porcentaje_cobertura: z.number().finite().min(0).max(100).optional().nullable(),
  tipo: tipoAseguranzaEnum.optional(),
  vigente_desde: fechaISO.optional().nullable(),
  vigente_hasta: fechaISO.optional().nullable(),
}).strict();

function vigenciaInvalida(desde?: string | null, hasta?: string | null): boolean {
  return !!desde && !!hasta && desde > hasta;
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('aseguranzas')
    .select(COLUMNAS)
    .eq('activo', true)
    .order('nombre')
    .limit(1000);

  if (error) return respuestaErrorDb(error, 'configuracion.aseguranzas.listar');

  return NextResponse.json(data);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, aseguranzaCreateSchema);
  if (data instanceof NextResponse) return data;

  if (vigenciaInvalida(data.vigente_desde, data.vigente_hasta)) {
    return NextResponse.json({ error: 'La vigencia inicial no puede ser posterior a la final' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: aseguranza, error } = await supabase
    .from('aseguranzas')
    .insert({
      nombre: data.nombre.trim(),
      telefono: data.telefono?.trim() || null,
      direccion: data.direccion?.trim() || null,
      contacto: data.contacto?.trim() || null,
      porcentaje_cobertura: data.porcentaje_cobertura ?? 0,
      tipo: data.tipo ?? 'PRIVADA',
      vigente_desde: data.vigente_desde ?? null,
      vigente_hasta: data.vigente_hasta ?? null,
    })
    .select()
    .single();

  if (error) return respuestaErrorDb(error, 'configuracion.aseguranzas.crear');

  return NextResponse.json(aseguranza, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, aseguranzaUpdateSchema);
  if (data instanceof NextResponse) return data;
  const { id, ...updates } = data;

  if (vigenciaInvalida(updates.vigente_desde, updates.vigente_hasta)) {
    return NextResponse.json({ error: 'La vigencia inicial no puede ser posterior a la final' }, { status: 400 });
  }

  const profileUpdates: Record<string, unknown> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre.trim();
  if (updates.telefono !== undefined) profileUpdates.telefono = updates.telefono?.trim() || null;
  if (updates.direccion !== undefined) profileUpdates.direccion = updates.direccion?.trim() || null;
  if (updates.contacto !== undefined) profileUpdates.contacto = updates.contacto?.trim() || null;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;
  if (updates.porcentaje_cobertura !== undefined) profileUpdates.porcentaje_cobertura = updates.porcentaje_cobertura;
  if (updates.tipo !== undefined) profileUpdates.tipo = updates.tipo;
  if (updates.vigente_desde !== undefined) profileUpdates.vigente_desde = updates.vigente_desde;
  if (updates.vigente_hasta !== undefined) profileUpdates.vigente_hasta = updates.vigente_hasta;

  if (Object.keys(profileUpdates).length === 0) {
    return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('aseguranzas')
    .update(profileUpdates)
    .eq('id', id);

  if (error) return respuestaErrorDb(error, 'configuracion.aseguranzas.actualizar');

  return NextResponse.json({ success: true });
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Eliminar una aseguradora afecta precios, coberturas y facturación: solo administración.
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'Falta el ID de la aseguranza');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();
  const { data: aseg, error: errAseg } = await supabase.from('aseguranzas').select('id, nombre').eq('id', id).maybeSingle();
  if (errAseg) return respuestaErrorDb(errAseg, 'configuracion.aseguranzas.eliminar');
  if (!aseg) return NextResponse.json({ error: 'La aseguradora no existe' }, { status: 404 });

  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (norm(aseg.nombre) === 'particular') {
    return NextResponse.json({ error: 'La aseguradora "Particular" no se puede eliminar' }, { status: 403 });
  }

  // Confirmación explícita: hay que escribir el nombre exacto.
  const confirmar = new URL(request.url).searchParams.get('confirmar') ?? '';
  if (norm(confirmar) !== norm(aseg.nombre)) {
    return NextResponse.json({ error: 'Escribe el nombre exacto de la aseguradora para confirmar' }, { status: 400 });
  }

  // No se elimina si todavía hay pacientes o cirugías ligados: primero hay que reasignarlos.
  const [pac, cir] = await Promise.all([
    supabase.from('pacientes').select('id', { count: 'exact', head: true }).eq('aseguranza_id', id),
    supabase.from('agenda_cirugias').select('id', { count: 'exact', head: true }).eq('origen_id', id),
  ]);
  const nPac = pac.count ?? 0;
  const nCir = cir.count ?? 0;
  if (nPac > 0 || nCir > 0) {
    const partes = [nPac > 0 ? `${nPac} paciente${nPac === 1 ? '' : 's'}` : '', nCir > 0 ? `${nCir} cirugía${nCir === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ');
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${partes} asociad${nPac + nCir === 1 ? 'o' : 'os'}. Reasígnalos a otra aseguradora primero.` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('aseguranzas').update({ activo: false }).eq('id', id);
  if (error) return respuestaErrorDb(error, 'configuracion.aseguranzas.eliminar');

  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/aseguranzas#GET', manejarGET);
export const POST = ruta('configuracion/aseguranzas#POST', manejarPOST);
export const PATCH = ruta('configuracion/aseguranzas#PATCH', manejarPATCH);
export const DELETE = ruta('configuracion/aseguranzas#DELETE', manejarDELETE);
