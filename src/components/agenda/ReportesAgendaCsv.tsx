'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, FileDown, Scissors, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ModalRangoFechas, { type OpcionDoctor, type RangoFechas } from '@/components/productividad/ModalRangoFechas';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { descargarReporte, type FormatoDescarga } from '@/lib/exportar-reporte';

type ReporteAgenda = 'pacientes_atendidos' | 'cirugias' | 'entradas_salidas';

const REPORTES: Array<{ id: ReporteAgenda; label: string; icon: LucideIcon; titulo: string; descripcion: string; punto: string; roles: string[] }> = [
  {
    id: 'pacientes_atendidos',
    label: 'Pacientes atendidos',
    icon: Users,
    titulo: 'Reporte de pacientes atendidos',
    descripcion: 'Pacientes del periodo con diagnóstico, estudios y procedimientos, y el médico que los indicó y realizó.',
    punto: 'bg-emerald-200 border-l-emerald-500',
    roles: ['admin', 'recepcionista', 'doctor'],
  },
  {
    id: 'cirugias',
    label: 'Cirugías',
    icon: Scissors,
    titulo: 'Reporte de cirugías',
    descripcion: 'Cirugías de la agenda con paciente, LIO, tiempos y cirujano.',
    punto: 'bg-violet-200 border-l-violet-500',
    roles: ['admin'],
  },
  {
    id: 'entradas_salidas',
    label: 'Entradas y salidas',
    icon: ArrowLeftRight,
    titulo: 'Reporte de entradas y salidas',
    descripcion: 'Consultas del rango con ingreso, egreso y datos del paciente.',
    punto: 'bg-amber-200 border-l-amber-500',
    roles: ['admin'],
  },
];

interface Props {
  /** Rango propuesto al abrir (normalmente el mes visible en la agenda). */
  desde: string;
  hasta: string;
  doctores: OpcionDoctor[];
  /** Doctor filtrado en la agenda ('' = todos). */
  doctorId?: string;
  /** Clases del botón (la agenda usa estilos distintos en pantalla completa). */
  botonClassName?: string;
  /** Móvil: botón solo con ícono y menú alineado a la derecha. */
  soloIcono?: boolean;
  /** Rol del usuario: cada reporte indica qué roles lo ven. */
  rol: string;
}

/**
 * Botón «Reportes» de la agenda: descarga (CSV, Excel o PDF) los reportes de cirugías y de
 * entradas y salidas (los mismos endpoints que Productividad, solo admin).
 */
export default function ReportesAgendaCsv({ desde, hasta, doctores, doctorId = '', botonClassName, soloIcono = false, rol }: Props) {
  const { toast } = useToast();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modal, setModal] = useState<ReporteAgenda | null>(null);
  const [cargando, setCargando] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra el menú al hacer clic fuera.
  useEffect(() => {
    if (!menuAbierto) return;
    const fuera = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [menuAbierto]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cerrar = useCallback(() => {
    abortRef.current?.abort();
    setCargando(false);
    setModal(null);
  }, []);

  const descargar = useCallback(async (rango: RangoFechas, doctorSel?: string, formato: FormatoDescarga = 'csv') => {
    if (!modal) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCargando(true);
    try {
      const params = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta, formato: 'csv' });
      if (doctorSel) params.set('doctor_id', doctorSel);
      let url: string;
      let nombre: string;
      if (modal === 'pacientes_atendidos') {
        url = `/api/reportes/pacientes-atendidos?${params}`;
        nombre = `pacientes-atendidos-${rango.desde}_${rango.hasta}`;
      } else if (modal === 'cirugias') {
        url = `/api/productividad/reportes/cirugias?${params}`;
        nombre = `cirugias-${rango.desde}_${rango.hasta}`;
      } else {
        params.set('tab', 'entradas_salidas');
        url = `/api/productividad?${params}`;
        nombre = `entradas-salidas-${rango.desde}_${rango.hasta}`;
      }
      const res = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'No se pudo generar el reporte');
      }
      const csv = await res.text();
      const info = REPORTES.find((r) => r.id === modal);
      const doctor = doctorSel ? doctores.find((d) => d.id === doctorSel)?.nombre : null;
      await descargarReporte(csv, nombre, formato, info?.titulo || 'Reporte', `${rango.desde} a ${rango.hasta}${doctor ? ` · ${doctor}` : ''}`);
      setModal(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast(err instanceof Error ? err.message : 'Error al descargar el reporte', 'error');
    } finally {
      if (abortRef.current === controller) setCargando(false);
    }
  }, [modal, toast, doctores]);

  const info = REPORTES.find((r) => r.id === modal) || null;
  const visibles = REPORTES.filter((r) => r.roles.includes(rol));
  if (visibles.length === 0) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuAbierto((p) => !p)}
          aria-expanded={menuAbierto}
          aria-label="Reportes"
          title="Reportes"
          className={botonClassName || 'btn-secondary'}
        >
          {soloIcono ? <FileDown className="h-[18px] w-[18px]" /> : <><FileDown className="h-4 w-4" /> Reportes</>}
        </button>
        {menuAbierto && (
          <div className={cn('absolute top-full mt-2 z-50 w-60', soloIcono ? 'right-0' : 'left-0')}>
            <div className="relative rounded-2xl border border-line bg-surface shadow-xl p-1.5">
              <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Descargar reporte</p>
              {visibles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setMenuAbierto(false); setModal(r.id); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2 transition-colors text-left"
                >
                  <span className={cn('h-2 w-3 rounded-sm border-l-2', r.punto)} /> {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ModalRangoFechas
        isOpen={info !== null}
        onClose={cerrar}
        titulo={info?.titulo || 'Reporte'}
        descripcion={info?.descripcion}
        desde={desde}
        hasta={hasta}
        cargando={cargando}
        doctores={doctores}
        doctorId={doctorId}
        conFormato
        formatoInicial={modal === 'pacientes_atendidos' ? 'xlsx' : 'csv'}
        onConfirm={descargar}
      />
    </>
  );
}
