'use client';

import { createContext, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  consumirReinicioRuta,
  etiquetaRuta,
  guardarRuta,
  leerRuta,
  registrarPantalla,
  rutaSinQuery,
  type EntradaRuta,
} from '@/lib/navegacion/rutas';

const Ctx = createContext<EntradaRuta[]>([]);

function Registro({ onRuta }: { onRuta: (r: EntradaRuta[]) => void }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const href = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    if (!pathname) return;
    const siguiente = registrarPantalla(leerRuta(), { href, label: etiquetaRuta(pathname) }, consumirReinicioRuta());
    guardarRuta(siguiente);
    onRuta(siguiente);
  }, [href, pathname, onRuta]);

  return null;
}

/** Lleva la ruta recorrida (Pacientes › Agenda › Consulta › Nueva) para volver siempre al origen real. */
export function RutaNavegacionProvider({ children }: { children: React.ReactNode }) {
  const [ruta, setRuta] = useState<EntradaRuta[]>([]);
  return (
    <Ctx.Provider value={ruta}>
      <Suspense fallback={null}>
        <Registro onRuta={setRuta} />
      </Suspense>
      {children}
    </Ctx.Provider>
  );
}

/** Ruta completa, la última entrada es la pantalla actual. */
export function useRutaNavegacion(): EntradaRuta[] {
  return useContext(Ctx);
}

/**
 * Pantalla anterior de la ruta: a donde debe llevar «volver», «cancelar» y los cierres de formulario.
 * Sin ruta (enlace directo, recarga en frío) usa el destino por defecto de la pantalla.
 */
export function useVolver(porDefecto: { href: string; label: string }): { href: string; label: string; hayRuta: boolean } {
  const ruta = useContext(Ctx);
  const pathname = usePathname();
  return useMemo(() => {
    const aqui = rutaSinQuery(pathname ?? '');
    const previas = ruta.filter((e) => rutaSinQuery(e.href) !== aqui);
    const ultima = ruta.length && rutaSinQuery(ruta[ruta.length - 1].href) === aqui ? previas[previas.length - 1] : undefined;
    return ultima ? { href: ultima.href, label: ultima.label, hayRuta: true } : { ...porDefecto, hayRuta: false };
  }, [ruta, pathname, porDefecto.href, porDefecto.label]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Enlace «Volver a …» que respeta la ruta recorrida (origen real) y cae al destino por defecto. */
export function EnlaceVolver({
  porDefecto,
  className,
  icono,
}: {
  porDefecto: { href: string; label: string };
  className?: string;
  icono?: React.ReactNode;
}) {
  const v = useVolver(porDefecto);
  return (
    <Link href={v.href} className={className}>
      {icono}
      Volver a {v.label}
    </Link>
  );
}
