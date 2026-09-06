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
  Clock,
  CheckCircle,
  Download,
  Printer,
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

const consultas = [
  { id: 1, fecha: '12 Sep 2024', doctor: 'Dra. Irina', motivo: 'Control de Glaucoma', diagnostico: 'Glaucoma de ángulo abierto controlado', agudezaVisual: 'OD: 20/25 · OI: 20/20', presionIntraocular: 'OD: 14 mmHg · OI: 13 mmHg', fondoOjo: 'Nervio óptico estable, excavación 0.4', notas: 'Paciente estable. Mantener tratamiento actual. Control en 3 meses.', estado: 'Completada' },
  { id: 2, fecha: '14 Ago 2024', doctor: 'Dra. Irina', motivo: 'Consulta inicial - Dolor ocular', diagnostico: 'Sospecha de Glaucoma / Presbipopia inicial', agudezaVisual: 'OD: 20/30 · OI: 20/25', presionIntraocular: 'OD: 18 mmHg · OI: 17 mmHg', fondoOjo: 'Papila con relación esc/corona 0.5 OD', notas: 'Programar campimetría de Humphrey. Suspender gotas anteriores. Iniciar Latanoprost OD.', estado: 'Completada' },
  { id: 3, fecha: '05 Jul 2024', doctor: 'Dr. Sánchez', motivo: 'Actualización de graduación', diagnostico: 'Miopía estable', agudezaVisual: 'OD: 20/25 (c/c) · OI: 20/20 (c/c)', presionIntraocular: 'OD: 12 mmHg · OI: 12 mmHg', fondoOjo: 'Normal', notas: 'Graduación sin cambios. Paciente satisfecho con lentes actuales.', estado: 'Completada' },
  { id: 4, fecha: '20 Mar 2024', doctor: 'Dra. Martha', motivo: 'Seguimiento catarata', diagnostico: 'Catarata incipiente bilateral', agudezaVisual: 'OD: 20/30 · OI: 20/25', presionIntraocular: 'OD: 14 mmHg · OI: 13 mmHg', fondoOjo: 'Normal. Cristalino con opacidad cortical leve OD.', notas: 'Catarata incipiente. No requiere cirugía aún. Control anual.', estado: 'Completada' },
];

const procedimientos = [
  { id: 1, fecha: '14 Ago 2024', procedimiento: 'Campimetría de Humphrey', doctor: 'Dra. Irina', ojo: 'OD', resultado: 'Escotoma nasal superior compatible con glaucoma incipiente', notas: 'Patrón bitemporal inferior leve. Correlacionar con PIO.', estado: 'Completado' },
  { id: 2, fecha: '14 Ago 2024', procedimiento: 'Tonometría de aplastamiento', doctor: 'Dra. Irina', ojo: 'OD / OI', resultado: 'OD: 18 mmHg · OI: 17 mmHg', notas: 'Valores dentro de rango normal-alto.', estado: 'Completado' },
  { id: 3, fecha: '20 Mar 2024', procedimiento: 'Lampara de hendidura', doctor: 'Dra. Martha', ojo: 'OD / OI', resultado: 'Catarata cortical incipiente OD. OI sin cambios.', notas: 'Observación. No cirugía indicada.', estado: 'Completado' },
  { id: 4, fecha: '05 Jul 2024', procedimiento: 'Queratometría', doctor: 'Dr. Sánchez', ojo: 'OD / OI', resultado: 'OD: 43.50 / 44.25 · OI: 43.00 / 43.75', notas: 'Curvaturas normales. Sin astigmatismo significativo.', estado: 'Completado' },
];

const lentes = [
  { id: 1, fecha: '05 Jul 2024', tipo: 'Lente de Contacto', descripcion: 'Acuvue Oasys 1-Day con HydraLuxe', esferico: 'OD: -3.50 · OI: -2.75', cilindrico: 'OD: -0.75 eje 180° · OI: -0.50 eje 170°', material: 'Senofilcon A', proveedor: 'Johnson & Johnson', estado: 'Activo', proximoRenovacion: '05 Jul 2025' },
  { id: 2, fecha: '20 Mar 2024', tipo: 'Lente Oftálmico', descripcion: 'Zeiss SmartLife Progressive Individual 2', esferico: 'OD: -3.25 · OI: -2.50', cilindrico: 'OD: -0.75 eje 180° · OI: -0.50 eje 170°', material: 'Policarbonato con tratamiento Crizal Sapphire UV', proveedor: 'Zeiss', estado: 'Activo', proximoRenovacion: '20 Mar 2026' },
  { id: 3, fecha: '15 Ene 2024', tipo: 'Lente Oftálmico', descripcion: 'Essilor Varilux X Design', esferico: 'OD: -3.00 · OI: -2.25', cilindrico: 'OD: -0.50 eje 180° · OI: -0.50 eje 170°', material: 'Trivex con antirreflejante', proveedor: 'Essilor', estado: 'Reemplazado', proximoRenovacion: '—' },
];

