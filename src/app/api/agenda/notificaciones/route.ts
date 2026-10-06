import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { procesarRecordatoriosCirugia } from '@/services/recordatorios';
import { ruta } from '@/lib/api/ruta';

export const dynamic = 'force-dynamic';

async function manejarGET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }

  // Comparación en tiempo constante (evita ataques de temporización sobre el secreto)
  const esperado = Buffer.from(`Bearer ${cronSecret}`);
  const recibido = Buffer.from(authHeader ?? '');
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const r = await procesarRecordatoriosCirugia();
    return NextResponse.json({ notificaciones: r.enviadas, revisadas: r.revisadas });
  } catch {
    return NextResponse.json({ error: 'Error al procesar recordatorios' }, { status: 500 });
  }
}

export const GET = ruta('agenda/notificaciones#GET', manejarGET);
