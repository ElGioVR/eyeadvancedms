'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Camera,
  Package,
  CheckCircle,
  XCircle,
  SlidersHorizontal,
  Pencil,
  Trash2,
  Minus,
  Plus as PlusIcon,
  Loader2,
  Keyboard,
  ScanLine,
  History,
  X,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch, useDebounce } from '@/hooks';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ClientDate from '@/components/ui/ClientDate';

const BarcodeScanner = dynamic(() => import('@/components/inventario/BarcodeScanner'), { ssr: false });

interface LenteAPI {
  id: string;
  folio: string;
  manufacturer: string;
  product_name: string | null;
  model: string;
  sphere: number | null;
  cylinder: number | null;
  add_intermediate: number | null;
  add_near: number | null;
  nozzle: string | null;
  serial_number: string | null;
  expiration_date: string | null;
  barcode: string | null;
  barcode_format: string | null;
  stock: number;
  stock_minimo: number;
  precio_compra: number;
  precio_venta: number;
  lote: string | null;
  estado: string;
  notas: string | null;
  categoria: string | null;
  proveedor: string | null;
}

interface KardexMovimiento {
  id: string;
  tipo: string;
  cantidad: number;
  motivo: string | null;
  costo_unitario: number | null;
  referencia_tipo: string | null;
  created_at: string;
  usuarios: { nombre_completo: string } | null;
}

const kardexTipoConfig: Record<string, { bg: string; text: string; icon: typeof ArrowDown }> = {
  ENTRADA: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: ArrowDown },
  SALIDA: { bg: 'bg-red-50', text: 'text-red-700', icon: ArrowUp },
  SALIDA_CIRUGIA: { bg: 'bg-orange-50', text: 'text-orange-700', icon: Wrench },
  AJUSTE: { bg: 'bg-blue-50', text: 'text-blue-700', icon: SlidersHorizontal },
  DEVOLUCION: { bg: 'bg-violet-50', text: 'text-violet-700', icon: RotateCcw },
};

const estadoConfig: Record<string, { bg: string; text: string; dot?: string }> = {
  DISPONIBLE: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  OCUPADO: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  DANADO: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-300', dot: 'bg-red-500' },
  VENCIDO: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-300', dot: 'bg-red-500' },
};

function getEstadoLente(stock: number, minimo: number): string {
  if (stock === 0) return 'SIN STOCK';
  if (stock < minimo) return 'BAJO';
  return 'DISPONIBLE';
}

