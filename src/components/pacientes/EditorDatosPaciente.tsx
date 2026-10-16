'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import EditorTelefonos from '@/components/pacientes/EditorTelefonos';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { normalizarTelefonos, telefonoPrincipal, type TelefonoPaciente } from '@/lib/telefonos-paciente';
import type { PacienteAPI } from '@/components/consultations/nueva-consulta-comun';

/** Roles que pueden corregir los datos generales del paciente (PATCH /api/pacientes/[id]). */
export const ROLES_EDITAR_PACIENTE = ['admin', 'recepcionista', 'doctor'] as const;
export const puedeEditarPaciente = (rol: string | null | undefined) =>
  !!rol && (ROLES_EDITAR_PACIENTE as readonly string[]).includes(rol);

/** Datos generales que faltan (para avisar en la cirugía/consulta). */
export function faltantesDatosGenerales(p: Pick<PacienteAPI, 'sexo' | 'fecha_nacimiento' | 'edad' | 'telefono' | 'telefonos' | 'numero_expediente'>): string[] {
  const f: string[] = [];
  if (!p.numero_expediente) f.push('expediente');
  if (!p.sexo) f.push('sexo');
  if (!p.fecha_nacimiento && p.edad == null) f.push('fecha de nacimiento');
  if (!p.telefono && !(p.telefonos && p.telefonos.length)) f.push('teléfono');
  return f;
}

interface Props {
  paciente: PacienteAPI;
  inputCls: string;
  labelCls: string;
  onCancelar: () => void;
  /** Tras guardar: el padre revalida la ficha y actualiza el nombre mostrado. */
  onGuardado: (cambios: { nombre_completo: string; numero_expediente: string | null }) => void;
}

/**
 * Edición en línea de los datos generales del paciente (nombre, expediente, sexo, fecha de
 * nacimiento y teléfonos) sin salir de la cirugía. Documento «Agenda de cirugía» (16 oct 2026):
 * «si ya está agendado y quiero editar, no me deja modificar ningún campo de los datos generales».
 */
export default function EditorDatosPaciente({ paciente, inputCls, labelCls, onCancelar, onGuardado }: Props) {
  const telefonosIniciales: TelefonoPaciente[] = paciente.telefonos && paciente.telefonos.length
    ? paciente.telefonos
    : paciente.telefono ? [{ numero: paciente.telefono, etiqueta: 'Celular', principal: true } as TelefonoPaciente] : [];
  const [f, setF] = useState({
    nombre_completo: paciente.nombre_completo ?? paciente.nombre ?? '',
    numero_expediente: paciente.numero_expediente ?? '',
    sexo: paciente.sexo === 'M' || paciente.sexo === 'FEMENINO' ? 'M' : paciente.sexo === 'H' || paciente.sexo === 'MASCULINO' ? 'H' : '',
    fecha_nacimiento: (paciente.fecha_nacimiento ?? '').slice(0, 10),
    telefonos: telefonosIniciales,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const nombre = f.nombre_completo.trim();
    if (!nombre) { setError('El nombre es obligatorio'); return; }
    if (f.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha_nacimiento)) { setError('La fecha de nacimiento no es válida'); return; }
    const telefonos = normalizarTelefonos(f.telefonos);
    const payload: Record<string, unknown> = {
      nombre_completo: nombre,
      numero_expediente: f.numero_expediente.trim() || null,
      telefono: telefonoPrincipal(telefonos) ?? null,
      telefonos,
    };
    if (f.sexo) payload.sexo = f.sexo;
    if (f.fecha_nacimiento) payload.fecha_nacimiento = f.fecha_nacimiento;
    setGuardando(true);
    setError(null);
    try {
      await enviarJSON(`/api/pacientes/${encodeURIComponent(paciente.id)}`, 'PATCH', payload);
      onGuardado({ nombre_completo: nombre, numero_expediente: (payload.numero_expediente as string | null) ?? null });
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudieron guardar los datos del paciente'));
      setGuardando(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
      <div className="mb-3 text-sm font-bold text-fg">Datos generales del paciente</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edp-nombre" className={labelCls}>Nombre completo *</label>
          <input id="edp-nombre" value={f.nombre_completo} maxLength={255} onChange={(e) => setF({ ...f, nombre_completo: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label htmlFor="edp-expediente" className={labelCls}>Número de expediente</label>
          <input id="edp-expediente" value={f.numero_expediente} maxLength={50} onChange={(e) => setF({ ...f, numero_expediente: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label htmlFor="edp-sexo" className={labelCls}>Sexo</label>
          <select id="edp-sexo" value={f.sexo} onChange={(e) => setF({ ...f, sexo: e.target.value })} className={inputCls}>
            <option value="">Sin registrar</option>
            <option value="H">Hombre</option>
            <option value="M">Mujer</option>
          </select>
        </div>
        <div>
          <label htmlFor="edp-fnac" className={labelCls}>Fecha de nacimiento</label>
          <input id="edp-fnac" type="date" value={f.fecha_nacimiento} onChange={(e) => setF({ ...f, fecha_nacimiento: e.target.value })} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <span className={labelCls}>Teléfonos (hasta 3)</span>
          <EditorTelefonos value={f.telefonos} onChange={(lista) => setF({ ...f, telefonos: lista })} inputClassName={inputCls} />
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={guardando} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" onClick={() => void guardar()} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar datos del paciente
        </button>
      </div>
    </div>
  );
}
