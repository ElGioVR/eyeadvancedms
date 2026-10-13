'use client';

import { useEffect, useState } from 'react';

export interface FilaHoja {
  label: string;
  value?: string | number | null;
  /** Ocupa todo el ancho (textos largos: diagnóstico, notas…). */
  full?: boolean;
}

export interface SeccionHoja {
  titulo: string;
  filas: FilaHoja[];
}

interface Props {
  /** Título del documento, p. ej. «Consulta médica». */
  documento: string;
  folio?: string | null;
  estado?: string | null;
  /** Datos del paciente (se muestran en un recuadro bajo el membrete). */
  paciente: FilaHoja[];
  secciones: SeccionHoja[];
  /** Nombres que firman al pie (doctor, cirujano…). */
  firmas?: { nombre: string; rol: string }[];
  /** Si se indica, deja renglones en blanco bajo este título (indicaciones a mano). */
  espacioManuscrito?: { titulo: string; renglones?: number };
}

/** «FEMENINO» → «Femenino» (los datos en mayúsculas sostenidas se ven pesados en papel). */
const formato = (v: FilaHoja['value']) => {
  const t = String(v);
  return t.length > 3 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t) && !/\d/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};
const tiene = (v: FilaHoja['value']) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '—';

/**
 * Hoja membretada para imprimir. En pantalla está oculta; al imprimir sustituye al contenido
 * de la página (ver `@media print` en globals.css). Solo muestra los datos que existen.
 */
export default function HojaMembretada({ documento, folio, estado, paciente, secciones, firmas = [], espacioManuscrito }: Props) {
  const [emitido, setEmitido] = useState('');
  useEffect(() => {
    setEmitido(new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }));
  }, []);

  const pacienteVisible = paciente.filter((f) => tiene(f.value));

  return (
    <div className="hoja-impresion" aria-hidden="true">
      <header className="hoja-membrete">
        <div className="hoja-marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/eyeadvanced-logo.png" alt="" className="hoja-logo" />
        </div>
        <div className="hoja-doc">
          <p className="hoja-doc-titulo">{documento}</p>
          {folio && <p className="hoja-doc-folio">{folio}</p>}
          {estado && <p className="hoja-doc-estado">{estado}</p>}
        </div>
      </header>

      {pacienteVisible.length > 0 && (
        <section className="hoja-paciente">
          <p className="hoja-etiqueta-seccion">Paciente</p>
          <div className="hoja-grid">
            {pacienteVisible.map((f) => (
              <div key={f.label} className={f.full ? 'hoja-full' : undefined}>
                <span className="hoja-label">{f.label}</span>
                <span className="hoja-valor hoja-valor-fuerte">{formato(f.value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {secciones.map((sec) => {
        const filas = sec.filas.filter((f) => tiene(f.value));
        if (!filas.length) return null;
        return (
          <section key={sec.titulo} className="hoja-seccion">
            <h2 className="hoja-titulo-seccion">{sec.titulo}</h2>
            <div className="hoja-grid">
              {filas.map((f) => (
                <div key={f.label} className={f.full ? 'hoja-full' : undefined}>
                  <span className="hoja-label">{f.label}</span>
                  <span className="hoja-valor">{formato(f.value)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {espacioManuscrito && (
        <section className="hoja-seccion">
          <h2 className="hoja-titulo-seccion">{espacioManuscrito.titulo}</h2>
          <div className="hoja-renglones">
            {Array.from({ length: espacioManuscrito.renglones ?? 7 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
        </section>
      )}

      {firmas.length > 0 && (
        <div className="hoja-firmas">
          {firmas.map((f) => (
            <div key={`${f.rol}-${f.nombre}`} className="hoja-firma">
              <span className="hoja-firma-linea" />
              <span className="hoja-firma-nombre">{f.nombre}</span>
              <span className="hoja-firma-rol">{f.rol}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="hoja-pie">
        <span>EyeAdvanced · Medical Solutions</span>
        <span>{[documento, folio].filter(Boolean).join(' ')}{emitido ? ` · Emitido el ${emitido}` : ''}</span>
      </footer>
    </div>
  );
}
