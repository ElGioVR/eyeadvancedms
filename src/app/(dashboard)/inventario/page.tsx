'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Plus,
  Package,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Camera,
  X,
  History,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Minus,
  PlusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const lentesData = [
  {
    id: 'LIO-001', nombre: 'AcrySof IQ', modelo: 'SN60WF', categoria: 'Lente Intraocular (LIO)',
    esferico: '+21.00', cilindrico: '-2.00', eje: '90°', material: 'Acrílico hidrofóbico',
    proveedor: 'Alcon México', caducidad: '12/2028', costo: '$18,500 MXN', stock: 12, minimo: 5,
    estado: 'Disponible', color: 'bg-primary-500',
  },
  {
    id: 'LIO-002', nombre: 'Tecnis 1-Piece', modelo: 'ZCB00', categoria: 'Lente Intraocular (LIO)',
    esferico: '+19.50', cilindrico: '0.00', eje: '0°', material: 'Acrílico hidrofílico',
    proveedor: 'Johnson & Johnson Vision', caducidad: '09/2027', costo: '$21,000 MXN', stock: 4, minimo: 6,
    estado: 'Bajo', color: 'bg-purple-500',
  },
  {
    id: 'LIO-003', nombre: 'Sensar 1-Piece', modelo: 'AR40M', categoria: 'Lente Intraocular (LIO)',
    esferico: '+23.00', cilindrico: '-1.50', eje: '180°', material: 'Acrílico hidrofóbico',
    proveedor: 'Johnson & Johnson Vision', caducidad: '04/2026', costo: '$14,800 MXN', stock: 0, minimo: 4,
    estado: 'Sin Stock', color: 'bg-emerald-500',
  },
  {
    id: 'LIO-004', nombre: 'Clareon', modelo: 'CNA0T0', categoria: 'Lente Intraocular (LIO)',
    esferico: '+22.50', cilindrico: '-1.00', eje: '45°', material: 'Acrílico Clareon',
    proveedor: 'Alcon México', caducidad: '10/2029', costo: '$22,500 MXN', stock: 15, minimo: 5,
    estado: 'Disponible', color: 'bg-sky-500',
  },
];

const estadoConfig: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle }> = {
  Disponible: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-gray-200', icon: CheckCircle },
  Bajo: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle },
  'Sin Stock': { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle },
};

