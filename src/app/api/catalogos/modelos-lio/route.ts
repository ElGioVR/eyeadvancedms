import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';
import { z } from 'zod';
import { leerJSON } from '@/lib/api/validar';
import { VALORES_DISENO_LIO, fabricanteCanonico } from '@/lib/catalogos/modelos-lio';

/**
 * GET /api/catalogos/modelos-lio — modelos de LIO activos (todos los roles).
 * El filtrado por diseño/tórico se hace en el cliente (catálogo pequeño).
 */
async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabaseAdmin()
    .from('cat_modelos_lio')
    .select('id, fabricante, modelo, diseno, torico, verificado, origen, notas, activo')
    .eq('activo', true)
    .order('fabricante')
    .order('modelo')
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogos.modelos-lio').mensaje }, { status: 500 });
  }
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, max-age=60' } });
}

const COLUMNAS = 'id, fabricante, modelo, diseno, torico, verificado, origen, notas, activo';

/** Alta rápida desde la cirugía: marca (nueva o existente) + modelo. Queda «por verificar». */
const altaSchema = z.object({
  fabricante: z.string().trim().min(1, 'Escribe la marca').max(120),
  modelo: z.string().trim().min(1, 'Escribe el modelo').max(160),
  diseno: z.enum(VALORES_DISENO_LIO),
  torico: z.boolean(),
}).strict();

/**
 * POST /api/catalogos/modelos-lio — agrega un modelo (o marca) de LIO que no está en el catálogo,
 * sin salir del formulario de cirugía. Si ya existe (mismo fabricante, modelo y tórico) se
 * reactiva y se devuelve el existente. Roles que agendan cirugías (no enfermería).
 */
async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista', 'doctor']);
  if (roleError) return roleError;
  const data = await leerJSON(request, altaSchema);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const fabricante = fabricanteCanonico(data.fabricante).replace(/\s+/g, ' ');
  const modelo = data.modelo.replace(/\s+/g, ' ');
  const { data: existentes, error: errLeer } = await supabase
    .from('cat_modelos_lio')
    .select(COLUMNAS)
    .ilike('modelo', modelo.replace(/[\\%_]/g, (c) => `\\${c}`))
    .eq('torico', data.torico)
    .limit(20);
  if (errLeer) {
    return NextResponse.json({ error: handleSupabaseError(errLeer, 'catalogos.modelos-lio.alta').mensaje }, { status: 500 });
  }
  const ya = (existentes || []).find((m) => fabricanteCanonico(m.fabricante as string).toLowerCase() === fabricante.toLowerCase());
  if (ya) {
    if (!ya.activo) await supabase.from('cat_modelos_lio').update({ activo: true, updated_at: new Date().toISOString() }).eq('id', ya.id);
    return NextResponse.json({ ...ya, activo: true, existente: true });
  }
  const { data: creado, error } = await supabase
    .from('cat_modelos_lio')
    .insert({
      fabricante, modelo, diseno: data.diseno, torico: data.torico,
      verificado: false, origen: 'MANUAL', activo: true,
      notas: 'Alta rápida desde el formulario de cirugía (por verificar en Configuración → Marcas)',
    })
    .select(COLUMNAS)
    .single();
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogos.modelos-lio.alta').mensaje }, { status: 500 });
  }
  return NextResponse.json(creado, { status: 201 });
}

export const GET = ruta('catalogos/modelos-lio#GET', manejarGET);
export const POST = ruta('catalogos/modelos-lio#POST', manejarPOST);
