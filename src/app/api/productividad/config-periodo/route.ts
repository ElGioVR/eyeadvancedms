import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { getPeriodRange, leerTipoPeriodo } from '@/lib/productividad';
import { leerJSONTolerante } from '@/lib/productividad/validacion';
import { hoyTijuana } from '@/lib/rangos';
import { z } from 'zod';

const putSchema = z
  .object({
    tipo: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL'], {
      errorMap: () => ({ message: 'Tipo de período inválido' }),
    }),
  })
  .strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const tipo = await leerTipoPeriodo();
    const rango = getPeriodRange(hoyTijuana(), tipo);
    return NextResponse.json({ tipo, periodo: rango });
  } catch {
    return NextResponse.json({ tipo: 'MENSUAL' });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  // Tolerante: el panel envía el body sin cabecera Content-Type.
  const body = await leerJSONTolerante(request, putSchema, 1_000);
  if (body instanceof NextResponse) return body;

  const supabase = getSupabaseAdmin();
  const { data: existing, error: errLeer } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'honorarios')
    .maybeSingle();

  // Sin esto, un fallo de lectura sobrescribía la configuración con los defaults.
  if (errLeer) {
    return NextResponse.json({ error: 'Error al guardar período' }, { status: 500 });
  }

  const current = (existing?.valor as Record<string, unknown>) || {
    aseguranza_afecta_honorarios: false,
    base_calculo_honorario: 'COBRO_TOTAL',
    tipo_cambio_default: 17.50,
    devengo_automatico: true,
  };

  const merged = { ...current, periodo_pago: body.tipo };

  const { error } = await supabase
    .from('configuracion_sistema')
    .upsert(
      {
        clave: 'honorarios',
        valor: merged,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clave' }
    );

  if (error) {
    return NextResponse.json({ error: 'Error al guardar período' }, { status: 500 });
  }

  return NextResponse.json({ tipo: body.tipo });
}