export default function InventarioPage() {
  const [search, setSearch] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('Todos');
  const [filterMarca, setFilterMarca] = useState('Todos');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [filterStock, setFilterStock] = useState('Todos');
  const [showScanner, setShowScanner] = useState(false);
  const [showNewLente, setShowNewLente] = useState(false);
  const [showAdjustStock, setShowAdjustStock] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);

  const filtered = lentesData.filter((l) => {
    const matchSearch = l.nombre.toLowerCase().includes(search.toLowerCase()) ||
      l.id.toLowerCase().includes(search.toLowerCase()) ||
      l.modelo.toLowerCase().includes(search.toLowerCase()) ||
      l.esferico.includes(search) ||
      l.cilindrico.includes(search);
    const matchCategoria = filterCategoria === 'Todos' || l.categoria.includes(filterCategoria);
    const matchMarca = filterMarca === 'Todos' || l.proveedor.includes(filterMarca);
    const matchEstado = filterEstado === 'Todos' || l.estado === filterEstado;
    const matchStock = filterStock === 'Todos' ||
      (filterStock === 'Bajo' && l.stock > 0 && l.stock < l.minimo) ||
      (filterStock === 'Sin Stock' && l.stock === 0) ||
      (filterStock === 'Suficiente' && l.stock >= l.minimo);
    return matchSearch && matchCategoria && matchMarca && matchEstado && matchStock;
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">INVENTARIO DE LENTES</h1>
          <p className="mt-0.5 text-sm text-gray-400">Catálogo general, especificaciones refractivas y stock clínico.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors"
          >
            <Camera className="h-4 w-4" /> ESCANEAR CÓDIGO DE BARRAS
          </button>
          <button
            onClick={() => setShowNewLente(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Nuevo Lente
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, marca, modelo, grado refractivo..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filtrar:</span>
          {[
            { label: 'Todos', value: filterCategoria, set: setFilterCategoria, options: ['Todos', 'Intraocular', 'Contacto'] },
            { label: 'Categoría', value: filterCategoria, set: setFilterCategoria, options: ['Todos', 'Intraocular', 'Contacto'] },
            { label: 'Marca', value: filterMarca, set: setFilterMarca, options: ['Todos', 'Alcon', 'Johnson & Johnson'] },
            { label: 'Estado', value: filterEstado, set: setFilterEstado, options: ['Todos', 'Disponible', 'Bajo', 'Sin Stock'] },
            { label: 'Stock', value: filterStock, set: setFilterStock, options: ['Todos', 'Suficiente', 'Bajo', 'Sin Stock'] },
          ].map((f) => (
            <div key={f.label} className="relative">
              <select
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className={cn(
                  'appearance-none border rounded-lg pl-3 pr-8 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all',
                  f.value !== 'Todos' ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600'
                )}
              >
                {f.options.map((o) => <option key={o} value={o}>{f.label === 'Todos' ? o : (f.label + ': ' + o)}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          ))}
        </div>
      </div>

      {/* Lens cards */}
      <div className="space-y-4">
        {filtered.map((lente) => {
          const estado = estadoConfig[lente.estado];
          const EstadoIcon = estado.icon;
          const stockBajo = lente.stock > 0 && lente.stock < lente.minimo;
          const sinStock = lente.stock === 0;
          return (
            <div key={lente.id} className={cn(
              'rounded-xl border bg-white shadow-sm overflow-hidden transition-all hover:shadow-md',
              sinStock ? 'border-red-200' : stockBajo ? 'border-amber-200' : 'border-gray-200'
            )}>
              {/* Top row */}
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-extrabold', estado.bg, estado.text)}>
                    {lente.id}
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-gray-900">{lente.nombre}</h3>
                    <p className="text-xs text-gray-400">Modelo: {lente.modelo} · {lente.categoria}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Costo Unitario</span>
                    <p className="text-lg font-extrabold text-gray-900">{lente.costo}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold', estado.bg, estado.text)}>
                    <EstadoIcon className="h-3.5 w-3.5" />
                    {lente.estado}
                  </span>
                </div>
              </div>

              {/* Specs row */}
              <div className="border-t border-gray-100 bg-gray-50/30 px-6 py-4">
                <div className="grid grid-cols-6 gap-4">
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Esférico (SE)</span>
                    <p className="mt-1 text-sm font-extrabold text-gray-900">{lente.esferico}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cilíndrico (CYL)</span>
                    <p className="mt-1 text-sm font-extrabold text-gray-900">{lente.cilindrico}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Eje</span>
                    <p className="mt-1 text-sm font-extrabold text-gray-900">{lente.eje}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Material</span>
                    <p className="mt-1 text-sm font-bold text-gray-900">{lente.material}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stock Actual</span>
                    <p className={cn('mt-1 text-lg font-extrabold', sinStock ? 'text-red-600' : stockBajo ? 'text-amber-600' : 'text-gray-900')}>{lente.stock} pzas</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mínimo</span>
                    <p className="mt-1 text-sm font-bold text-gray-500">{lente.minimo} pzas</p>
                  </div>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Proveedor: <span className="font-bold text-gray-700">{lente.proveedor}</span></span>
                  <span>Caducidad: <span className="font-bold text-gray-700">{lente.caducidad}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  {stockBajo && (
                    <button className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors">
                      <RotateCcw className="h-3 w-3" /> Reordenar
                    </button>
                  )}
                  {sinStock && (
                    <button className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 transition-colors">
                      <RotateCcw className="h-3 w-3" /> Reordenar
                    </button>
                  )}
                  <button onClick={() => { setShowAdjustStock(lente.id); setAdjustQty(0); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                    <SlidersHorizontal className="h-3 w-3" /> Ajustar Stock
                  </button>
                  <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                    <History className="h-3 w-3" /> Historial
                  </button>
                  <button onClick={() => setShowNewLente(true)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No se encontraron lentes</p>
          </div>
        )}
      </div>

      {/* Scanner Modal */}
      {showScanner && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowScanner(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
                  <Camera className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Escanear Código de Barras</h3>
                  <p className="text-xs text-gray-400">Acerque el código de barras a la cámara</p>
                </div>
              </div>
              <button onClick={() => setShowScanner(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6">
              {/* Scanner viewfinder */}
              <div className="relative aspect-video rounded-xl bg-gray-900 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3/4 h-1/2 border-2 border-dashed border-primary-400 rounded-lg relative">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-lg" />
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary-500/60 animate-pulse" />
                  </div>
                </div>
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                    <Camera className="h-3 w-3" /> Cámara activa
                  </span>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="O escriba el código manualmente..."
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <button className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
                  BUSCAR LENTE
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Adjust Stock Modal */}
      {showAdjustStock && typeof window !== 'undefined' && (() => {
        const lente = lentesData.find((l) => l.id === showAdjustStock);
        if (!lente) return null;
        return createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdjustStock(null)} />
            <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Ajustar Stock</h3>
                <button onClick={() => setShowAdjustStock(null)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <span className="text-xs font-bold text-gray-400">{lente.id} · {lente.nombre}</span>
                  <p className="text-2xl font-extrabold text-gray-900 mt-1">Stock actual: <span className={cn(lente.stock === 0 ? 'text-red-600' : lente.stock < lente.minimo ? 'text-amber-600' : 'text-primary-600')}>{lente.stock}</span> pzas</p>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setAdjustQty(Math.max(adjustQty - 1, -lente.stock))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cantidad</span>
                    <p className={cn('text-3xl font-extrabold', adjustQty >= 0 ? 'text-primary-600' : 'text-red-600')}>{adjustQty > 0 ? '+' : ''}{adjustQty}</p>
                  </div>
                  <button onClick={() => setAdjustQty(adjustQty + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAdjustStock(null)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
                  <button className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">CONFIRMAR</button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* New/Edit Lente Modal */}
      {showNewLente && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewLente(false)} />
          <div className="relative z-10 w-full max-w-2xl mx-4 max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl bg-white shadow-2xl" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-8 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
                  <Package className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Nuevo Lente</h3>
                  <p className="text-xs text-gray-400">Registre las especificaciones del lente</p>
                </div>
              </div>
              <button onClick={() => setShowNewLente(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="Nombre" placeholder="Ej. AcrySof IQ" required />
                <FieldInput label="Modelo" placeholder="Ej. SN60WF" required />
                <FieldSelect label="Categoría" options={['Lente Intraocular (LIO)', 'Lente Monofocal', 'Lente Bifocal', 'Lente Progresivo', 'Lente Contacto']} required />
                <FieldSelect label="Proveedor" options={['Alcon México', 'Johnson & Johnson Vision', 'Zeiss', 'Hoya', 'Essilor']} required />
              </div>
              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 mb-3">Especificaciones Refractivas</h4>
                <div className="grid grid-cols-4 gap-4">
                  <FieldInput label="Esférico (SE)" placeholder="+21.00" />
                  <FieldInput label="Cilíndrico (CYL)" placeholder="-2.00" />
                  <FieldInput label="Eje" placeholder="90°" />
                  <FieldInput label="Material" placeholder="Acrílico hidrofóbico" />
                </div>
              </div>
              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 mb-3">Stock y Costo</h4>
                <div className="grid grid-cols-3 gap-4">
                  <FieldInput label="Stock Inicial" placeholder="0" type="number" />
                  <FieldInput label="Stock Mínimo" placeholder="5" type="number" />
                  <FieldInput label="Costo Unitario" placeholder="$0.00" />
                </div>
                <div className="mt-4">
                  <FieldInput label="Caducidad" placeholder="MM/AAAA" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-8 py-5">
              <button onClick={() => setShowNewLente(false)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
              <button className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">GUARDAR LENTE</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function FieldInput({ label, placeholder, type = 'text', required }: { label: string; placeholder: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">{label} {required && <span className="text-red-500">*</span>}</label>
      <input type={type} placeholder={placeholder} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" />
    </div>
  );
}

function FieldSelect({ label, options, required }: { label: string; options: string[]; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">{label} {required && <span className="text-red-500">*</span>}</label>
      <div className="relative">
        <select className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}
