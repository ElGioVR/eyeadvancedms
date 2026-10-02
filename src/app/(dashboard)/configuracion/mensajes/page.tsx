'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { MessageCircle, RotateCcw, Save, Stethoscope, Syringe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { enviarJSON } from '@/lib/fetcher';
import { URL_MENSAJES_PACIENTE } from '@/hooks/useMensajesPaciente';
import {
  VARIABLES_PLANTILLA,
  aplicarPlantilla,
  plantillaPorDefecto,
  type DatosCita,
  type PlantillasMensaje,
} from '@/lib/mensajes-paciente';

type Tipo = 'consulta' | 'cirugia';

const EJEMPLO: Record<Tipo, DatosCita> = {
  consulta: {
    tipo: 'consulta',
    paciente: 'María López',
    fecha: '2026-10-06',
    hora: '09:30',
    doctor: 'DR PILOTO',
    detalle: 'Primera vez · Retina',
    folio: 'CON-26-00123',
  },
  cirugia: {
    tipo: 'cirugia',
    paciente: 'María López',
    fecha: '2026-10-06',
    hora: '07:00',
    doctor: 'DR PILOTO',
    detalle: 'Facoemulsificación + LIO · OD',
    folio: 'CX-26-00045',
  },
};

const TABS: Array<{ id: Tipo; label: string; icon: typeof Stethoscope }> = [
  { id: 'consulta', label: 'Consultas y estudios', icon: Stethoscope },
  { id: 'cirugia', label: 'Cirugías', icon: Syringe },
];

export default function MensajesPage() {
  const { user } = useUser();
  const puedeEditar = user?.rol === 'admin';
  const { toast } = useToast();
  const { data, mutate, isLoading } = useSWR<{ valor: PlantillasMensaje }>(URL_MENSAJES_PACIENTE, {
    revalidateOnFocus: false,
  });

  const [tipo, setTipo] = useState<Tipo>('consulta');
  const [textos, setTextos] = useState<Record<Tipo, string>>({
    consulta: plantillaPorDefecto('consulta'),
    cirugia: plantillaPorDefecto('cirugia'),
  });
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Al llegar la configuración guardada, se carga en los editores (una sola vez).
  useEffect(() => {
    if (!data || cargado) return;
    setTextos({
      consulta: data.valor.consulta || plantillaPorDefecto('consulta'),
      cirugia: data.valor.cirugia || plantillaPorDefecto('cirugia'),
    });
    setCargado(true);
  }, [data, cargado]);

  const guardado = useMemo<Record<Tipo, string>>(() => ({
    consulta: data?.valor.consulta || plantillaPorDefecto('consulta'),
    cirugia: data?.valor.cirugia || plantillaPorDefecto('cirugia'),
  }), [data]);
  const hayCambios = textos.consulta !== guardado.consulta || textos.cirugia !== guardado.cirugia;
  const esPredeterminado = textos[tipo].trim() === plantillaPorDefecto(tipo).trim();

  const vistaPrevia = useMemo(() => aplicarPlantilla(textos[tipo], EJEMPLO[tipo]), [textos, tipo]);

  const insertarVariable = (clave: string) => {
    const area = areaRef.current;
    const token = `{${clave}}`;
    const actual = textos[tipo];
    const ini = area?.selectionStart ?? actual.length;
    const fin = area?.selectionEnd ?? actual.length;
    setTextos((prev) => ({ ...prev, [tipo]: actual.slice(0, ini) + token + actual.slice(fin) }));
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(ini + token.length, ini + token.length);
    });
  };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      // Si el texto es igual al predeterminado se guarda vacío: así futuros
      // ajustes al mensaje por defecto se aplican solos.
      const payload: PlantillasMensaje = {
        consulta: textos.consulta.trim() === plantillaPorDefecto('consulta').trim() ? null : textos.consulta,
        cirugia: textos.cirugia.trim() === plantillaPorDefecto('cirugia').trim() ? null : textos.cirugia,
      };
      const res = await enviarJSON<{ valor: PlantillasMensaje }>(URL_MENSAJES_PACIENTE, 'PUT', payload);
      await mutate({ valor: res.valor }, { revalidate: false });
      toast('Mensaje guardado');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar el mensaje', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
        <div className="flex flex-col gap-3 border-b border-line/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-fg">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> Mensaje al paciente
            </h3>
            <p className="mt-1 text-xs text-muted">
              Texto que se abre en WhatsApp (y en el cuerpo del correo) al usar los botones de la consulta, la cirugía o la agenda.
            </p>
          </div>
          {puedeEditar && (
            <button
              type="button"
              onClick={guardar}
              disabled={!hayCambios || guardando}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>

        <div className="px-6 pt-4">
          <div className="inline-flex rounded-lg border border-line bg-surface-2 p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const activo = tipo === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  aria-pressed={activo}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
                    activo ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-2">
          {/* Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="plantilla-mensaje" className="text-[11px] font-bold uppercase tracking-widest text-muted">
                Plantilla
              </label>
              {puedeEditar && !esPredeterminado && (
                <button
                  type="button"
                  onClick={() => setTextos((prev) => ({ ...prev, [tipo]: plantillaPorDefecto(tipo) }))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar predeterminado
                </button>
              )}
            </div>
            <textarea
              id="plantilla-mensaje"
              ref={areaRef}
              value={textos[tipo]}
              onChange={(e) => setTextos((prev) => ({ ...prev, [tipo]: e.target.value }))}
              readOnly={!puedeEditar}
              disabled={isLoading && !cargado}
              rows={16}
              maxLength={3000}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed text-fg focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 read-only:bg-surface-2 dark:bg-surface-2"
            />
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">
                Variables {puedeEditar && <span className="normal-case font-medium">(clic para insertar)</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES_PLANTILLA.map((v) => (
                  <button
                    key={v.clave}
                    type="button"
                    title={v.descripcion}
                    disabled={!puedeEditar}
                    onClick={() => insertarVariable(v.clave)}
                    className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] font-semibold text-fg-2 transition-colors hover:border-primary-400 hover:text-primary-700 disabled:cursor-default disabled:hover:border-line disabled:hover:text-fg-2 dark:hover:text-primary-300"
                  >
                    {`{${v.clave}}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Si una línea solo tiene variables sin dato (por ejemplo, la cita no tiene folio), esa línea no se envía.
              </p>
            </div>
          </div>

          {/* Vista previa */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Vista previa (datos de ejemplo)</p>
            <div className="rounded-xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
              <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed text-gray-900 shadow-sm dark:bg-[#005c4b] dark:text-gray-100">
                {vistaPrevia || <span className="italic opacity-60">(mensaje vacío)</span>}
              </div>
            </div>
            {!puedeEditar && (
              <p className="text-xs text-muted">Solo un administrador puede cambiar este mensaje.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
