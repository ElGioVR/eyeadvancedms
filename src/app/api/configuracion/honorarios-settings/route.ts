import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const configSchema = z.object({
  aseguranza_afecta_honorarios: z.boolean().optional(),
  base_calculo_honorario: z.enum(['COBRO_TOTAL', 'PARTE_PACIENTE']).optional(),
  tipo_cambio_default: z.number().finite().positive().max(1000).optional(),
  devengo_automatico: z.boolean().optional(),
  periodo_pago: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL']).optional(),
}).strict();

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .select('clave, valor, updated_at')
    .eq('clave', 'honorarios')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'honorarios-settings.get').mensaje }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      clave: 'honorarios',
      valor: {
        aseguranza_afecta_honorarios: false,
        base_calculo_honorario: 'COBRO_TOTAL',
        tipo_cambio_default: 17.50,
        devengo_automatico: true,
        periodo_pago: 'MENSUAL',
      },
      updated_at: null,
    });
  }

  const valor = (data.valor as Record<string, unknown>) || {};
  return NextResponse.json({
    ...data,
    valor: {
      aseguranza_afecta_honorarios: false,
      base_calculo_honorario: 'COBRO_TOTAL',
      tipo_cambio_default: 17.50,
      devengo_automatico: true,
      periodo_pago: 'MENSUAL',
      ...valor,
    },
  });
}

async function manejarPUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const validado = await leerJSON(request, configSchema);
  if (validado instanceof NextResponse) return validado;

  const supabase = getSupabaseAdmin();

  const { data: existing, error: readError } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'honorarios')
    .maybeSingle();

  // Si la lectura falla no se sobrescribe la configuración con los valores por defecto
  if (readError) {
    return NextResponse.json({ error: handleSupabaseError(readError, 'honorarios-settings.put').mensaje }, { status: 500 });
  }

  const currentValor = (existing?.valor as Record<string, unknown> | null) ?? {
    aseguranza_afecta_honorarios: false,
    base_calculo_honorario: 'COBRO_TOTAL',
    tipo_cambio_default: 17.50,
    devengo_automatico: true,
    periodo_pago: 'MENSUAL',
  };

  const mergedValor = { ...currentValor, ...validado };
  const ahora = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from('configuracion_sistema')
    .upsert(
      {
        clave: 'honorarios',
        valor: mergedValor,
        updated_by: auth.user.id,
        updated_at: ahora,
      },
      { onConflict: 'clave' }
    );

  if (upsertError) {
    return NextResponse.json({ error: handleSupabaseError(upsertError, 'honorarios-settings.put').mensaje }, { status: 500 });
  }

  return NextResponse.json({ valor: mergedValor, updated_at: ahora });
}

export const GET = ruta('configuracion/honorarios-settings#GET', manejarGET);
export const PUT = ruta('configuracion/honorarios-settings#PUT', manejarPUT);
