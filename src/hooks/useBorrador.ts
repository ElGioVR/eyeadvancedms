'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { borrarBorrador, guardarBorrador, leerBorrador, type Borrador } from '@/lib/borradores';

/**
 * Autoguardado de un formulario con oferta de recuperación.
 *
 * - Al montar, si hay un borrador vigente lo expone en `pendiente` (la
 *   pantalla pregunta «¿Recuperar?»). Mientras no se decida, NO se
 *   sobrescribe.
 * - Con `activo` y `datos` no nulos, guarda con retraso (debounce).
 * - `limpiar()` tras guardar con éxito; `descartar()` si el usuario no lo quiere.
 *
 * Todo ocurre en efectos (después del montaje): sin diferencias de hidratación.
 */
export function useBorrador<T>(clave: string, datos: T | null, { activo, retrasoMs = 1000 }: { activo: boolean; retrasoMs?: number }) {
  const [pendiente, setPendiente] = useState<Borrador<T> | null>(null);
  const [revisado, setRevisado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setPendiente(leerBorrador<T>(clave));
    setRevisado(true);
  }, [clave]);

  useEffect(() => {
    if (!revisado || pendiente || !activo || datos === null) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => guardarBorrador(clave, datos), retrasoMs);
    return () => clearTimeout(timer.current);
  }, [clave, datos, activo, pendiente, revisado, retrasoMs]);

  const descartar = useCallback(() => {
    borrarBorrador(clave);
    setPendiente(null);
  }, [clave]);

  /** El usuario aceptó recuperar: se deja de ofrecer y se sigue autoguardando. */
  const aceptar = useCallback(() => setPendiente(null), []);

  const limpiar = useCallback(() => {
    clearTimeout(timer.current);
    borrarBorrador(clave);
    setPendiente(null);
  }, [clave]);

  return { pendiente, descartar, aceptar, limpiar };
}
