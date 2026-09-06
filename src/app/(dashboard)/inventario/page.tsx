'use client';

import { useState, useMemo } from 'react';
import {
  Camera,
  Package,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RotateCcw,
  SlidersHorizontal,
  History,
  Pencil,
  Minus,
  Plus as PlusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { FormInput, FormSelect } from '@/components/ui/FormField';
import { lentesData } from '@/data';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilteredData } from '@/hooks/useFilteredData';

const estadoConfig: Record<string, { bg: string; text: string; dot?: string }> = {
  Disponible: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Bajo: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Sin Stock': { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

const categoriaOptions = ['Todos', 'Intraocular', 'Contacto'];
const marcaOptions = ['Todos', 'Alcon', 'Johnson & Johnson'];
const estadoOptions = ['Todos', 'Disponible', 'Bajo', 'Sin Stock'];
const stockOptions = ['Todos', 'Suficiente', 'Bajo', 'Sin Stock'];

const categoriaLenteOptions = ['Lente Intraocular (LIO)', 'Lente Monofocal', 'Lente Bifocal', 'Lente Progresivo', 'Lente Contacto'];
const proveedorOptions = ['Alcon México', 'Johnson & Johnson Vision', 'Zeiss', 'Hoya', 'Essilor'];

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

  const [newLente, setNewLente] = useState({
    nombre: '', modelo: '', categoria: categoriaLenteOptions[0], proveedor: proveedorOptions[0],
    esferico: '', cilindrico: '', eje: '', material: '',
    stockInicial: '', stockMinimo: '', costoUnitario: '', caducidad: '',
  });

  const debouncedSearch = useDebounce(search);

  const baseFiltered = useFilteredData(lentesData, {
    searchFields: ['nombre', 'id', 'modelo', 'esferico', 'cilindrico'],
    searchTerm: debouncedSearch,
    filters: { categoria: filterCategoria, proveedor: filterMarca, estado: filterEstado },
  });

  const filtered = useMemo(() => {
    if (filterStock === 'Todos') return baseFiltered;
    return baseFiltered.filter((l) =>
      (filterStock === 'Bajo' && l.stock > 0 && l.stock < l.minimo) ||
      (filterStock === 'Sin Stock' && l.stock === 0) ||
      (filterStock === 'Suficiente' && l.stock >= l.minimo)
    );
  }, [baseFiltered, filterStock]);

  const headerActions = (
    <div className="flex gap-3">
      <button onClick={() => setShowScanner(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors">
        <Camera className="h-4 w-4" /> ESCANEAR CÓDIGO DE BARRAS
      </button>
      <button onClick={() => setShowNewLente(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
        <PlusIcon className="h-4 w-4" /> Nuevo Lente
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="INVENTARIO DE LENTES"
        subtitle="Catálogo general, especificaciones refractivas y stock clínico."
        action={headerActions}
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código, marca, modelo, grado refractivo..." />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filtrar:</span>
          <FilterSelect value={filterCategoria} onChange={setFilterCategoria} options={categoriaOptions} />
          <FilterSelect value={filterMarca} onChange={setFilterMarca} options={marcaOptions} />
          <FilterSelect value={filterEstado} onChange={setFilterEstado} options={estadoOptions} />
          <FilterSelect value={filterStock} onChange={setFilterStock} options={stockOptions} />
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((lente) => {
          const stockBajo = lente.stock > 0 && lente.stock < lente.minimo;
          const sinStock = lente.stock === 0;
          return (
            <div key={lente.id} className={cn(
              'rounded-xl border bg-white shadow-sm overflow-hidden transition-all hover:shadow-md',
              sinStock ? 'border-red-200' : stockBajo ? 'border-amber-200' : 'border-gray-200'
            )}>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-extrabold', estadoConfig[lente.estado]?.bg, estadoConfig[lente.estado]?.text)}>
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
                  <StatusBadge status={lente.estado} config={estadoConfig} />
                </div>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/30 px-6 py-4">
                <div className="grid grid-cols-6 gap-4">
                  {[
                    { label: 'Esférico (SE)', value: lente.esferico },
                    { label: 'Cilíndrico (CYL)', value: lente.cilindrico },
                    { label: 'Eje', value: lente.eje },
                    { label: 'Material', value: lente.material },
                    { label: 'Stock Actual', value: `${lente.stock} pzas`, className: sinStock ? 'text-red-600' : stockBajo ? 'text-amber-600' : 'text-gray-900' },
                    { label: 'Mínimo', value: `${lente.minimo} pzas`, className: 'text-gray-500' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.label}</span>
                      <p className={cn('mt-1 text-sm font-extrabold text-gray-900', item.className)}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Proveedor: <span className="font-bold text-gray-700">{lente.proveedor}</span></span>
                  <span>Caducidad: <span className="font-bold text-gray-700">{lente.caducidad}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  {(stockBajo || sinStock) && (
                    <button className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white hover:transition-colors',
                      sinStock ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
                    )}>
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
          <EmptyState icon={Package} title="No se encontraron lentes" description="Intenta ajustar los filtros de búsqueda" />
        )}
      </div>

      {/* Scanner Modal */}
      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
            <Camera className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Escanear Código de Barras</h3>
            <p className="text-xs text-gray-400">Acerque el código de barras a la cámara</p>
          </div>
        </div>
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
          <input type="text" placeholder="O escriba el código manualmente..." className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
          <button className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
            BUSCAR LENTE
          </button>
        </div>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal isOpen={!!showAdjustStock} onClose={() => setShowAdjustStock(null)} maxWidth="max-w-sm">
        {showAdjustStock && (() => {
          const lente = lentesData.find((l) => l.id === showAdjustStock);
          if (!lente) return null;
          const stockClass = lente.stock === 0 ? 'text-red-600' : lente.stock < lente.minimo ? 'text-amber-600' : 'text-primary-600';
          return (
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-gray-900 text-center">Ajustar Stock</h3>
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <span className="text-xs font-bold text-gray-400">{lente.id} · {lente.nombre}</span>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">Stock actual: <span className={stockClass}>{lente.stock}</span> pzas</p>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setAdjustQty((prev) => Math.max(prev - 1, -lente.stock))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  <Minus className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cantidad</span>
                  <p className={cn('text-3xl font-extrabold', adjustQty >= 0 ? 'text-primary-600' : 'text-red-600')}>
                    {adjustQty > 0 ? '+' : ''}{adjustQty}
                  </p>
                </div>
                <button onClick={() => setAdjustQty((prev) => prev + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAdjustStock(null)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
                <button className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">CONFIRMAR</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* New/Edit Lente Modal */}
      <Modal isOpen={showNewLente} onClose={() => setShowNewLente(false)} maxWidth="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
            <Package className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Nuevo Lente</h3>
            <p className="text-xs text-gray-400">Registre las especificaciones del lente</p>
          </div>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormInput label="Nombre" placeholder="Ej. AcrySof IQ" value={newLente.nombre} onChange={(v) => setNewLente((prev) => ({ ...prev, nombre: v }))} required />
            <FormInput label="Modelo" placeholder="Ej. SN60WF" value={newLente.modelo} onChange={(v) => setNewLente((prev) => ({ ...prev, modelo: v }))} required />
            <FormSelect label="Categoría" options={categoriaLenteOptions} value={newLente.categoria} onChange={(v) => setNewLente((prev) => ({ ...prev, categoria: v }))} required />
            <FormSelect label="Proveedor" options={proveedorOptions} value={newLente.proveedor} onChange={(v) => setNewLente((prev) => ({ ...prev, proveedor: v }))} required />
          </div>
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 mb-3">Especificaciones Refractivas</h4>
            <div className="grid grid-cols-4 gap-4">
              <FormInput label="Esférico (SE)" placeholder="+21.00" value={newLente.esferico} onChange={(v) => setNewLente((prev) => ({ ...prev, esferico: v }))} />
              <FormInput label="Cilíndrico (CYL)" placeholder="-2.00" value={newLente.cilindrico} onChange={(v) => setNewLente((prev) => ({ ...prev, cilindrico: v }))} />
              <FormInput label="Eje" placeholder="90°" value={newLente.eje} onChange={(v) => setNewLente((prev) => ({ ...prev, eje: v }))} />
              <FormInput label="Material" placeholder="Acrílico hidrofóbico" value={newLente.material} onChange={(v) => setNewLente((prev) => ({ ...prev, material: v }))} />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 mb-3">Stock y Costo</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormInput label="Stock Inicial" placeholder="0" type="number" value={newLente.stockInicial} onChange={(v) => setNewLente((prev) => ({ ...prev, stockInicial: v }))} />
              <FormInput label="Stock Mínimo" placeholder="5" type="number" value={newLente.stockMinimo} onChange={(v) => setNewLente((prev) => ({ ...prev, stockMinimo: v }))} />
              <FormInput label="Costo Unitario" placeholder="$0.00" value={newLente.costoUnitario} onChange={(v) => setNewLente((prev) => ({ ...prev, costoUnitario: v }))} />
            </div>
            <div className="mt-4">
              <FormInput label="Caducidad" placeholder="MM/AAAA" value={newLente.caducidad} onChange={(v) => setNewLente((prev) => ({ ...prev, caducidad: v }))} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5 mt-5">
          <button onClick={() => setShowNewLente(false)} className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
          <button className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">GUARDAR LENTE</button>
        </div>
      </Modal>
    </div>
  );
}
