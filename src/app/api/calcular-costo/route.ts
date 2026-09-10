import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { z } from 'zod';

const calcularSchema = z.object({
  tipo_consulta: z.enum(['CONSULTA', 'ESTUDIO', 'REVISION', 'PROCEDIMIENTO']),
  tipo_visita: z.enum(['PRIMERA_VEZ', 'SUBSECUENTE']),
  estudios: z.array(z.object({
    id: z.string().uuid(),
    cantidad_ojos: z.number().int().min(1).max(2),
  })).optional().nullable(),
  procedimientos: z.array(z.object({
    id: z.string().uuid(),
    cantidad_ojos: z.number().int().min(1).max(2),
  })).optional().nullable(),
  aseguranza_id: z.string().uuid().optional().nullable(),
}).strict();

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = calcularSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const supabase = getSupabaseAdmin();

  const { data: matriz } = await supabase
    .from('matriz_costos')
    .select('costo')
    .eq('tipo_consulta', data.tipo_consulta)
    .eq('tipo_visita', data.tipo_visita)
    .eq('activo', true)
    .maybeSingle();

  let costoBase = matriz?.costo || 0;
  let costoEstudios = 0;
  let costoProcedimientos = 0;
  let desgloseEstudios: Array<{ nombre: string; costo_unitario: number; cantidad_ojos: number; subtotal: number }> = [];
  let desgloseProcedimientos: Array<{ nombre: string; costo_unitario: number; cantidad_ojos: number; subtotal: number }> = [];

  if (data.estudios && data.estudios.length > 0) {
    const estudioIds = data.estudios.map((e) => e.id);
    const { data: estudiosDB } = await supabase
      .from('catalogo_estudios')
      .select('id, nombre, costo, bilateral')
      .in('id', estudioIds)
      .eq('activo', true);

    const estudioMap = new Map((estudiosDB || []).map((e) => [e.id, e]));

    for (const e of data.estudios) {
      const estudio = estudioMap.get(e.id);
      if (estudio) {
        const ojos = estudio.bilateral ? e.cantidad_ojos : 1;
        const subtotal = estudio.costo * ojos;
        costoEstudios += subtotal;
        desgloseEstudios.push({
          nombre: estudio.nombre,
          costo_unitario: estudio.costo,
          cantidad_ojos: ojos,
          subtotal,
        });
      }
    }
  }

  if (data.procedimientos && data.procedimientos.length > 0) {
    const procIds = data.procedimientos.map((p) => p.id);
    const { data: procsDB } = await supabase
      .from('catalogo_procedimientos')
      .select('id, nombre, costo, por_ojo')
      .in('id', procIds)
      .eq('activo', true);

    const procMap = new Map((procsDB || []).map((p) => [p.id, p]));

    for (const p of data.procedimientos) {
      const proc = procMap.get(p.id);
      if (proc) {
        const ojos = proc.por_ojo ? p.cantidad_ojos : 1;
        const subtotal = proc.costo * ojos;
        costoProcedimientos += subtotal;
        desgloseProcedimientos.push({
          nombre: proc.nombre,
          costo_unitario: proc.costo,
          cantidad_ojos: ojos,
          subtotal,
        });
      }
    }
  }

  const subtotalSinCobertura = costoBase + costoEstudios + costoProcedimientos;
  let porcentajeCobertura = 0;
  let montoCobertura = 0;
  let montoPaciente = subtotalSinCobertura;

  if (data.aseguranza_id) {
    const { data: cobertura } = await supabase
      .from('coberturas_aseguranza')
      .select('porcentaje_cobertura, monto_maximo, aplica_estudios, aplica_procedimientos')
      .eq('aseguranza_id', data.aseguranza_id)
      .eq('activo', true)
      .maybeSingle();

    if (cobertura) {
      porcentajeCobertura = cobertura.porcentaje_cobertura;

      let baseCobertura = costoBase;
      if (cobertura.aplica_estudios) baseCobertura += costoEstudios;
      if (cobertura.aplica_procedimientos) baseCobertura += costoProcedimientos;

      montoCobertura = baseCobertura * (porcentajeCobertura / 100);

      if (cobertura.monto_maximo && montoCobertura > cobertura.monto_maximo) {
        montoCobertura = cobertura.monto_maximo;
      }

      montoPaciente = subtotalSinCobertura - montoCobertura;
    }
  }

  return NextResponse.json({
    costo_base: costoBase,
    costo_estudios: costoEstudios,
    costo_procedimientos: costoProcedimientos,
    subtotal: subtotalSinCobertura,
    porcentaje_cobertura: porcentajeCobertura,
    monto_cobertura: montoCobertura,
    total_paciente: montoPaciente,
    desglose_estudios: desgloseEstudios,
    desglose_procedimientos: desgloseProcedimientos,
  });
}
