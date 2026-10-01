import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { respuestaErrorDb } from '@/lib/api/configuracion';
import { VALORES_DISENO_LIO } from '@/lib/catalogos/modelos-lio';

/** Administración del catálogo de modelos de LIO (solo admin). */

const COLUMNAS = 'id, fabricante, modelo, diseno, torico, verificado, origen, notas, activo, updated_at';

const fila = z.object({
  fabricante: z.string().trim().min(1, 'El fabricante es obligatorio').max(120),
  modelo: z.string().trim().min(1, 'El modelo es obligatorio').max(160),
  diseno: z.enum(VALORES_DISENO_LIO),
  torico: z.boolean(),
}).strict();

const crearSchema = z.union([
  fila.extend({ notas: z.string().trim().max(500).optional().nullable(), verificado: z.boolean().optional() }).strict(),
  // Importación CSV (filas ya validadas en el cliente; el servidor revalida)
  z.object({ filas: z.array(fila).min(1).max(500) }).strict(),
  // Traer del inventario: ejecuta sembrar_cat_modelos_lio() (idempotente)
  z.object({ accion: z.literal('sembrar_inventario') }).strict(),
]);

const actualizarSchema = z.object({
  id: z.string().uuid(),
  fabricante: z.string().trim().min(1).max(120).optional(),
  modelo: z.string().trim().min(1).max(160).optional(),
  diseno: z.enum(VALORES_DISENO_LIO).optional(),
  torico: z.boolean().optional(),
  verificado: z.boolean().optional(),
  activo: z.boolean().optional(),
  notas: z.string().trim().max(500).optional().nullable(),
}).strict();

async function soloAdmin() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;
  return null;
}

/** GET — todos los modelos, incluidos inactivos (para administrar). */
export async function GET() {
  const denegado = await soloAdmin();
  if (denegado) return denegado;
  const { data, error } = await getSupabaseAdmin()
    .from('cat_modelos_lio')
    .select(COLUMNAS)
    .order('fabricante')
    .order('modelo')
    .limit(2000);
  if (error) return respuestaErrorDb(error, 'configuracion.modelos-lio');
  return NextResponse.json(data || []);
}

/** POST — alta de un modelo, o importación CSV con { filas } (omite duplicados). */
export async function POST(request: Request) {
  const denegado = await soloAdmin();
  if (denegado) return denegado;
  const data = await leerJSON(request, crearSchema, { maxBytes: 200_000 });
  if (data instanceof NextResponse) return data;
  const supabase = getSupabaseAdmin();

  if ('accion' in data) {
    const { data: agregados, error } = await supabase.rpc('sembrar_cat_modelos_lio');
    if (error) return respuestaErrorDb(error, 'configuracion.modelos-lio.sembrar');
    return NextResponse.json({ creadas: Number(agregados) || 0 }, { status: 201 });
  }

  if ('filas' in data) {
    // Omite los que ya existen (el índice único es case-insensitive) y los inserta en un solo viaje.
    const clave = (f: { fabricante: string; modelo: string; torico: boolean }) =>
      `${f.fabricante.trim().toLowerCase()}|${f.modelo.trim().toLowerCase()}|${f.torico}`;
    const { data: existentes, error: errLeer } = await supabase
      .from('cat_modelos_lio')
      .select('fabricante, modelo, torico')
      .limit(5000);
    if (errLeer) return respuestaErrorDb(errLeer, 'configuracion.modelos-lio.importar');
    const ya = new Set((existentes || []).map(clave));
    const nuevas = data.filas.filter((f) => {
      const k = clave(f);
      if (ya.has(k)) return false;
      ya.add(k);
      return true;
    });
    if (nuevas.length > 0) {
      const { error } = await supabase
        .from('cat_modelos_lio')
        .insert(nuevas.map((f) => ({ ...f, origen: 'CSV', verificado: false })));
      if (error) return respuestaErrorDb(error, 'configuracion.modelos-lio.importar', { duplicado: 'Algún modelo ya estaba en el catálogo; vuelve a intentar' });
    }
    return NextResponse.json({ creadas: nuevas.length, omitidas: data.filas.length - nuevas.length }, { status: 201 });
  }

  const { data: creado, error } = await supabase
    .from('cat_modelos_lio')
    .insert({
      fabricante: data.fabricante,
      modelo: data.modelo,
      diseno: data.diseno,
      torico: data.torico,
      notas: data.notas || null,
      verificado: data.verificado ?? true,
      origen: 'MANUAL',
    })
    .select(COLUMNAS)
    .single();
  if (error) return respuestaErrorDb(error, 'configuracion.modelos-lio', { duplicado: 'Ese modelo ya está en el catálogo' });
  return NextResponse.json(creado, { status: 201 });
}

/** PATCH — editar, marcar verificado o activar/desactivar (no se borran: pueden estar en cirugías). */
export async function PATCH(request: Request) {
  const denegado = await soloAdmin();
  if (denegado) return denegado;
  const data = await leerJSON(request, actualizarSchema);
  if (data instanceof NextResponse) return data;
  const { id, ...cambios } = data;
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Sin cambios para aplicar' }, { status: 400 });
  }
  const { data: actualizado, error } = await getSupabaseAdmin()
    .from('cat_modelos_lio')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) return respuestaErrorDb(error, 'configuracion.modelos-lio', { duplicado: 'Ese modelo ya está en el catálogo' });
  return NextResponse.json(actualizado);
}
