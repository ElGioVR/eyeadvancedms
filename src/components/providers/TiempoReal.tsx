'use client';

import { useEffect, useRef } from 'react';
import { useInvalidar } from '@/hooks/useFetch';
import { PREFIJOS_POR_TABLA, marcarTiempoReal } from '@/lib/tiempo-real';

/**
 * Escucha el canal privado `cambios-clinica` (Realtime Broadcast emitido por
 * triggers de la BD, migración de performance). Cada aviso trae solo
 * {tabla, op, id, fecha} — nunca datos del paciente — y dispara una
 * revalidación de las listas afectadas (agenda, consultas, dashboard…).
 *
 * Si la migración no está aplicada o Realtime falla, no pasa nada: la app
 * sigue con el polling de 30 s.
 */
export default function TiempoReal() {
  const invalidar = useInvalidar();
  const pendientes = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    let limpiar: (() => void) | undefined;

    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelado || !data.session) return;
        await supabase.realtime.setAuth(data.session.access_token);

        const canal = supabase
          .channel('cambios-clinica', { config: { private: true } })
          .on('broadcast', { event: 'cambio' }, ({ payload }) => {
            const tabla = (payload as { tabla?: string } | null)?.tabla;
            const prefijos = (tabla && PREFIJOS_POR_TABLA[tabla]) || [];
            prefijos.forEach((p) => pendientes.current.add(p));
            // Agrupa ráfagas (p. ej. una importación) en una sola revalidación.
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              const lista = Array.from(pendientes.current);
              pendientes.current.clear();
              if (lista.length) void invalidar(...lista);
            }, 600);
          })
          .subscribe((estado) => {
            marcarTiempoReal(estado === 'SUBSCRIBED');
          });

        // El token se renueva cada hora: Realtime necesita el nuevo.
        const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
          if (sesion?.access_token) void supabase.realtime.setAuth(sesion.access_token);
        });

        limpiar = () => {
          sub.subscription.unsubscribe();
          void supabase.removeChannel(canal);
        };
      } catch {
        marcarTiempoReal(false);
      }
    })();

    return () => {
      cancelado = true;
      clearTimeout(timer.current);
      marcarTiempoReal(false);
      limpiar?.();
    };
  }, [invalidar]);

  return null;
}
