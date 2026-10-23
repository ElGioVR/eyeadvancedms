'use client';

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { activarPush, estadoPush, sincronizarPush, soportaPush } from '@/lib/push-cliente';
import { useToast } from '@/components/ui/Toast';

const CLAVE_POSPUESTO = 'ea-push-pospuesto';
const DIAS_POSPUESTO = 3;

/**
 * Notificaciones en el dispositivo activadas por defecto:
 * - Si ya hay permiso, registra este dispositivo en silencio (p. ej. tras iniciar sesión).
 * - Si aún no se ha pedido, muestra la invitación (el navegador exige un toque para
 *   pedir el permiso). "Ahora no" la oculta unos días; se desactivan en Mi perfil.
 * Se renderiza vacío hasta el montaje (sin diferencias de hidratación).
 */
export default function ActivarPush() {
  const { toast } = useToast();
  const [mostrar, setMostrar] = useState(false);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    if (!soportaPush()) return;
    let cancelado = false;
    if (Notification.permission === 'granted') {
      void sincronizarPush();
      return;
    }
    if (Notification.permission !== 'default') return;
    try {
      const pospuesto = Number(localStorage.getItem(CLAVE_POSPUESTO) || 0);
      if (pospuesto && Date.now() - pospuesto < DIAS_POSPUESTO * 86_400_000) return;
    } catch {
      // sin almacenamiento: se muestra
    }
    // Solo si el servidor tiene push configurado.
    estadoPush()
      .then(({ estado }) => {
        if (!cancelado && estado === 'pendiente') setMostrar(true);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  const posponer = () => {
    setMostrar(false);
    try {
      localStorage.setItem(CLAVE_POSPUESTO, String(Date.now()));
    } catch {
      // ignorar
    }
  };

  const activar = async () => {
    setActivando(true);
    try {
      const estado = await activarPush();
      if (estado === 'activo') {
        toast('Notificaciones activadas en este dispositivo', 'success');
        setMostrar(false);
      } else if (estado === 'bloqueado') {
        toast('El permiso quedó bloqueado. Puedes habilitarlo en los ajustes del navegador.', 'error');
        setMostrar(false);
      } else if (estado === 'pendiente') {
        posponer();
      } else {
        toast('Este dispositivo no admite notificaciones', 'error');
        setMostrar(false);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudieron activar las notificaciones', 'error');
    } finally {
      setActivando(false);
    }
  };

  if (!mostrar) return null;

  return (
    <div className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 animate-slideUp" role="dialog" aria-label="Activar notificaciones">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10">
            <BellRing className="h-5 w-5 text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-fg">Activa las notificaciones</p>
            <p className="text-xs text-muted mt-0.5">
              Recibe en este dispositivo tus próximas citas, las cirugías y consultas que te asignen y los cambios de agenda.
            </p>
          </div>
          <button onClick={posponer} aria-label="Cerrar" className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={posponer} className="flex-1 rounded-xl border border-line px-3 py-2.5 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors">
            Ahora no
          </button>
          <button
            onClick={activar}
            disabled={activando}
            className="flex-1 rounded-xl bg-primary-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-60"
          >
            {activando ? 'Activando…' : 'Activar'}
          </button>
        </div>
      </div>
    </div>
  );
}
