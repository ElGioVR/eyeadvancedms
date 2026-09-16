import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor']);
  if (roleError) return roleError;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const formato = searchParams.get('formato') || 'json';

  const supabase = getSupabaseAdmin();

  const { data: liquidacion, error: e1 } = await supabase
    .from('liquidaciones_doctor')
    .select(`
      *,
      doctores:doctor_id (nombre_completo, especialidad, rfc, cuenta_bancaria, clabe),
      periodos_pago:periodo_id (codigo, fecha_desde, fecha_hasta)
    `)
    .eq('id', id)
    .maybeSingle();

  if (e1 || !liquidacion) {
    return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 });
  }

  const { data: eventos } = await supabase
    .from('eventos_honorario')
    .select(`
      fecha_servicio, origen_tipo, rol, monto_base, monto_devengado, moneda, notas,
      pacientes:paciente_id (nombre_completo)
    `)
    .eq('doctor_id', liquidacion.doctor_id)
    .eq('periodo_id', liquidacion.periodo_id)
    .eq('estado', 'LIQUIDADO')
    .order('fecha_servicio', { ascending: true });

  const { data: ajustes } = await supabase
    .from('ajustes_liquidacion')
    .select('tipo, concepto, monto, motivo')
    .eq('liquidacion_id', id)
    .order('created_at', { ascending: true });

  const doctor = liquidacion.doctores as Record<string, unknown>;
  const periodo = liquidacion.periodos_pago as Record<string, unknown>;

  const detalle = {
    doctor: {
      nombre: doctor?.nombre_completo || '',
      especialidad: doctor?.especialidad || '',
      rfc: doctor?.rfc || '',
      cuenta_bancaria: doctor?.cuenta_bancaria || '',
      clabe: doctor?.clabe || '',
    },
    periodo: {
      codigo: periodo?.codigo || '',
      fecha_desde: periodo?.fecha_desde || '',
      fecha_hasta: periodo?.fecha_hasta || '',
    },
    resumen: {
      total_devengado: liquidacion.total_devengado,
      total_ajustes: liquidacion.total_ajustes,
      total_retenciones: liquidacion.total_retenciones,
      neto_pagar: liquidacion.neto_pagar,
      moneda: liquidacion.moneda,
      estado: liquidacion.estado,
    },
    eventos: (eventos || []).map((ev) => ({
      fecha: ev.fecha_servicio,
      paciente: (ev.pacientes as unknown as Record<string, unknown>)?.nombre_completo || '',
      concepto: ev.origen_tipo,
      rol: ev.rol,
      monto_base: ev.monto_base,
      monto: ev.monto_devengado,
    })),
    ajustes: (ajustes || []).map((a) => ({
      tipo: a.tipo,
      concepto: a.concepto,
      monto: a.monto,
      motivo: a.motivo,
    })),
  };

  if (formato === 'excel') {
    const rows: string[][] = [
      ['LIQUIDACIÓN DE HONORARIOS'],
      [''],
      ['Doctor:', detalle.doctor.nombre],
      ['Especialidad:', detalle.doctor.especialidad],
      ['RFC:', detalle.doctor.rfc],
      ['Período:', `${detalle.periodo.codigo} (${detalle.periodo.fecha_desde} al ${detalle.periodo.fecha_hasta})`],
      [''],
      ['CONCEPTO', 'IMPORTE'],
      ['Total devengado', String(detalle.resumen.total_devengado)],
      ['Total ajustes', String(detalle.resumen.total_ajustes)],
      ['Total retenciones', String(detalle.resumen.total_retenciones)],
      ['Neto a pagar', String(detalle.resumen.neto_pagar)],
      [''],
      ['DETALLE DE SERVICIOS'],
      ['Fecha', 'Paciente', 'Concepto', 'Rol', 'Monto'],
      ...detalle.eventos.map((ev) => [ev.fecha, ev.paciente, ev.concepto, ev.rol, String(ev.monto)]),
    ];

    if (detalle.ajustes.length > 0) {
      rows.push([''], ['AJUSTES']);
      rows.push(['Tipo', 'Concepto', 'Monto', 'Motivo']);
      for (const aj of detalle.ajustes) {
        rows.push([aj.tipo, aj.concepto, String(aj.monto), aj.motivo || '']);
      }
    }

    const csv = rows.map((r) => r.join(',')).join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="liquidacion-${detalle.periodo.codigo}-${String(detalle.doctor.nombre).replace(/\s+/g, '_')}.csv"`,
      },
    });
  }

  return NextResponse.json(detalle);
}
