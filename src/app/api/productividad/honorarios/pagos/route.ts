import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { CSV_BOM, formatFechaCsv, rangoPersonalizado } from '@/lib/rangos';
import type { PagoHonorarioFila } from '@/types/productividad';

const MAX_CSV = 1000;

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  if (/^[=+\-@\t\r\n]/.test(raw)) return `'${raw.replace(/"/g, '""')}`;
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

type EventoPagoRow = {
  id: string;
  doctor_id: string;
  origen_tipo: string;
  fecha_servicio: string;
  monto_devengado: number;
  estado: string;
  fecha_pago: string | null;
  pagado_por: string | null;
};

async function leerEventos(
  desde: string,
  hasta: string,
  doctorId: string | null,
  desdeFila: number,
  hastaFila: number
) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('eventos_honorario')
    .select(
      'id, doctor_id, origen_tipo, fecha_servicio, monto_devengado, estado, fecha_pago, pagado_por',
      { count: 'exact' }
    )
    .eq('estado', 'PAGADO')
    .not('fecha_pago', 'is', null)
    .gte('fecha_pago', desde)
    .lte('fecha_pago', hasta)
    .order('fecha_pago', { ascending: false })
    .range(desdeFila, hastaFila);
  if (doctorId) q = q.eq('doctor_id', doctorId);
  const { data, error, count } = await q;
  if (error) {
    throw Object.assign(new Error('Error al leer historial de pagos'), { status: 500 });
  }
  return { rows: (data || []) as EventoPagoRow[], count: count || 0 };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const { desde, hasta } = rangoPersonalizado(
    searchParams.get('desde'),
    searchParams.get('hasta')
  );
  const doctorId = searchParams.get('doctor_id');
  const formato = (searchParams.get('formato') || 'json').toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));

  if (desde > hasta) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  try {
    const esCsv = formato === 'csv';
    const desdeFila = esCsv ? 0 : (page - 1) * pageSize;
    const hastaFila = esCsv ? MAX_CSV - 1 : desdeFila + pageSize - 1;
    const { rows, count } = await leerEventos(desde, hasta, doctorId, desdeFila, hastaFila);

    const userIds = [
      ...new Set(rows.map((r) => r.pagado_por).filter((v): v is string => Boolean(v))),
    ];
    const supabase = getSupabaseAdmin();
    const [doctoresRes, usuariosRes] = await Promise.all([
      supabase.from('doctores').select('id, alias').limit(500),
      userIds.length
        ? supabase.from('usuarios').select('id, nombre').in('id', userIds)
        : Promise.resolve({ data: [] as Array<{ id: string; nombre: string | null }> }),
    ]);
    const doctores = new Map(
      (doctoresRes.data || []).map((d) => [d.id as string, d.alias as string])
    );
    const usuarios = new Map(
      (usuariosRes.data || []).map((u) => [u.id as string, u.nombre || u.id])
    );

    const items: PagoHonorarioFila[] = rows.map((r) => ({
      id: r.id,
      fecha_pago: r.fecha_pago,
      fecha_servicio: r.fecha_servicio,
      doctor_id: r.doctor_id,
      doctor_nombre: doctores.get(r.doctor_id) || '—',
      fuente: r.origen_tipo === 'OPERACION' ? 'CIRUGIA' : r.origen_tipo,
      monto: Number(r.monto_devengado) || 0,
      pagado_por_nombre: r.pagado_por ? usuarios.get(r.pagado_por) || null : null,
      estado: r.estado,
    }));

    const dur = (performance.now() - startedAt).toFixed(1);

    if (esCsv) {
      const lines = [
        'FECHA PAGO,DOCTOR,FECHA SERVICIO,FUENTE,MONTO,PAGADO POR,ESTATUS',
        ...items.map((p) =>
          [
            p.fecha_pago ? formatFechaCsv(p.fecha_pago) : '',
            csvCell(p.doctor_nombre),
            p.fecha_servicio ? formatFechaCsv(p.fecha_servicio) : '',
            csvCell(p.fuente),
            p.monto,
            csvCell(p.pagado_por_nombre || ''),
            csvCell(p.estado),
          ].join(',')
        ),
      ];
      return new NextResponse(CSV_BOM + lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="historial-pagos-${desde}_${hasta}.csv"`,
          'Server-Timing': `productividad;dur=${dur}`,
        },
      });
    }

    const response = NextResponse.json({
      rango: { desde, hasta },
      doctor_id: doctorId,
      items,
      total: count,
      page,
      pageSize,
      total_monto: items.reduce((s, p) => s + p.monto, 0),
    });
    response.headers.set('Server-Timing', `productividad;dur=${dur}`);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set(
      'Server-Timing',
      `productividad;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}
