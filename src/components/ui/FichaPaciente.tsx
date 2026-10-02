'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  edadLegible,
  fechaNacimientoLegible,
  hoyTijuana,
  resumenFicha,
  sexoLegible,
  type DatosFicha,
} from '@/lib/ficha-paciente';

interface Props extends DatosFicha {
  nombre?: string | null;
  /**
   * 'completa': bloque con un dato por línea · 'linea': todos los datos en una
   * línea (cabeceras) · 'compacta': expediente · sexo · edad (listas).
   */
  variante?: 'completa' | 'linea' | 'compacta';
  /** En 'completa', mostrar también el nombre (si la pantalla ya lo muestra, false). */
  conNombre?: boolean;
  className?: string;
}

/** Fecha de hoy solo en el cliente (evita diferencias de hidratación). */
function useHoy(): string | null {
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => setHoy(hoyTijuana()), []);
  return hoy;
}

/**
 * Datos personales del paciente junto a su nombre: expediente, sexo, fecha de
 * nacimiento y edad (años, meses y días). Los datos faltantes se omiten.
 */
export default function FichaPaciente({
  nombre,
  expediente,
  sexo,
  fechaNacimiento,
  edad,
  variante = 'completa',
  conNombre = true,
  className,
}: Props) {
  const hoy = useHoy();

  if (variante === 'compacta') {
    const texto = resumenFicha({ expediente, sexo, fechaNacimiento, edad }, hoy ?? '');
    if (!texto) return null;
    return <span className={cn('text-xs text-muted', className)}>{texto}</span>;
  }

  const sexoTxt = sexoLegible(sexo);
  const nacimiento = fechaNacimientoLegible(fechaNacimiento);
  const edadTxt = hoy ? edadLegible(fechaNacimiento, hoy) : null;
  const edadRespaldo = !fechaNacimiento && edad != null ? `${edad} ${edad === 1 ? 'año' : 'años'}` : null;

  if (variante === 'linea') {
    const datos = [
      expediente ? `Expediente ${expediente}` : 'Sin expediente',
      sexoTxt,
      nacimiento ? `Nació el ${nacimiento}` : null,
      edadTxt ? `${edadTxt} de edad` : edadRespaldo ? `${edadRespaldo} de edad` : null,
    ].filter(Boolean);
    return <p className={cn('text-sm text-muted', className)}>{datos.join(' · ')}</p>;
  }

  return (
    <div className={cn('space-y-0.5 text-sm text-muted', className)}>
      <p>{expediente ? <>Expediente <span className="font-semibold text-fg-2">{expediente}</span></> : 'Sin número de expediente'}</p>
      {sexoTxt && <p>{sexoTxt}</p>}
      {conNombre && nombre && <p className="text-base font-bold text-fg">{nombre}</p>}
      {nacimiento && <p>{nacimiento}</p>}
      {(edadTxt || edadRespaldo) && <p>{edadTxt ? `${edadTxt} de edad` : `${edadRespaldo} de edad`}</p>}
    </div>
  );
}
