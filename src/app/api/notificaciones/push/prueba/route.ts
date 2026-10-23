import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';
import { enviarPush, pushDisponible } from '@/services/push';

/** Envía una notificación de prueba a todos los dispositivos del usuario actual. */
async function manejarPOST() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!pushDisponible()) return NextResponse.json({ error: 'Las notificaciones push no están configuradas en el servidor' }, { status: 503 });

  const enviados = await enviarPush([
    {
      userId: auth.user.id,
      mensaje: {
        tipo: 'SISTEMA',
        titulo: 'Notificaciones activas',
        mensaje: 'Así se verán tus avisos de citas, cirugías y cambios de agenda. Toca para abrir tu agenda.',
        url: '/agenda',
        tag: 'prueba',
      },
    },
  ]);
  if (enviados === 0) {
    return NextResponse.json({ error: 'No hay dispositivos con notificaciones activas para tu usuario' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, enviados });
}

export const POST = ruta('notificaciones/push/prueba#POST', manejarPOST);
