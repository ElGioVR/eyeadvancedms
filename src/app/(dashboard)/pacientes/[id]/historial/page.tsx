'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Pill,
  Glasses,
  FlaskConical,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const historialTabs = [
  { label: 'Resumen', icon: FileText },
  { label: 'Consultas', icon: Calendar },
  { label: 'Procedimientos', icon: FlaskConical },
  { label: 'Lentes', icon: Glasses },
  { label: 'Estudios', icon: Eye },
];

const visitas = [
  {
    id: 1,
    fecha: '12 Sep 2024',
    tipo: 'SUBSECUENTE',
    tipoColor: 'bg-sky-50 text-sky-700 ring-sky-200',
    medico: 'Dra. Irina',
    especialidad: 'Oftalmología Pediátrica',
    diagnostico: 'Glaucoma de ángulo abierto controlado',
    tratamiento: 'Presión intraocular estable 14mmHg. Gotas Latano.',
    costo: '$1,200 MXN',
    cobertura: 'Particular',
  },
  {
    id: 2,
    fecha: '14 Ago 2024',
    tipo: 'PRIMERA VEZ',
    tipoColor: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    medico: 'Dra. Irina',
    especialidad: 'Oftalmología Pediátrica',
    diagnostico: 'Sospecha de Glaucoma / Presbipopia inicial',
    tratamiento: 'Campimetría de Humphrey programada.',
    costo: '$1,800 MXN',
    cobertura: 'Seguros Monterrey',
  },
  {
    id: 3,
    fecha: '05 Jul 2024',
    tipo: 'SEGUIMIENTO',
    tipoColor: 'bg-amber-50 text-amber-700 ring-amber-200',
    medico: 'Dr. Sánchez',
    especialidad: 'Oftalmología General',
    diagnostico: 'Miopía estable',
    tratamiento: 'Graduación sin cambios. Se mantiene tratamiento actual.',
    costo: '$800 MXN',
    cobertura: 'GNP',
  },
  {
    id: 4,
    fecha: '20 Mar 2024',
    tipo: 'SEGUIMIENTO',
    tipoColor: 'bg-amber-50 text-amber-700 ring-amber-200',
    medico: 'Dra. Martha',
    especialidad: 'Cataratas y Cirugía',
    diagnostico: 'Catarata incipiente bilateral',
    tratamiento: 'Observación. Control en 6 meses.',
    costo: '$600 MXN',
    cobertura: 'AXA',
  },
];

const diagnosticos = [
  { nombre: 'Glaucoma primario de ángulo abierto', detalle: 'Ojo Derecho · Tratamiento con gotas diarias', color: 'bg-red-100 text-red-700 ring-red-200' },
  { nombre: 'Catarata bilateral senil incipiente', detalle: 'Ambos Ojos · En observación anual', color: 'bg-red-100 text-red-700 ring-red-200' },
];

const alergias = ['Sulfas', 'Preservativos (Cloruro de benzalconio)', 'Polen'];

const medicamentos = [
  { nombre: 'Latanoprost 0.005% gotas', instruccion: '1 gota en Ojo Derecho antes de dormir' },
  { nombre: 'Lágrimas artificiales sin preservante', instruccion: 'Cada 4 horas o en caso de resequedad severa' },
];

export default function HistorialMedicoPage() {
  const [activeTab, setActiveTab] = useState('Resumen');

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            HISTORIAL MÉDICO - María García López
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">
            Consulta, diagnósticos y tratamientos detallados del paciente.
          </p>
        </div>
      </div>

      {/* Patient info card */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-6 px-6 py-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-purple-500 text-xl font-bold text-white">
            MG
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900">María García López</h2>
            <p className="text-sm text-gray-400 mt-0.5">Femenino · 45 años · ID: #PA-30492</p>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Teléfono</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">664-987-1234</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Correo Electrónico</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">maria.garcia@gmail.com</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Visitas Totales</p>
              <p className="text-sm font-bold text-primary-600 mt-0.5">12 visitas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {historialTabs.map((tab) => {
            const isActive = activeTab === tab.label;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={cn(
                  'inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Línea de tiempo */}
          <div className="mb-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
              Línea de Tiempo - Visitas
            </h2>
          </div>

          <div className="space-y-4">
            {visitas.map((visita) => (
              <div
                key={visita.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-primary-700">{visita.fecha}</span>
                    <span className={cn('inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ring-inset', visita.tipoColor)}>
                      {visita.tipo}
                    </span>
                  </div>
                  <button className="inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-800 transition-colors">
                    Ver detalle
                    <span className="text-xs">→</span>
                  </button>
                </div>

                {/* Content */}
                <div className="grid grid-cols-4 gap-4 px-6 py-4">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Médico Especialista</p>
                    <p className="text-sm font-bold text-gray-900">{visita.medico}</p>
                    <p className="text-xs text-gray-400">({visita.especialidad})</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Diagnóstico</p>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{visita.diagnostico}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Tratamiento / Estudios</p>
                    <p className="text-sm text-gray-600 leading-snug">{visita.tratamiento}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Costo y Cobertura</p>
                    <p className="text-sm font-bold text-gray-900">{visita.costo}</p>
                    <p className="text-xs text-gray-400">· {visita.cobertura}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-[360px] shrink-0 space-y-5">
          {/* Diagnósticos activos */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Diagnósticos Activos</h3>
            </div>
            <div className="p-4 space-y-2">
              {diagnosticos.map((d, idx) => (
                <div key={idx} className={cn('rounded-lg p-3 ring-1 ring-inset', d.color)}>
                  <p className="text-sm font-bold leading-snug">{d.nombre}</p>
                  <p className="text-xs opacity-75 mt-0.5">{d.detalle}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Alergias */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Alergias</h3>
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              {alergias.map((a, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Medicamentos */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Medicamentos Actuales</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {medicamentos.map((m, idx) => (
                <div key={idx} className="px-5 py-3">
                  <div className="flex items-start gap-2">
                    <Pill className="h-4 w-4 text-primary-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">{m.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.instruccion}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
