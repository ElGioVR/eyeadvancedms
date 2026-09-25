import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { CSV_BOM, formatFechaCsv, rangoPersonalizado } from '@/lib/rangos';
import { agregarMetricas, listarResumenHonorarios } from '@/lib/productividad';

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  if (/^[=+\-@\t\r\n]/.test(raw)) return `'${raw.replace(/"/g, '""')}`;
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
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

  if (desde > hasta) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [filas, doctoresRes] = await Promise.all([
      listarResumenHonorarios({ desde, hasta, doctor_id: doctorId || undefined }),
      supabase.from('doctores').select('id, alias').limit(500),
    ]);
    const nombres = new Map(
      (doctoresRes.data || []).map((d) => [d.id as string, d.alias as string])
    );
    const metricas = agregarMetricas(filas, nombres);
    const dur = (performance.now() - startedAt).toFixed(1);

    if (formato === 'csv') {
      const lines = [
        'DOCTOR,EVENTOS,MONTO,PAGADO,POR PAGAR',
        ...metricas.por_doctor.map((d) =>
          [
            csvCell(d.doctor_nombre),
            d.eventos,
            d.monto,
            d.pagado,
            d.por_pagar,
          ].join(',')
        ),
      ];
      const response = new NextResponse(CSV_BOM + lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="productividad-metricas-${desde}_${hasta}.csv"`,
          'Server-Timing': `productividad;dur=${dur}`,
        },
      });
      return response;
    }

    const response = NextResponse.json({
      rango: { desde, hasta },
      doctor_id: doctorId,
      generado: formatFechaCsv(desde) + ' – ' + formatFechaCsv(hasta),
      ...metricas,
    });
    response.headers.set('Server-Timing', `productividad;dur=${dur}`);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set(
      'Server-Timing',
      `productividad;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}