const estudios = [
  { id: 1, fecha: '14 Ago 2024', estudio: 'Campimetría computarizada (Humphrey)', doctor: 'Dra. Irina', ojo: 'OD', resultado: 'Escotoma nasal superior compatible con daño glaucomatoso incipiente', archivo: 'campimetria_humphrey_OD.pdf', estado: 'Disponible' },
  { id: 2, fecha: '14 Ago 2024', estudio: 'Tomografía de coherencia óptica (OCT)', doctor: 'Dra. Irina', ojo: 'OD / OI', resultado: 'Espesor de capa de fibras nerviosas: OD 78μm (límite inferior) · OI 92μm (normal)', archivo: 'oct_nervio_optico.pdf', estado: 'Disponible' },
  { id: 3, fecha: '20 Mar 2024', estudio: 'Biometría ultrasónica', doctor: 'Dra. Martha', ojo: 'OD', resultado: 'Longitud axial: 23.8mm. Potencia cristalino: 21.5D. Catarata cortical incipiente.', archivo: 'biometria_OD.pdf', estado: 'Disponible' },
  { id: 4, fecha: '05 Jul 2024', estudio: 'Topografía corneal', doctor: 'Dr. Sánchez', ojo: 'OD / OI', resultado: 'Corneas regulares sin queratocono. SimK: OD 43.5/44.2 · OI 43.0/43.7', archivo: 'topografia_corneal.pdf', estado: 'Disponible' },
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 px-4 py-4 sm:px-6 sm:py-5">
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

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* ========== RESUMEN ========== */}
          {activeTab === 'Resumen' && (
            <>
              <div className="mb-4">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Línea de Tiempo - Visitas</h2>
              </div>
              <div className="space-y-4">
                {visitas.map((visita) => (
                  <div key={visita.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold text-primary-700">{visita.fecha}</span>
                        <span className={cn('inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ring-inset', visita.tipoColor)}>{visita.tipo}</span>
                      </div>
                      <button className="inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-800 transition-colors">Ver detalle <span className="text-xs">→</span></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-3 sm:px-6 sm:py-4">
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
            </>
          )}

          {/* ========== CONSULTAS ========== */}
          {activeTab === 'Consultas' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Historial de Consultas</h2>
                <span className="text-sm text-gray-400">{consultas.length} consultas</span>
              </div>
              <div className="space-y-4">
                {consultas.map((c) => (
                  <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold text-primary-700">{c.fecha}</span>
                        <span className="text-sm font-semibold text-gray-600">· {c.doctor}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle className="h-3 w-3" />{c.estado}
                      </span>
                    </div>
                    <div className="px-4 py-3 sm:px-6 sm:py-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Motivo</p>
                          <p className="text-sm font-bold text-gray-900">{c.motivo}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Diagnóstico</p>
                          <p className="text-sm font-bold text-gray-900">{c.diagnostico}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Agudeza Visual</p>
                          <p className="text-sm text-gray-700">{c.agudezaVisual}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Presión Intraocular</p>
                          <p className="text-sm text-gray-700">{c.presionIntraocular}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Fondo de Ojo</p>
                          <p className="text-sm text-gray-700">{c.fondoOjo}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Notas Clínicas</p>
                        <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3">{c.notas}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ========== PROCEDIMIENTOS ========== */}
          {activeTab === 'Procedimientos' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Procedimientos Realizados</h2>
                <span className="text-sm text-gray-400">{procedimientos.length} procedimientos</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Fecha</th>
                      <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Procedimiento</th>
                      <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Doctor</th>
                      <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Ojo</th>
                      <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Resultado</th>
                      <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {procedimientos.map((p) => (
                      <tr key={p.id} className="group hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold text-primary-700">{p.fecha}</td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold text-gray-900">{p.procedimiento}</td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{p.doctor}</td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4">
                          <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">{p.ojo}</span>
                        </td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm text-gray-600 max-w-xs">{p.resultado}</td>
                        <td className="px-4 py-3 sm:px-6 sm:py-4">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle className="h-3 w-3" />{p.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}

          {/* ========== LENTES ========== */}
          {activeTab === 'Lentes' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Historial de Lentes</h2>
                <span className="text-sm text-gray-400">{lentes.length} lentes</span>
              </div>
              <div className="space-y-4">
                {lentes.map((l) => (
                  <div key={l.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-3">
                        <Glasses className="h-4 w-4 text-primary-500" />
                        <span className="text-sm font-extrabold text-gray-900">{l.tipo}</span>
                        <span className="text-sm text-gray-400">· {l.descripcion}</span>
                      </div>
                      <span className={cn(
                        'inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ring-inset',
                        l.estado === 'Activo' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                      )}>
                        {l.estado}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 py-3 sm:px-6 sm:py-4">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Esférico</p>
                        <p className="text-sm font-bold text-gray-900">{l.esferico}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Cilíndrico / Eje</p>
                        <p className="text-sm font-bold text-gray-900">{l.cilindrico}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Material / Tratamiento</p>
                        <p className="text-sm text-gray-700">{l.material}</p>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-sm text-gray-500">
                        <span className="font-semibold">Proveedor:</span> {l.proveedor}
                      </div>
                      <div className="text-sm text-gray-500">
                        <span className="font-semibold">Próxima renovación:</span> {l.proximoRenovacion}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ========== ESTUDIOS ========== */}
          {activeTab === 'Estudios' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Estudios Diagnósticos</h2>
                <span className="text-sm text-gray-400">{estudios.length} estudios</span>
              </div>
              <div className="space-y-3">
                {estudios.map((e) => (
                  <div key={e.id} className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-sky-100">
                      <Eye className="h-5 w-5 text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-gray-900">{e.estudio}</h3>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">{e.doctor}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{e.ojo}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{e.resultado}</p>
                      <p className="text-xs text-gray-400 mt-1">{e.fecha}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle className="h-3 w-3" />{e.estado}
                      </span>
                      <div className="hidden sm:flex items-center gap-2">
                        <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[360px] shrink-0 space-y-5">
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

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">Alergias</h3>
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              {alergias.map((a, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200">
                  <AlertTriangle className="h-3 w-3" />{a}
                </span>
              ))}
            </div>
          </div>

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
