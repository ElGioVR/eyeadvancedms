import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

const conceptoSchema = z.object({
  id: z.string().uuid(),
  cantidad_ojos: z.number().int().min(1).max(2),
}).strict();

const calcularSchema = z.object({
  tipo_consulta: z.enum(['CONSULTA', 'ESTUDIO', 'REVISION', 'PROCEDIMIENTO']),
  tipo_visita: z.enum(['PRIMERA_VEZ', 'SUBSECUENTE']),
  estudios: z.array(conceptoSchema).max(50).optional().nullable(),
  procedimientos: z.array(conceptoSchema).max(50).optional().nullable(),
  aseguranza_id: z.string().uuid().optional().nullable(),
}).strict();

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, calcularSchema, { maxBytes: 20_000 });
  if (data instanceof NextResponse) return data;
  const supabase = getSupabaseAdmin();

  const estudioIds = [...new Set((data.estudios || []).map((e) => e.id))];
  const procIds = [...new Set((data.procedimientos || []).map((p) => p.id))];

  // Las 4 lecturas son independientes: un solo viaje en paralelo (antes 4 en serie)
  const [matrizRes, estudiosRes, procsRes, coberturaRes] = await Promise.all([
    supabase
      .from('matriz_costos')
      .select('costo')
      .eq('tipo_consulta', data.tipo_consulta)
      .eq('tipo_visita', data.tipo_visita)
      .eq('activo', true)
      .maybeSingle(),
    estudioIds.length > 0
      ? supabase.from('catalogo_estudios').select('id, nombre, costo, bilateral').in('id', estudioIds).eq('activo', true)
      : Promise.resolve({ data: [] as Array<{ id: string; nombre: string; costo: number; bilateral: boolean }> }),
    procIds.length > 0
      ? supabase.from('catalogo_procedimientos').select('id, nombre, costo, por_ojo').in('id', procIds).eq('activo', true)
      : Promise.resolve({ data: [] as Array<{ id: string; nombre: string; costo: number; por_ojo: boolean }> }),
    data.aseguranza_id
      ? supabase
          .from('coberturas_aseguranza')
          .select('porcentaje_cobertura, monto_maximo, aplica_estudios, aplica_procedimientos')
          .eq('aseguranza_id', data.aseguranza_id)
          .eq('activo', true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const matriz = matrizRes.data;

  const costoBase = Number(matriz?.costo) || 0;
  let costoEstudios = 0;
  let costoProcedimientos = 0;
  const desgloseEstudios: Array<{ nombre: string; costo_unitario: number; cantidad_ojos: number; subtotal: number }> = [];
  const desgloseProcedimientos: Array<{ nombre: string; costo_unitario: number; cantidad_ojos: number; subtotal: number }> = [];

  if (data.estudios && data.estudios.length > 0) {
    const estudiosDB = estudiosRes.data;
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
    const procsDB = procsRes.data;
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
    const cobertura = coberturaRes.data;
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

export const POST = ruta('calcular-costo#POST', manejarPOST);
