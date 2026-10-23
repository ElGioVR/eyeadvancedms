'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import {
  activarPush, cambiarModoDiscreto, desactivarPush, enviarPrueba, esAppInstalada, esIOS, estadoPush,
  type EstadoPush,
} from '@/lib/push-cliente';
import { useToast } from '@/components/ui/Toast';

function Interruptor({ activo, onClick, etiqueta, deshabilitado }: { activo: boolean; onClick: () => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${activo ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** Notificaciones push de ESTE dispositivo (Mi perfil). Vacío hasta el montaje. */
export default function PushDispositivo() {
  const { toast } = useToast();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [discreta, setDiscreta] = useState(false);
  const [iosSinInstalar, setIosSinInstalar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await estadoPush().catch(() => ({ estado: 'no_soportado' as EstadoPush, discreta: false }));
    setEstado(r.estado);
    setDiscreta(r.discreta);
  }, []);

  useEffect(() => {
    setIosSinInstalar(esIOS() && !esAppInstalada());
    void cargar();
  }, [cargar]);

  const conOcupado = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try {
      await fn();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo completar', 'error');
    } finally {
      setOcupado(false);
    }
  };

  const alternar = () =>
    conOcupado(async () => {
      if (estado === 'activo') {
        await desactivarPush();
        toast('Notificaciones desactivadas en este dispositivo', 'success');
      } else {
        const r = await activarPush();
        if (r === 'activo') toast('Notificaciones activadas en este dispositivo', 'success');
        else if (r === 'bloqueado') toast('El permiso está bloqueado en el navegador', 'error');
      }
      await cargar();
    });

  const alternarDiscreta = () =>
    conOcupado(async () => {
      await cambiarModoDiscreto(!discreta);
      setDiscreta(!discreta);
    });

  const prueba = () =>
    conOcupado(async () => {
      await enviarPrueba();
      toast('Notificación de prueba enviada', 'success');
    });

  if (estado === null) {
    return (
      <div className="flex items-center gap-2 px-5 py-3.5 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando este dispositivo…
      </div>
    );
  }

  let aviso: string | null = null;
  if (estado === 'no_soportado') {
    aviso = iosSinInstalar
      ? 'En iPhone: abre esta página en Safari, toca Compartir → «Agregar a pantalla de inicio» y activa las notificaciones desde la app instalada (iOS 16.4 o más reciente).'
      : 'Este navegador no admite notificaciones push.';
  } else if (estado === 'bloqueado') {
    aviso = 'Las notificaciones están bloqueadas para este sitio. Habilítalas en los ajustes del navegador o del celular y vuelve a esta pantalla.';
  } else if (estado === 'sin_configurar') {
    aviso = 'Las notificaciones push aún no están configuradas en el servidor.';
  }

  const activo = estado === 'activo';

  return (
    <div className="divide-y divide-line/60">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">Notificaciones en este dispositivo</p>
            <p className="text-xs text-muted">
              {aviso ?? (activo ? 'Te llegan como alerta del celular, aunque la app esté cerrada.' : 'Desactivadas en este dispositivo.')}
            </p>
          </div>
        </div>
        {!aviso && <Interruptor activo={activo} onClick={alternar} etiqueta="Notificaciones en este dispositivo" deshabilitado={ocupado} />}
      </div>
      {activo && (
        <>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">Ocultar datos del paciente</p>
              <p className="text-xs text-muted">En la pantalla de bloqueo solo se indica el tipo de aviso.</p>
            </div>
            <Interruptor activo={discreta} onClick={alternarDiscreta} etiqueta="Ocultar datos del paciente" deshabilitado={ocupado} />
          </div>
          <div className="px-5 py-3">
            <button
              type="button"
              onClick={prueba}
              disabled={ocupado}
              className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              Enviar notificación de prueba
            </button>
          </div>
        </>
      )}
    </div>
  );
}
