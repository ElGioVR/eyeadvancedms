import 'server-only';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hoyTijuana } from '@/lib/rangos';
import { memo } from '@/lib/cache-memoria';
import { ruta } from '@/lib/api/ruta';

/**
 * Resumen para la pantalla de login (sin sesión). Solo devuelve cifras
 * agregadas: sin nombres, expedientes, diagnósticos ni montos.
 * Un valor `null` significa que no se pudo leer; la UI lo muestra como "—".
 */
export interface ResumenPublico {
  consultasHoy: number | null;
  consultasAyer: number | null;
  pacientesRegistrados: number | null;
  personalActivo: number | null;
  personalPorTipo: { medicos: number; enfermeros: number; anestesiologos: number } | null;
}

function diaAnterior(fecha: string): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

async function calcular(hoy: string): Promise<ResumenPublico> {
  const supabase = getSupabaseAdmin();
  const ayer = diaAnterior(hoy);

  const [hoyR, ayerR, pacientesR, personalR] = await Promise.all([
    supabase.from('consultas').select('id', { count: 'exact', head: true }).eq('fecha', hoy),
    supabase.from('consultas').select('id', { count: 'exact', head: true }).eq('fecha', ayer),
    supabase.from('pacientes').select('id', { count: 'exact', head: true }),
    supabase.from('doctores').select('tipo_personal').eq('activo', true).limit(1000),
  ]);

  let personalPorTipo: ResumenPublico['personalPorTipo'] = null;
  if (!personalR.error) {
    personalPorTipo = { medicos: 0, enfermeros: 0, anestesiologos: 0 };
    for (const d of personalR.data ?? []) {
      if (d.tipo_personal === 'ENFERMERO') personalPorTipo.enfermeros++;
      else if (d.tipo_personal === 'ANESTESIOLOGO') personalPorTipo.anestesiologos++;
      else personalPorTipo.medicos++;
    }
  }
  const personalActivo = personalPorTipo
    ? personalPorTipo.medicos + personalPorTipo.enfermeros + personalPorTipo.anestesiologos
    : null;

  return {
    consultasHoy: hoyR.error ? null : (hoyR.count ?? 0),
    consultasAyer: ayerR.error ? null : (ayerR.count ?? 0),
    pacientesRegistrados: pacientesR.error ? null : (pacientesR.count ?? 0),
    personalActivo,
    personalPorTipo,
  };
}

async function manejarGET() {
  const hoy = hoyTijuana();
  // Cifras iguales para todos → se calculan una vez por minuto por instancia.
  const datos = await memo(`resumen-publico:${hoy}`, 60_000, () => calcular(hoy));
  return NextResponse.json(datos, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}

export const GET = ruta('publico.resumen-clinica#GET', manejarGET);
