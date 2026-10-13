import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { requireRoleInventario } from '@/lib/acceso-enfermeria';
import { ruta } from '@/lib/api/ruta';

export interface LenteComprometido {
  inventario_item_id: string;
  cirugia_id: string;
  orden: string;
  fecha: string | null;
  paciente: string | null;
}

/**
 * Piezas de inventario comprometidas (RESERVADO) a cirugías activas.
 * Sirve para mostrar "existe en inventario pero está asignado a la cirugía de X"
 * y para calcular el disponible real = stock − comprometidos.
 */
async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRoleInventario(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { data, error } = await getSupabaseAdmin()
    .from('cirugia_lentes')
    .select('inventario_item_id, cirugia_id, orden, agenda_cirugias!inner(fecha, nombre_paciente, estado)')
    .eq('estado', 'RESERVADO')
    .not('inventario_item_id', 'is', null)
    .limit(1000);
  if (error) return NextResponse.json([] satisfies LenteComprometido[]);

  const filas: LenteComprometido[] = (data ?? [])
    .map((r: any) => {
      const c = Array.isArray(r.agenda_cirugias) ? r.agenda_cirugias[0] : r.agenda_cirugias;
      return { r, c };
    })
    .filter(({ c }) => c && !['cancelada', 'completada', 'reagendada'].includes(String(c.estado ?? '').toLowerCase()))
    .map(({ r, c }) => ({
      inventario_item_id: r.inventario_item_id as string,
      cirugia_id: r.cirugia_id as string,
      orden: r.orden as string,
      fecha: (c.fecha as string) ?? null,
      paciente: (c.nombre_paciente as string) ?? null,
    }));
  return NextResponse.json(filas);
}

export const GET = ruta('inventario/lentes-comprometidos#GET', manejarGET);
