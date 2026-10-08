import 'server-only';

import { NextResponse } from 'next/server';
import { resolveDoctorId } from '@/lib/auth-helpers';
import { agendaSoloPropia } from '@/lib/permisos-agenda';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { PerfilSesion } from '@/lib/supabase/server';

/**
 * Reglas de acceso a consultas (exclusivo de /api/consultas/**):
 *  - LISTADO del módulo Consultas: el doctor ve solo las suyas; el admin con
 *    modo_focus (doctor-jefe con registro en doctores) también.
 *  - Detalle y mutaciones (abrir, editar, aplazar, reagendar, cancelar): el
 *    doctor tiene acceso total, como en la Agenda (ver lib/permisos-agenda.ts).
 *    Solo el rol de agenda propia (enfermería) queda limitado a lo suyo.
 *  - admin / recepcionista: todo.
 * Usa `auth.perfil` (ya cacheado por requireAuth) en lugar de volver a leer `usuarios`.
 */

/** Equivalente a isModoFocus() pero sin consulta extra: admin + preferencias.modo_focus. */
export function modoFocusActivo(perfil: PerfilSesion | null): boolean {
  return perfil?.rol === 'admin' && perfil.preferencias?.modo_focus === true;
}

/**
 * Doctor al que se limita el LISTADO. `undefined` = sin restricción.
 * `null` = el usuario es doctor pero no tiene registro en `doctores` (no ve nada).
 */
export async function doctorDelListado(userId: string, perfil: PerfilSesion | null): Promise<string | null | undefined> {
  const rol = perfil?.rol;
  if (rol === 'doctor') return resolveDoctorId(userId);
  if (rol === 'admin' && modoFocusActivo(perfil)) {
    const doctorId = await resolveDoctorId(userId);
    return doctorId ?? undefined; // admin en focus sin registro de doctor: sin filtro (como antes)
  }
  return undefined;
}

/** Para detalle/mutaciones: doctor_id que debe coincidir, o `undefined` si no aplica. */
export async function doctorRequerido(userId: string, perfil: PerfilSesion | null): Promise<string | null | undefined> {
  // Enfermería ve y edita cualquier consulta (salvo completadas/canceladas y montos).
  void userId; void perfil; void agendaSoloPropia; void resolveDoctorId;
  return undefined;
}

/** 403 si el usuario (rol de agenda propia) no es el responsable de la consulta. */
export function verificarDueno(
  requerido: string | null | undefined,
  consultaDoctorId: string | null | undefined,
): NextResponse | null {
  if (requerido === undefined) return null;
  if (!requerido || consultaDoctorId !== requerido) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return null;
}

/** Iniciales (2 letras) a partir del nombre completo. */
export function inicialesDe(nombre: string | null | undefined): string {
  return (nombre || '')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Siguiente folio CON-YY-NNNNN. La migración 140 creó `seq_consulta_folio`,
 * pero no hay RPC que exponga nextval() vía PostgREST; se toma el mayor folio
 * del año (índice UNIQUE sobre folio) y el insert reintenta ante colisión 23505.
 */
export async function siguienteFolioConsulta(intento = 0): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefijo = `CON-${year}-`;
  const { data } = await getSupabaseAdmin()
    .from('consultas')
    .select('folio')
    .like('folio', `${prefijo}%`)
    .order('folio', { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.folio as string | undefined;
  const n = ultimo ? parseInt(ultimo.slice(prefijo.length), 10) || 0 : 0;
  return `${prefijo}${(n + 1 + intento).toString().padStart(5, '0')}`;
}

/** true si el error es la violación UNIQUE del folio. */
export function esColisionFolio(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && error.code === '23505' && /folio/i.test(error.message || '');
}
