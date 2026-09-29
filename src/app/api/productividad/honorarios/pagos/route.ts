import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { esquemaPaginacion, leerQuery } from '@/lib/api/validar';
import { inEnLotes, leerTodo } from '@/lib/productividad/lotes';
import { fechaReal, uuidOpcional, validarRango } from '@/lib/productividad/validacion';
import { z } from 'zod';
import { CSV_BOM, formatFechaCsv, rangoPersonalizado } from '@/lib/rangos';
import type { PagoHonorarioFila } from '@/types/productividad';

/** Tope del CSV (antes 1000: un historial mayor se truncaba en silencio). */
const MAX_CSV = 20000;

const querySchema = z.object({
  ...esquemaPaginacion(50, 100),
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  doctor_id: uuidOpcional,
  formato: z.string().max(10).optional(),
});

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

const COLUMNAS_PAGO =
  'id, doctor_id, origen_tipo, fecha_servicio, monto_devengado, estado, fecha_pago, pagado_por';

function consultaPagos(desde: string, hasta: string, doctorId: string | null, conteo: boolean) {
  let q = getSupabaseAdmin()
    .from('eventos_honorario')
    .select(COLUMNAS_PAGO, conteo ? { count: 'exact' } : undefined)
    .eq('estado', 'PAGADO')
    .not('fecha_pago', 'is', null)
    .gte('fecha_pago', desde)
    .lte('fecha_pago', hasta);
  if (doctorId) q = q.eq('doctor_id', doctorId);
  return q.order('fecha_pago', { ascending: false }).order('id', { ascending: true });
}

/** Página del listado (con total para el paginador). */
async function leerPagina(
  desde: string,
  hasta: string,
  doctorId: string | null,
  desdeFila: number,
  hastaFila: number
) {
  const { data, error, count } = await consultaPagos(desde, hasta, doctorId, true).range(desdeFila, hastaFila);
  if (error) {
    throw Object.assign(new Error('Error al leer historial de pagos'), { status: 500 });
  }
  return { rows: (data || []) as EventoPagoRow[], count: count || 0 };
}

/** CSV: todas las filas del rango, paginando en bloques de 1000 (sin `count`). */
async function leerTodoCsv(desde: string, hasta: string, doctorId: string | null) {
  try {
    const rows = await leerTodo<EventoPagoRow>(
      (a, b) => consultaPagos(desde, hasta, doctorId, false).range(a, b),
      MAX_CSV
    );
    return { rows, count: rows.length };
  } catch {
    throw Object.assign(new Error('Error al leer historial de pagos'), { status: 500 });
  }
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // requireRole ya no cuesta un viaje extra: se espera antes de leer.
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const { desde, hasta } = rangoPersonalizado(q.desde, q.hasta);
  const doctorId = q.doctor_id ?? null;
  const formato = (q.formato || 'json').toLowerCase();
  const { page, pageSize } = q;

  const rangoError = validarRango(desde, hasta);
  if (rangoError) return rangoError;

  try {
    const esCsv = formato === 'csv';
    const desdeFila = (page - 1) * pageSize;
    const supabase = getSupabaseAdmin();
    // Eventos y, en cuanto llegan, solo los doctores/usuarios que aparecen
    // (antes se leían hasta 500 doctores en cada request).
    const { rows, count } = esCsv
      ? await leerTodoCsv(desde, hasta, doctorId)
      : await leerPagina(desde, hasta, doctorId, desdeFila, desdeFila + pageSize - 1);
    const [doctoresRows, usuariosRows] = await Promise.all([
      inEnLotes<{ id: string; alias: string }>(
        rows.map((x) => x.doctor_id),
        (l) => supabase.from('doctores').select('id, alias').in('id', l)
      ).catch(() => []),
      inEnLotes<{ id: string; nombre: string | null }>(
        rows.map((x) => x.pagado_por),
        (l) => supabase.from('usuarios').select('id, nombre').in('id', l)
      ).catch(() => []),
    ]);
    const doctores = new Map(doctoresRows.map((d) => [d.id, d.alias]));
    const usuarios = new Map(usuariosRows.map((u) => [u.id, u.nombre || u.id]));

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
    const message = mensajeSeguro(err, 'productividad.honorarios.pagos', 'Error interno del servidor');
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
