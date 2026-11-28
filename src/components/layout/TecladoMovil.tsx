'use client';

import { useEffect } from 'react';

const ES_CAMPO = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !['button', 'submit', 'checkbox', 'radio', 'file', 'range', 'color'].includes(el.type)) || (el as HTMLElement).isContentEditable);

/**
 * iOS (Safari y app instalada) deja las barras `position: fixed` (menú inferior, «Guardar») a media pantalla
 * cuando se cierra el teclado: se quedan a la altura que tenían con el teclado abierto.
 * Mientras el teclado está abierto se ocultan (`.ocultar-con-teclado`); al cerrarse se vuelven a pintar
 * y se da un empujón al scroll para que iOS recalcule su posición.
 */
export default function TecladoMovil() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const html = document.documentElement;
    let temporizador: number | undefined;

    const actualizar = () => {
      window.clearTimeout(temporizador);
      // Espera a que termine la animación del teclado antes de decidir.
      temporizador = window.setTimeout(() => {
        const abierto = ES_CAMPO(document.activeElement) && vv.height < window.innerHeight * 0.8;
        const estaba = html.dataset.teclado === 'abierto';
        if (abierto === estaba) return;
        if (abierto) {
          html.dataset.teclado = 'abierto';
        } else {
          delete html.dataset.teclado;
          const { scrollX, scrollY } = window;
          window.scrollTo(scrollX, scrollY + 1);
          requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
        }
      }, 120);
    };

    vv.addEventListener('resize', actualizar);
    window.addEventListener('focusin', actualizar);
    window.addEventListener('focusout', actualizar);
    return () => {
      window.clearTimeout(temporizador);
      vv.removeEventListener('resize', actualizar);
      window.removeEventListener('focusin', actualizar);
      window.removeEventListener('focusout', actualizar);
      delete html.dataset.teclado;
    };
  }, []);

  return null;
}
