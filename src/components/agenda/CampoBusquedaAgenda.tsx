'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Campo de búsqueda con estado propio: escribir NO re-renderiza todo el
 * calendario en cada tecla (antes cada letra repintaba la agenda completa).
 * Avisa al padre con debounce (300 ms) el texto ya recortado.
 */
function CampoBusquedaAgenda({
  valor,
  onCambiar,
  placeholder,
  className,
  inputClassName,
  iconClassName,
}: {
  valor: string;
  onCambiar: (q: string) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
}) {
  const [texto, setTexto] = useState(valor);
  const ultimoEnviado = useRef(valor);

  // Cambio externo (p. ej. «Limpiar filtros»): sincroniza el campo.
  useEffect(() => {
    if (valor !== ultimoEnviado.current) {
      ultimoEnviado.current = valor;
      setTexto(valor);
    }
  }, [valor]);

  useEffect(() => {
    const q = texto.trim();
    if (q === ultimoEnviado.current) return;
    const t = window.setTimeout(() => {
      ultimoEnviado.current = q;
      onCambiar(q);
    }, 300);
    return () => window.clearTimeout(t);
  }, [texto, onCambiar]);

  return (
    <div className={className ?? 'relative'}>
      <Search className={iconClassName} aria-hidden />
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={inputClassName}
      />
    </div>
  );
}

export default memo(CampoBusquedaAgenda);