export default function InventarioPage() {
  const [page, setPage] = useState(1);
  const { user } = useUser();
  const { data: lentes, loading, error, refetch, total, page: currentPage } = useFetch<LenteAPI>('/api/inventario', { page: String(page), pageSize: '15' });
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('Todos');
  const [filterProveedor, setFilterProveedor] = useState('Todos');
  const [filterStock, setFilterStock] = useState('Todos');
  const [filterTipo, setFilterTipo] = useState('Todos');

  const [showAdjust, setShowAdjust] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'manual'>('camera');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<LenteAPI | null>(null);
  const [scanError, setScanError] = useState('');

  const [kardexItemId, setKardexItemId] = useState<string | null>(null);
  const [kardexData, setKardexData] = useState<KardexMovimiento[]>([]);
  const [kardexLoading, setKardexLoading] = useState(false);
  const [kardexItemName, setKardexItemName] = useState('');

  const debouncedSearch = useDebounce(search);

  const categorias = useMemo(() => {
    const unique = [...new Set(lentes.map((l) => l.categoria).filter((c): c is string => Boolean(c)))];
    return ['Todos', ...unique];
  }, [lentes]);

  const proveedores = useMemo(() => {
    const unique = [...new Set(lentes.map((l) => l.proveedor).filter((p): p is string => Boolean(p)))];
    return ['Todos', ...unique];
  }, [lentes]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return lentes.filter((l) => {
      const matchesSearch = !term || 
        l.folio?.toLowerCase().includes(term) || 
        l.manufacturer.toLowerCase().includes(term) || 
        l.product_name?.toLowerCase().includes(term) || 
        l.model.toLowerCase().includes(term) || 
        l.barcode?.toLowerCase().includes(term) ||
        l.serial_number?.toLowerCase().includes(term);
      const matchesCategoria = filterCategoria === 'Todos' || l.categoria === filterCategoria;
      const matchesProveedor = filterProveedor === 'Todos' || l.proveedor === filterProveedor;
      // Note: tipo is no longer in the schema; all are intraocular now
      let matchesStock = true;
      if (filterStock === 'Suficiente') matchesStock = l.stock >= l.stock_minimo;
      else if (filterStock === 'Bajo') matchesStock = l.stock > 0 && l.stock < l.stock_minimo;
      else if (filterStock === 'Sin Stock') matchesStock = l.stock === 0;
      return matchesSearch && matchesCategoria && matchesProveedor && matchesStock;
    });
  }, [lentes, debouncedSearch, filterCategoria, filterProveedor, filterStock]);

  const stats = useMemo(() => {
    const conStock = lentes.filter((l) => l.stock > 0).length;
    const bajo = lentes.filter((l) => l.stock > 0 && l.stock < l.stock_minimo).length;
    const sinStock = lentes.filter((l) => l.stock === 0).length;
    return { total, conStock, bajo, sinStock };
  }, [lentes, total]);

  async function handleAdjustStock() {
    if (!showAdjust) return;
    const lente = lentes.find((l) => l.id === showAdjust);
    if (!lente) return;
    const newStock = lente.stock + adjustQty;
    if (newStock < 0) return;

    setAdjusting(true);
    try {
      const res = await fetch('/api/inventario', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: showAdjust, stock: newStock }),
      });
      if (!res.ok) throw new Error('Error');
      toast(`Stock actualizado: ${lente.stock} → ${newStock}`);
      setShowAdjust(null);
      refetch();
    } catch {
      toast('Error al ajustar stock', 'error');
    } finally {
      setAdjusting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/inventario?id=${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast('Lente eliminado correctamente');
      setDeleteId(null);
      refetch();
    } catch {
      toast('Error al eliminar lente', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleBarcodeSearch() {
    if (!barcodeInput.trim()) return;
    setScanning(true);
    setScanError('');
    setScanResult(null);
    try {
      const res = await fetch(`/api/inventario?barcode=${encodeURIComponent(barcodeInput.trim())}`);
      if (!res.ok) {
        const data = await res.json();
        setScanError(data.error || 'No encontrado');
        return;
      }
      setScanResult(await res.json());
    } catch {
      setScanError('Error de conexion');
    } finally {
      setScanning(false);
    }
  }

  async function handleBarcodeSearchWithCode(code: string) {
    setScanning(true);
    setScanError('');
    setScanResult(null);
    try {
      const res = await fetch(`/api/inventario?barcode=${encodeURIComponent(code)}`);
      if (!res.ok) {
        const data = await res.json();
        setScanError(data.error || 'No encontrado');
        return;
      }
      setScanResult(await res.json());
    } catch {
      setScanError('Error de conexion');
    } finally {
      setScanning(false);
    }
  }

  async function openKardex(lente: LenteAPI) {
    setKardexItemId(lente.id);
    setKardexItemName(`${lente.manufacturer} ${lente.model}`);
    setKardexLoading(true);
    setKardexData([]);
    try {
      const res = await fetch(`/api/inventario/movimientos?item_id=${lente.id}&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        setKardexData(data.data || []);
      }
    } catch { /* silent */ } finally {
      setKardexLoading(false);
    }
  }

  // Coincide con el RBAC de /api/inventario: crear puede admin/recepcionista/doctor;
  // ajustar stock, editar y eliminar siguen siendo solo admin/recepcionista.
  const puedeEscribir = user?.rol === 'admin' || user?.rol === 'recepcionista';
  const puedeCrear = puedeEscribir || user?.rol === 'doctor';

  const headerActions = (
    <div className={cn('grid w-full gap-2 sm:flex sm:w-auto', puedeCrear ? 'grid-cols-2' : 'grid-cols-1')}>
      <button onClick={() => setShowScanner(true)} className="btn-secondary">
        <Camera className="h-4 w-4" /> Escanear
      </button>
      {puedeCrear && (
        <Link href="/inventario/nueva" className="btn-primary">
          <PlusIcon className="h-4 w-4" /> Nuevo ítem
        </Link>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 sm:space-y-6">
      <PageHeader title="Inventario" subtitle="Lentes intraoculares, especificaciones y stock clínico." action={headerActions} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-fg', dot: 'bg-primary-500' },
          { label: 'Con stock', value: stats.conStock, color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
          { label: 'Bajo', value: stats.bajo, color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
          { label: 'Sin stock', value: stats.sinStock, color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-2xl border border-line bg-surface px-2.5 py-2.5 shadow-soft dark:shadow-none sm:px-4 sm:py-3">
            <span className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted sm:text-xs">
              <span className={cn('hidden h-1.5 w-1.5 shrink-0 rounded-full sm:inline-block', s.dot)} />
              {s.label}
            </span>
            <p className={cn('mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-soft dark:shadow-none sm:p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar folio, código, marca, modelo…" />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <FilterSelect label="Categoría" value={filterCategoria} onChange={setFilterCategoria} options={categorias} />
          <FilterSelect label="Proveedor" value={filterProveedor} onChange={setFilterProveedor} options={proveedores} />
          <FilterSelect label="Stock" value={filterStock} onChange={setFilterStock} options={['Todos', 'Suficiente', 'Bajo', 'Sin Stock']} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-line bg-surface p-6">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded bg-gray-200 dark:bg-surface-2" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-gray-200 dark:bg-surface-2 rounded w-1/3" />
                  <div className="h-4 bg-gray-200 dark:bg-surface-2 rounded w-1/4" />
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {[1, 2, 3].map((j) => <div key={j} className="h-16 bg-surface-2 rounded" />)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((lente) => {
            const stockBajo = lente.stock > 0 && lente.stock < lente.stock_minimo;
            const sinStock = lente.stock === 0;
            const estadoLente = getEstadoLente(lente.stock, lente.stock_minimo);
            return (
              <div key={lente.id} className={cn(
                'rounded-2xl border bg-surface shadow-soft overflow-hidden transition-all hover:shadow-card dark:shadow-none',
                sinStock ? 'border-red-200 dark:border-red-500/30' : stockBajo ? 'border-amber-200 dark:border-amber-500/30' : 'border-line'
              )}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                  <div className="flex min-w-0 items-start gap-3 sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums', sinStock ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : stockBajo ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300')}>
                          {lente.folio || lente.id.slice(0, 8)}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                          LIO
                        </span>
                      </div>
                      <h3 className="truncate text-base font-semibold text-fg">{lente.manufacturer} {lente.model}</h3>
                      <p className="truncate text-xs text-muted">{lente.categoria || 'Sin categoría'} {lente.product_name ? `\u00b7 ${lente.product_name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="sm:text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted dark:text-muted">Precio Venta</span>
                      <p className="text-lg font-extrabold text-fg">${lente.precio_venta?.toLocaleString() || '\u2014'}</p>
                    </div>
                    <StatusBadge status={estadoLente} config={estadoConfig} />
                  </div>
                </div>

                <div className="border-t border-line/70 bg-surface-2/40 px-3 py-3 sm:px-6 sm:py-4">
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-6">
                    {[
                      { label: 'Esfera (D)', value: lente.sphere?.toString() || '—' },
                      { label: 'Cilindro (D)', value: lente.cylinder?.toString() || '—' },
                      { label: 'ADD Int (D)', value: lente.add_intermediate?.toString() || '—' },
                      { label: 'ADD Cerc (D)', value: lente.add_near?.toString() || '—' },
                      { label: 'Boquilla', value: lente.nozzle || '—' },
                      { label: 'N\u00b0 Serie', value: lente.serial_number || '—' },
                      { label: 'Caducidad', value: lente.expiration_date || '—' },
                      { label: 'Stock', value: `${lente.stock} pzas`, className: sinStock ? 'text-red-600' : stockBajo ? 'text-amber-600' : 'text-fg' },
                      { label: 'M\u00ednimo', value: `${lente.stock_minimo} pzas`, className: 'text-muted' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-xl border border-line bg-surface px-2.5 py-2 sm:px-4 sm:py-3">
                        <span className="block truncate text-[10px] font-medium text-muted sm:text-[11px]">{item.label}</span>
                        <p className={cn('mt-0.5 truncate text-[13px] font-semibold text-fg tabular-nums sm:text-sm', item.className)}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-line/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-3">
                  <div className="hidden flex-wrap items-center gap-4 text-xs text-muted sm:flex">
                    <span>Fabricante: <span className="font-bold text-fg-2">{lente.manufacturer}</span></span>
                    <span>Producto: <span className="font-bold text-fg-2">{lente.product_name || '\u2014'}</span></span>
                    <span>Modelo: <span className="font-bold text-fg-2">{lente.model}</span></span>
                    <span>Proveedor: <span className="font-bold text-fg-2">{lente.proveedor || '\u2014'}</span></span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button onClick={() => openKardex(lente)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors">
                      <History className="h-3 w-3" /> <span>Kardex</span>
                    </button>
                    {puedeEscribir && (
                      <button onClick={() => { setShowAdjust(lente.id); setAdjustQty(0); }} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors">
                        <SlidersHorizontal className="h-3 w-3" /> <span className="hidden sm:inline">Ajustar Stock</span>
                      </button>
                    )}
                    {puedeEscribir && (
                      <Link href={`/inventario/${lente.id}/editar`} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors">
                        <Pencil className="h-3 w-3" /> <span className="hidden sm:inline">Editar</span>
                      </Link>
                    )}
                    {puedeEscribir && (
                      <button onClick={() => setDeleteId(lente.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-surface-2 transition-colors">
                        <Trash2 className="h-3 w-3" /> <span className="hidden sm:inline">Eliminar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <EmptyState icon={Package} title="No se encontraron lentes" description="Intenta ajustar los filtros de busqueda o agrega un nuevo lente" />
          )}
        </div>
      )}

      <Pagination
        page={currentPage}
        total={total}
        pageSize={15}
        totalItems={filtered.length}
        onPageChange={(p) => setPage(p)}
        label="lentes"
      />

      {/* Scanner Modal */}
      <Modal isOpen={showScanner} onClose={() => { setShowScanner(false); setScanResult(null); setScanError(''); setBarcodeInput(''); setScannerMode('camera'); }} maxWidth="max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 ring-1 ring-primary-200">
            <Camera className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-fg">Escanear Codigo de Barras</h3>
            <p className="text-xs text-muted dark:text-muted">Usa la camara o escribe el codigo manualmente</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg bg-surface-2 p-1 mb-4">
          <button
            onClick={() => setScannerMode('camera')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-colors',
              scannerMode === 'camera' ? 'bg-surface text-primary-700 shadow-sm' : 'text-muted hover:text-gray-700 dark:hover:text-fg dark:text-fg'
            )}
          >
            <ScanLine className="h-4 w-4" /> Camara
          </button>
          <button
            onClick={() => setScannerMode('manual')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-colors',
              scannerMode === 'manual' ? 'bg-surface text-primary-700 shadow-sm' : 'text-muted hover:text-gray-700 dark:hover:text-fg dark:text-fg'
            )}
          >
            <Keyboard className="h-4 w-4" /> Manual
          </button>
        </div>

        {scannerMode === 'camera' ? (
          <BarcodeScanner
            onScan={(code) => {
              setBarcodeInput(code);
              // Auto-search after scan
              setTimeout(() => {
                handleBarcodeSearchWithCode(code);
              }, 100);
            }}
            onClose={() => setShowScanner(false)}
          />
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBarcodeSearch()}
              placeholder="Escriba el codigo de barras..."
              className="block w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-gray-400 dark:placeholder:text-muted dark:text-muted dark:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              autoFocus
            />
            <button onClick={handleBarcodeSearch} disabled={scanning || !barcodeInput.trim()} className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</> : 'BUSCAR LENTE'}
            </button>
          </div>
        )}
        {scanError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0" /> {scanError}
          </div>
        )}
        {scanResult && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50/50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary-600" />
              <span className="text-sm font-extrabold text-primary-700">Lente encontrado</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted">Fabricante:</span> <span className="font-bold">{scanResult.manufacturer}</span></div>
              <div><span className="text-muted">Producto:</span> <span className="font-bold">{scanResult.product_name || '\u2014'}</span></div>
              <div><span className="text-muted">Modelo:</span> <span className="font-bold">{scanResult.model}</span></div>
              <div><span className="text-muted">Esfera:</span> <span className="font-bold">{scanResult.sphere?.toString() || '\u2014'}</span></div>
              <div><span className="text-muted">Cilindro:</span> <span className="font-bold">{scanResult.cylinder?.toString() || '\u2014'}</span></div>
              <div><span className="text-muted">ADD Int:</span> <span className="font-bold">{scanResult.add_intermediate?.toString() || '\u2014'}</span></div>
              <div><span className="text-muted">ADD Cerc:</span> <span className="font-bold">{scanResult.add_near?.toString() || '\u2014'}</span></div>
              <div><span className="text-muted">N\u00b0 Serie:</span> <span className="font-bold">{scanResult.serial_number || '\u2014'}</span></div>
              <div><span className="text-muted">Stock:</span> <span className={cn('font-bold', scanResult.stock === 0 ? 'text-red-600' : 'text-fg')}>{scanResult.stock} pzas</span></div>
              <div><span className="text-muted">Precio:</span> <span className="font-bold">${scanResult.precio_venta?.toLocaleString() || '\u2014'}</span></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Link href={`/inventario/${scanResult.id}/editar`} onClick={() => { setShowScanner(false); setScanResult(null); setBarcodeInput(''); }} className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors text-center">
                Editar
              </Link>
              <button onClick={() => { setShowScanner(false); setScanResult(null); setBarcodeInput(''); setShowAdjust(scanResult.id); setAdjustQty(0); }} className="flex-1 rounded-lg border border-primary-200 bg-surface px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 transition-colors">
                Ajustar Stock
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal isOpen={!!showAdjust} onClose={() => setShowAdjust(null)} maxWidth="max-w-sm">
        {showAdjust && (() => {
          const lente = lentes.find((l) => l.id === showAdjust);
          if (!lente) return null;
          const newStock = lente.stock + adjustQty;
          const stockClass = lente.stock === 0 ? 'text-red-600' : lente.stock < lente.stock_minimo ? 'text-amber-600' : 'text-primary-600';
          return (
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-fg text-center">Ajustar Stock</h3>
              <div className="rounded-lg bg-surface-2 p-3 text-center">
                <span className="text-xs font-bold text-muted">{lente.manufacturer} {lente.model}</span>
                <p className="text-2xl font-extrabold text-fg mt-1">Stock actual: <span className={stockClass}>{lente.stock}</span> pzas</p>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setAdjustQty((prev) => Math.max(prev - 1, -lente.stock))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2 transition-colors">
                  <Minus className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted dark:text-muted">Cantidad</span>
                  <p className={cn('text-3xl font-extrabold', adjustQty >= 0 ? 'text-primary-600' : 'text-red-600')}>
                    {adjustQty > 0 ? '+' : ''}{adjustQty}
                  </p>
                  {adjustQty !== 0 && (
                    <p className="text-xs text-muted dark:text-muted mt-1">
                      Nuevo stock: <span className={cn('font-bold', newStock === 0 ? 'text-red-600' : 'text-fg')}>{newStock}</span>
                    </p>
                  )}
                </div>
                <button onClick={() => setAdjustQty((prev) => prev + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2 transition-colors">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => setShowAdjust(null)} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors">CANCELAR</button>
                <button onClick={handleAdjustStock} disabled={adjusting || adjustQty === 0} className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {adjusting ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : 'CONFIRMAR'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar Lente"
        message="Esta accion eliminara el lente del inventario permanentemente. No se podra deshacer."
        confirmText="ELIMINAR"
        variant="danger"
        loading={deleting}
      />

      {/* Kardex Drawer */}
      {kardexItemId && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setKardexItemId(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-line z-50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-base font-extrabold text-fg">Kardex</h3>
                <p className="text-xs text-muted">{kardexItemName}</p>
              </div>
              <button onClick={() => setKardexItemId(null)} className="p-2 rounded-lg hover:bg-surface-2 transition-colors">
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {kardexLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : kardexData.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-8 w-8 text-gray-300 dark:text-line-strong mx-auto mb-3" />
                  <p className="text-sm text-muted">Sin movimientos registrados</p>
                </div>
              ) : (
                <div className="relative space-y-3">
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-surface-3" />
                  {kardexData.map((mov) => {
                    const config = kardexTipoConfig[mov.tipo] || kardexTipoConfig.AJUSTE;
                    const Icon = config.icon;
                    return (
                      <div key={mov.id} className="relative flex items-start gap-3">
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-line">
                          <Icon className={cn('h-4 w-4', config.text)} />
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg border border-line/70 bg-surface-2 p-3">
                          <div className="flex items-center justify-between">
                            <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', config.bg, config.text)}>
                              {mov.tipo.replace('_', ' ')}
                            </span>
                            <span className={cn('text-sm font-extrabold', mov.tipo.startsWith('SALIDA') ? 'text-red-600' : 'text-emerald-600')}>
                              {mov.tipo.startsWith('SALIDA') ? '-' : '+'}{mov.cantidad}
                            </span>
                          </div>
                          {mov.motivo && (
                            <p className="mt-1.5 text-xs text-muted">{mov.motivo}</p>
                          )}
                          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted">
                            {mov.usuarios?.nombre_completo && <span>{mov.usuarios.nombre_completo}</span>}
                             <span><ClientDate date={mov.created_at} dateTime /></span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
