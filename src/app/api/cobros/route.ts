import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations, translateError } from '@/lib/supabase/errors';
import { z } from 'zod';

async function crearNotificacion(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  tipo: 'info' | 'warning' | 'error',
  titulo: string,
  mensaje: string,
  entidadTipo?: string,
  entidadId?: string,
) {
  await supabase.from('notificaciones').insert({
    user_id: userId,
    tipo,
    titulo,
    mensaje,
    entidad_tipo: entidadTipo ?? null,
    entidad_id: entidadId ?? null,
  });
}

const lenteAsignadoSchema = z.object({
  lente_id: z.string().uuid(),
  ojo: z.enum(['DERECHO', 'IZQUIERDO', 'AMBOS']),
  grado_aplicado: z.number().min(-999.99).max(999.99).optional().nullable(),
  cantidad: z.number().int().min(1).max(999),
});

const cobroCreateSchema = z.object({
  paciente_id: z.string().uuid(),
  consulta_id: z.string().uuid().optional().nullable(),
  doctor_id: z.string().uuid().optional().nullable(),
  fecha_consulta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  lentes: lenteAsignadoSchema.array().optional().nullable(),
  monto: z.union([z.string(), z.number()]).pipe(
    z.preprocess((val) => {
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? undefined : parsed;
      }
      return val;
    }, z.number().min(0).max(99999999.99))
  ),
  metodo_pago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NO_APLICA']).optional(),
  moneda: z.enum(['PESOS', 'DOLARES']).optional(),
  pagado: z.boolean().optional(),
  notas: z.string().optional().nullable(),
  aseguranza_id: z.string().uuid().optional().nullable(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from('cobros')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      consultas:consulta_id (doctor_id, diagnostico),
      aseguranzas:aseguranza_id (nombre)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('fecha_pago', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  const doctorIds = [...new Set(
    (data || [])
      .map((c) => (c.consultas as any)?.doctor_id)
      .filter(Boolean)
  )];
  const doctorMap = new Map<string, string>();
  if (doctorIds.length > 0) {
    const { data: doctores } = await supabase
      .from('doctores')
      .select('id, nombre_completo')
      .in('id', doctorIds);
    (doctores || []).forEach((d) => doctorMap.set(d.id, d.nombre_completo));
  }

  const result = data.map((c) => {
    const consulta = c.consultas as any;
    const doctorId = consulta?.doctor_id;
    return {
      id: c.id,
      paciente: (c.pacientes as any)?.nombre_completo || '',
      doctor: doctorId ? doctorMap.get(doctorId) || '' : '',
      diagnostico: consulta?.diagnostico || '',
      fecha: c.fecha_pago || c.created_at,
      monto: c.monto,
      metodo_pago: c.metodo_pago,
      moneda: c.moneda,
      pagado: c.pagado,
      estado: (c as any).estado || (c.pagado ? 'PAGADO' : 'PENDIENTE'),
      folio: c.folio,
      notas: c.notas,
      aseguradora: (c.aseguranzas as any)?.nombre || '',
      consulta_id: c.consulta_id,
      paciente_id: c.paciente_id,
      created_at: c.created_at,
    };
  });

  return NextResponse.json({ data: result, total: count || 0, page, pageSize });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = cobroCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  if (!data.consulta_id && !data.lentes) {
    return NextResponse.json(
      { error: 'Debe al menos asignar lentes o seleccionar una consulta' },
      { status: 400 }
    );
  }

  const pacienteCheck = await supabase
    .from('pacientes')
    .select('id')
    .eq('id', data.paciente_id)
    .maybeSingle();

  if (!pacienteCheck.data) {
    return NextResponse.json({ error: 'El paciente referenciado no existe' }, { status: 404 });
  }

  if (data.aseguranza_id) {
    const aseguranzaCheck = await supabase
      .from('aseguranzas')
      .select('id, activo')
      .eq('id', data.aseguranza_id)
      .maybeSingle();

    if (!aseguranzaCheck.data) {
      return NextResponse.json({ error: 'La aseguranza referenciada no existe' }, { status: 404 });
    }
    if (aseguranzaCheck.data && typeof aseguranzaCheck.data === 'object' && !aseguranzaCheck.data.activo) {
      return NextResponse.json({ error: 'La aseguranza seleccionada no está activa' }, { status: 400 });
    }
  }

  let consultaIdFinal: string | null = data.consulta_id ?? null;

  if (!consultaIdFinal) {
    if (data.doctor_id && data.fecha_consulta && data.hora_inicio) {
      const doctorCheck = await supabase
        .from('doctores')
        .select('id')
        .eq('id', data.doctor_id)
        .maybeSingle();

      if (!doctorCheck.data) {
        return NextResponse.json({ error: 'El doctor seleccionado no existe' }, { status: 404 });
      }

      const { data: nuevaConsulta, error: consultaError } = await supabase
        .from('consultas')
        .insert({
          paciente_id: data.paciente_id,
          doctor_id: data.doctor_id,
          fecha: data.fecha_consulta,
          hora_inicio: data.hora_inicio,
          tipo_consulta: 'CONSULTA',
          tipo_visita: 'PRIMERA_VEZ',
        })
        .select('id')
        .single();

      if (consultaError) {
        return NextResponse.json({ error: translateError(consultaError.message) }, { status: 500 });
      }

      consultaIdFinal = nuevaConsulta.id;
    }
  } else {
    const existingCheck = await supabase
      .from('consultas')
      .select('id, paciente_id')
      .eq('id', consultaIdFinal)
      .maybeSingle();

    if (!existingCheck.data) {
      return NextResponse.json({ error: 'La consulta referenciada no existe' }, { status: 404 });
    }

    if (existingCheck.data.paciente_id !== data.paciente_id) {
      return NextResponse.json(
        { error: 'El paciente no corresponde a la consulta referenciada' },
        { status: 409 }
      );
    }
  }

  const lentesInserts: Array<{ lente_id: string; ojo: string; grado_aplicado: number | null; cantidad: number; stockDisponible: number }> = [];

  if (data.lentes && data.lentes.length > 0) {
    const lenteIds = [...new Set(data.lentes.map((l) => l.lente_id))];

    const { data: lentesEnDB } = await supabase
      .from('lentes')
      .select('id, stock, marca, modelo')
      .in('id', lenteIds);

    const lenteMap = new Map((lentesEnDB || []).map((l) => [l.id, l]));

    for (const l of data.lentes) {
      const lenteDB = lenteMap.get(l.lente_id);
      if (!lenteDB) {
        return NextResponse.json(
          { error: `El lente ${l.lente_id} no existe` },
          { status: 404 }
        );
      }
      if (lenteDB.stock < l.cantidad) {
        return NextResponse.json(
          { error: `Stock insuficiente para ${lenteDB.marca} ${lenteDB.modelo} (disponible: ${lenteDB.stock})` },
          { status: 409 }
        );
      }
      lentesInserts.push({
        lente_id: l.lente_id,
        ojo: l.ojo,
        grado_aplicado: l.grado_aplicado ?? null,
        cantidad: l.cantidad,
        stockDisponible: lenteDB.stock,
      });
    }
  }

  const year = new Date().getFullYear().toString().slice(-2);
  const { count } = await supabase
    .from('cobros')
    .select('id', { count: 'exact', head: true });
  const seq = ((count || 0) + 1).toString().padStart(5, '0');
  const folio = `CF-${year}-${seq}`;

  const insertData = {
    consulta_id: consultaIdFinal,
    paciente_id: data.paciente_id,
    aseguranza_id: data.aseguranza_id ?? null,
    metodo_pago: data.metodo_pago ?? 'NO_APLICA',
    monto: data.monto,
    moneda: data.moneda ?? 'PESOS',
    pagado: data.pagado ?? false,
    folio,
    notas: data.notas ?? null,
  };

  const { data: cobro, error: cobroError } = await supabase
    .from('cobros')
    .insert(insertData)
    .select()
    .single();

  if (cobroError) {
    return NextResponse.json({ error: translateError(cobroError.message) }, { status: 500 });
  }

  if (lentesInserts.length > 0 && consultaIdFinal) {
    const lentesXConsultaRows = lentesInserts.map((l) => ({
      consulta_id: consultaIdFinal,
      lente_id: l.lente_id,
      ojo: l.ojo,
      grado_aplicado: l.grado_aplicado,
      cantidad: l.cantidad,
    }));

    const { error: lxcError } = await supabase
      .from('lentes_x_consulta')
      .insert(lentesXConsultaRows);

    if (lxcError) {
      return NextResponse.json({ error: translateError(lxcError.message) }, { status: 500 });
    }
  }

  if (lentesInserts.length > 0) {
    await Promise.all(
      lentesInserts.map((l) => {
        const nuevoStock = l.stockDisponible - l.cantidad;
        return supabase
          .from('lentes')
          .update({
            stock: nuevoStock,
            estado: nuevoStock === 0 ? 'OCUPADO' : undefined,
          })
          .eq('id', l.lente_id);
      })
    );
  }

  if (!insertData.pagado && insertData.monto > 0) {
    const { data: admins } = await supabase
      .from('usuarios')
      .select('id')
      .eq('rol', 'admin')
      .eq('activo', true);

    const pacienteNombre = (await supabase
      .from('pacientes')
      .select('nombre_completo')
      .eq('id', data.paciente_id)
      .maybeSingle())?.data?.nombre_completo ?? 'un paciente';

    if (admins && admins.length > 0) {
      await supabase.from('notificaciones').insert(
        admins.map((admin) => ({
          user_id: admin.id,
          tipo: 'warning',
          titulo: 'Cobro pendiente',
          mensaje: `Cobro de $${insertData.monto} pendiente — ${pacienteNombre}`,
          entidad_tipo: 'cobro',
          entidad_id: cobro.id,
        }))
      );
    }
  }

  return NextResponse.json(cobro, { status: 201 });
}
