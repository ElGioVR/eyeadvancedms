import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const configSchema = z.object({
  aseguranza_afecta_honorarios: z.boolean().optional(),
  base_calculo_honorario: z.enum(['COBRO_TOTAL', 'PARTE_PACIENTE']).optional(),
  tipo_cambio_default: z.number().positive().optional(),
  devengo_automatico: z.boolean().optional(),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .select('clave, valor, updated_at')
    .eq('clave', 'honorarios')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Error al leer configuración' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      clave: 'honorarios',
      valor: {
        aseguranza_afecta_honorarios: false,
        base_calculo_honorario: 'COBRO_TOTAL',
        tipo_cambio_default: 17.50,
        devengo_automatico: true,
      },
      updated_at: null,
    });
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = configSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from('configuracion_sistema')
    .select('valor')
    .eq('clave', 'honorarios')
    .maybeSingle();

  const currentValor = existing?.valor ?? {
    aseguranza_afecta_honorarios: false,
    base_calculo_honorario: 'COBRO_TOTAL',
    tipo_cambio_default: 17.50,
    devengo_automatico: true,
  };

  const mergedValor = { ...currentValor, ...validation.data };

  const { error: upsertError } = await supabase
    .from('configuracion_sistema')
    .upsert(
      {
        clave: 'honorarios',
        valor: mergedValor,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clave' }
    );

  if (upsertError) {
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 });
  }

  return NextResponse.json({ valor: mergedValor, updated_at: new Date().toISOString() });
}
