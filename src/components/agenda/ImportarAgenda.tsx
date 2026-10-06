'use client';

import { Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { Doctor } from '@/components/agenda/agenda-comun';

/* ───────── Importación masiva (cirugías y consultas) ───────── */
export interface ImportResumen {
  total: number;
  aImportar: number;
  aplazadas?: number;
  duplicadas: number;
  conError: number;
  doctoresNuevos: string[];
  pacientesNuevos: number;
}

export interface ImportFilaPreview {
  fila: number;
  fecha: string | null;
  hora: string | null;
  paciente: string;
  doctor: string | null;
  estado?: string;
  paciente_nuevo: boolean;
  doctor_nuevo: boolean;
}

export interface ImportRechazo { fila: number; hoja?: string; motivo: string }

export interface ImportPreviewResp {
  resumen: ImportResumen;
  filas: ImportFilaPreview[];
  rechazos: ImportRechazo[];
  avisos?: string[];
  rechazosCsv: string | null;
  duplicadosCsv: string | null;
}

export interface ImportResultado {
  importadas: number;
  aplazadasImportadas?: number;
  omitidasDuplicadas: number;
  errores: number;
  doctoresCreados: number;
  pacientesCreados: number;
  rechazos: ImportRechazo[];
  avisos?: string[];
  rechazosCsv: string | null;
  duplicadosCsv: string | null;
}

/** Descarga un CSV (con BOM para que Excel respete los acentos). */
export function descargarCsv(nombre: string, contenido: string) {
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function BotonesCsv({ tipo, rechazosCsv, duplicadosCsv }: { tipo: 'cirugias' | 'consultas'; rechazosCsv: string | null; duplicadosCsv: string | null }) {
  if (!rechazosCsv && !duplicadosCsv) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {rechazosCsv && (
        <button
          onClick={() => descargarCsv(`${tipo}-no-importadas.csv`, rechazosCsv)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <Download className="h-3.5 w-3.5" /> Descargar CSV de no importadas (con motivo)
        </button>
      )}
      {duplicadosCsv && (
        <button
          onClick={() => descargarCsv(`${tipo}-duplicadas-omitidas.csv`, duplicadosCsv)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2"
        >
          <Download className="h-3.5 w-3.5" /> Descargar duplicadas omitidas
        </button>
      )}
    </div>
  );
}

export function ListaAvisos({ avisos }: { avisos?: string[] }) {
  if (!avisos || avisos.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      {avisos.map((a, i) => <p key={i}>{a}</p>)}
    </div>
  );
}

export function ListaRechazos({ rechazos }: { rechazos: ImportRechazo[] }) {
  if (rechazos.length === 0) return null;
  return (
    <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 divide-y divide-red-100 text-xs dark:border-red-500/30 dark:divide-red-500/20">
      {rechazos.slice(0, 30).map((r, i) => (
        <div key={i} className="px-3 py-1.5 text-fg-2">
          <b>{r.hoja && r.hoja !== 'CIRUGIA' && r.hoja !== 'CONSULTAS' ? `${r.hoja} · ` : ''}Fila {r.fila}:</b> {r.motivo}
        </div>
      ))}
      {rechazos.length > 30 && <p className="px-3 py-1.5 text-muted">… y {rechazos.length - 30} más en el CSV</p>}
    </div>
  );
}

export function ImportAgenda({
  tipo,
  titulo,
  descripcion,
  plantilla,
  onClose,
  onImported,
}: {
  tipo: 'cirugias' | 'consultas';
  titulo: string;
  descripcion: ReactNode;
  plantilla: { nombre: string; lineas: string[] };
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultado | null>(null);

  const enviar = async (confirmar: boolean) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', tipo);
      if (confirmar) fd.append('confirmar', 'true');
      const data = await enviarJSON<ImportResultado | ImportPreviewResp>('/api/agenda/import', 'POST', fd, { timeoutMs: 90_000 });
      if (confirmar) setResult(data as ImportResultado);
      else { setPreview(data as ImportPreviewResp); setStep('preview'); }
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'Error al importar'));
    } finally {
      setLoading(false);
    }
  };

  const etiqueta = tipo === 'cirugias' ? 'cirugías' : 'consultas';
  const r = preview?.resumen;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{titulo}</h3>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {step === 'upload' && !result && (
        <>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">{descripcion}</div>
          <button
            onClick={() => descargarCsv(plantilla.nombre, plantilla.lineas.join('\n'))}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
          >
            ⬇ Descargar plantilla CSV
          </button>
          <div className="border-2 border-dashed border-gray-300 dark:border-line rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted mb-3" />
            <input type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary-600 file:text-white hover:file:bg-primary-700" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => enviar(false)} disabled={!file || loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Revisando…' : 'Previsualizar'}</button>
          </div>
        </>
      )}

      {step === 'preview' && preview && r && !result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 dark:bg-emerald-500/10 dark:border-emerald-500/30"><p className="text-[10px] font-bold text-emerald-700 uppercase dark:text-emerald-300">Se agregarán</p><p className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-200">{r.aImportar}</p>{r.aplazadas ? <p className="text-[10px] text-emerald-700 dark:text-emerald-300">{r.aplazadas} aplazadas</p> : null}</div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 dark:bg-blue-500/10 dark:border-blue-500/30"><p className="text-[10px] font-bold text-blue-700 uppercase dark:text-blue-300">Ya existen</p><p className="text-2xl font-extrabold text-blue-800 dark:text-blue-200">{r.duplicadas}</p></div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 dark:bg-red-500/10 dark:border-red-500/30"><p className="text-[10px] font-bold text-red-700 uppercase dark:text-red-300">Con error</p><p className="text-2xl font-extrabold text-red-800 dark:text-red-200">{r.conError}</p></div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 dark:bg-amber-500/10 dark:border-amber-500/30"><p className="text-[10px] font-bold text-amber-700 uppercase dark:text-amber-300">Pacientes nuevos</p><p className="text-2xl font-extrabold text-amber-800 dark:text-amber-200">{r.pacientesNuevos}</p></div>
          </div>
          {r.doctoresNuevos.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Se darán de alta {r.doctoresNuevos.length} doctor(es): <b>{r.doctoresNuevos.join(', ')}</b>. Revisa que no sea otro nombre de un doctor existente.
            </div>
          )}
          {(r.pacientesNuevos > 0 || r.doctoresNuevos.length > 0) && (
            <p className="text-xs text-muted">Los pacientes y doctores nuevos quedarán marcados con «Completar información» para terminar su ficha.</p>
          )}
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line/70 text-xs">
            {preview.filas.map((f) => (
              <div key={f.fila} className="flex items-center gap-3 px-3 py-2">
                <span className="text-muted w-14 shrink-0">{f.fecha ? f.fecha.slice(5) : 'Sin fecha'}{f.hora ? ` ${f.hora.slice(0, 5)}` : ''}</span>
                <span className="font-medium text-fg truncate flex-1">
                  {f.paciente}
                  {f.paciente_nuevo && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">NUEVO</span>}
                </span>
                <span className="text-muted truncate w-32">
                  {f.doctor || '—'}
                  {f.doctor_nuevo && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">NUEVO</span>}
                </span>
                {f.estado && f.estado !== 'agendada' && <span className="text-[10px] font-bold uppercase text-muted w-16">{f.estado}</span>}
              </div>
            ))}
            {r.aImportar > preview.filas.length && <p className="text-center text-muted py-1.5">… y {r.aImportar - preview.filas.length} más</p>}
            {r.aImportar === 0 && <p className="text-center text-muted py-3">No hay {etiqueta} nuevas para agregar.</p>}
          </div>
          <ListaAvisos avisos={preview.avisos} />
          <ListaRechazos rechazos={preview.rechazos} />
          <BotonesCsv tipo={tipo} rechazosCsv={preview.rechazosCsv} duplicadosCsv={preview.duplicadosCsv} />
          <div className="flex justify-end gap-3">
            <button onClick={() => { setStep('upload'); setPreview(null); }} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-gray-50">Atrás</button>
            <button onClick={() => enviar(true)} disabled={loading || r.aImportar === 0} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Importando…' : `Agregar ${r.aImportar} ${etiqueta}`}</button>
          </div>
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Importación terminada</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-emerald-50 p-2 dark:bg-emerald-500/10"><span className="font-bold text-emerald-700 dark:text-emerald-300">{result.importadas}</span> {etiqueta} agregadas</div>
            {result.aplazadasImportadas !== undefined && <div className="rounded bg-yellow-50 p-2 dark:bg-yellow-500/10"><span className="font-bold text-yellow-700 dark:text-yellow-300">{result.aplazadasImportadas}</span> aplazadas</div>}
            <div className="rounded bg-blue-50 p-2 dark:bg-blue-500/10"><span className="font-bold text-blue-700 dark:text-blue-300">{result.omitidasDuplicadas}</span> ya existían (omitidas)</div>
            <div className="rounded bg-red-50 p-2 dark:bg-red-500/10"><span className="font-bold text-red-700 dark:text-red-300">{result.errores}</span> no se pudieron agregar</div>
            <div className="rounded bg-amber-50 p-2 dark:bg-amber-500/10"><span className="font-bold text-amber-700 dark:text-amber-300">{result.pacientesCreados}</span> pacientes nuevos</div>
            <div className="rounded bg-amber-50 p-2 dark:bg-amber-500/10"><span className="font-bold text-amber-700 dark:text-amber-300">{result.doctoresCreados}</span> doctores nuevos</div>
          </div>
          {(result.pacientesCreados > 0 || result.doctoresCreados > 0) && (
            <p className="text-xs text-muted">Complétalos en Pacientes y en Configuración → Personal médico (aparecen con «Completar información»).</p>
          )}
          <ListaAvisos avisos={result.avisos} />
          <ListaRechazos rechazos={result.rechazos} />
          <BotonesCsv tipo={tipo} rechazosCsv={result.rechazosCsv} duplicadosCsv={result.duplicadosCsv} />
          <div className="flex justify-end">
            <button onClick={onImported} className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-bold text-white hover:bg-primary-700">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ImportExcel({ onClose, onImported }: { doctores?: Doctor[]; onClose: () => void; onImported: () => void }) {
  return (
    <ImportAgenda
      tipo="cirugias"
      titulo="Importar Cirugías"
      descripcion={
        <>
          <p>Archivo .xlsx (hojas &quot;CIRUGIA&quot; y &quot;APLAZADOS&quot;) o .csv. Sin fecha → <b>aplazada</b>; &quot;SUSPENDIDO&quot; en notas → <b>cancelada</b>.</p>
          <p>Solo se agregan las que faltan: las que ya existen (mismo paciente, fecha y hora) se omiten. Pacientes y cirujanos que no existan se dan de alta.</p>
        </>
      }
      plantilla={{
        nombre: 'plantilla-cirugias.csv',
        lineas: [
          'FECHA,NOMBRE PX,No. Expediente,HORA CX,JORNADA,FECHA NAC.,SEXO,EDAD,DIAGNOSTICO,PROCEDIMIENTO,OJO,LIO,MARCA,OJO,LIO,MARCA,TIEMPO ESTIMADO CX,TIEMPO DE ESTANCIA,CIRUJANO,NOTAS',
          '2026-07-22,MARIA LOURDES RUIZ,776,06:00:00,TIJUANA,1969-09-20,F,56,RETINOPATIA DIABETICA,FACO-VITRECTOMIA,OI,23.00 CLAREON,,,,,2 HR,3 HR,BAYARDO/IRINA,',
          '2026-07-27,MARIA ELENA LOPEZ,799,07:00:00,ENSENADA,1965-08-18,F,60,CATARATA,FACO + LIO,OD,25.5,,,,,1 HR,,FELIX,',
        ],
      }}
      onClose={onClose}
      onImported={onImported}
    />
  );
}

export function ImportConsultas({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  return (
    <ImportAgenda
      tipo="consultas"
      titulo="Importar Consultas"
      descripcion={
        <>
          <p>Archivo .csv o .xlsx del registro de entradas y salidas. Las consultas nacen <b>Agendadas</b>.</p>
          <p>Solo se agregan las que faltan: las que ya existen (mismo paciente, fecha y hora) se omiten. Pacientes y doctores que no existan se dan de alta.</p>
        </>
      }
      plantilla={{
        nombre: 'plantilla-consultas.csv',
        lineas: [
          'FECHA,HORA DE INGRESO,HORA DE EGRESO,NUMERO DE TELEFONO ,DOCTOR,MEDICO IC,NOMBRE  DE PACIENTE ,SEXO ,FECHA DE NACIMIENTO,EDAD ,CONSULTA,DIAGNOSTICO ,TIPO DE CONSULTA,ESTUDIO 1,ESTUDIO2,ESTUDIO3,OPERADOR ,PROCEDIMIENTO ,ASEGURANZA,METODO DE PAGO , COSTO CONSULTA ,TIPO DE MONEDA ,',
          '"Tuesday, September 1, 2026",10:00AM,10:30AM,6611073755,DRA IRINA ,,Manuel Escobar Martinez,MASCULINO,1958-06-05,68,ESTUDIO,,PRIMERA VEZ ,Tomografia OCT Macular por ojo,,,,,TARJETA,5100,',
          '"Tuesday, September 1, 2026",11:30AM,12:00PM,6644388498,DRA IRINA ,,Carlos Gomez Jimenez,MASCULINO,1957-02-16,69,CONSULTA,CATARATA,PRIMERA VEZ ,,,,,,ISSSTECALI,EFECTIVO,800,',
        ],
      }}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
