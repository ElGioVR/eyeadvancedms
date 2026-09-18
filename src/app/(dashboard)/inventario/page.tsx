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
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import FilterSelect from '@/components/ui/FilterSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import ConfirmModal from '@/components/ui/ConfirmModal';

const BarcodeScanner = dynamic(() => import('@/components/inventario/BarcodeScanner'), { ssr: false });

interface LenteAPI {
  id: string;
  folio: string;
  tipo: string;
  marca: string;
  modelo: string;
  codigo_barras: string;
  grado_esferico: number;
  grado_cilindrico: number;
  eje: number;
  color: string;
  material: string;
  stock: number;
  stock_minimo: number;
  precio_compra: number;
  precio_venta: number;
  lote: string;
  fecha_caducidad: string;
  estado: string;
  notas: string;
  categoria: string;
  proveedor: string;
  potencia_dioptrias: number | null;
  tipo_lio: string | null;
  modelo_fabricante: string | null;
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
  DISPONIBLE: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  OCUPADO: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  DANADO: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  VENCIDO: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

function getEstadoLente(stock: number, minimo: number): string {
  if (stock === 0) return 'SIN STOCK';
  if (stock < minimo) return 'BAJO';
  return 'DISPONIBLE';
}

export default function InventarioPage() {
  const [page, setPage] = useState(1);
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
    const unique = [...new Set(lentes.map((l) => l.categoria).filter(Boolean))];
    return ['Todos', ...unique];
  }, [lentes]);

  const proveedores = useMemo(() => {
    const unique = [...new Set(lentes.map((l) => l.proveedor).filter(Boolean))];
    return ['Todos', ...unique];
  }, [lentes]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return lentes.filter((l) => {
      const matchesSearch = !term || l.folio?.toLowerCase().includes(term) || l.marca.toLowerCase().includes(term) || l.modelo.toLowerCase().includes(term) || l.codigo_barras?.toLowerCase().includes(term);
      const matchesCategoria = filterCategoria === 'Todos' || l.categoria === filterCategoria;
      const matchesProveedor = filterProveedor === 'Todos' || l.proveedor === filterProveedor;
      const matchesTipo = filterTipo === 'Todos' || l.tipo === filterTipo;
      let matchesStock = true;
      if (filterStock === 'Suficiente') matchesStock = l.stock >= l.stock_minimo;
      else if (filterStock === 'Bajo') matchesStock = l.stock > 0 && l.stock < l.stock_minimo;
      else if (filterStock === 'Sin Stock') matchesStock = l.stock === 0;
      return matchesSearch && matchesCategoria && matchesProveedor && matchesStock && matchesTipo;
    });
  }, [lentes, debouncedSearch, filterCategoria, filterProveedor, filterStock, filterTipo]);

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
    setKardexItemName(`${lente.marca} ${lente.modelo}`);
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

  const headerActions = (
    <div className="flex flex-col sm:flex-row gap-3">
      <button onClick={() => setShowScanner(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-5 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 transition-colors">
        <Camera className="h-4 w-4" /> ESCANEAR
      </button>
      <Link href="/inventario/nueva" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
        <PlusIcon className="h-4 w-4" /> Nuevo Ítem
      </Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader title="INVENTARIO" subtitle="Lentes de visión, intraoculares, especificaciones y stock clínico." action={headerActions} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-[#E7E9EA]' },
          { label: 'Con Stock', value: stats.conStock, color: 'text-emerald-600' },
          { label: 'Stock Bajo', value: stats.bajo, color: 'text-amber-600' },
          { label: 'Sin Stock', value: stats.sinStock, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">{s.label}</span>
            <p className={cn('text-2xl font-extrabold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#16181C] rounded-xl border border-gray-200 dark:border-[#2F3336] shadow-sm p-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por folio, codigo, marca, modelo, grado refractivo..." />
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <span className="text-xs font-bold text-gray-400 dark:text-[#71767B] dark:text-[#71767B] uppercase tracking-wider">Filtrar:</span>
          <FilterSelect value={filterCategoria} onChange={setFilterCategoria} options={categorias} />
          <FilterSelect value={filterProveedor} onChange={setFilterProveedor} options={proveedores} />
          <FilterSelect value={filterStock} onChange={setFilterStock} options={['Todos', 'Suficiente', 'Bajo', 'Sin Stock']} />
          <FilterSelect value={filterTipo} onChange={setFilterTipo} options={['Todos', 'LENTE_VISION', 'LENTE_INTRAOCULAR']} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-6">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded bg-gray-200 dark:bg-[#202327]" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-gray-200 dark:bg-[#202327] rounded w-1/3" />
                  <div className="h-4 bg-gray-200 dark:bg-[#202327] rounded w-1/4" />
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {[1, 2, 3].map((j) => <div key={j} className="h-16 bg-gray-100 dark:bg-[#202327] rounded" />)}
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
                'rounded-xl border bg-white dark:bg-[#16181C] shadow-sm overflow-hidden transition-all hover:shadow-md',
                sinStock ? 'border-red-200' : stockBajo ? 'border-amber-200' : 'border-gray-200 dark:border-[#2F3336]'
              )}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                  <div className="flex items-center gap-3">
                    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-extrabold', sinStock ? 'bg-red-50 text-red-600' : stockBajo ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700')}>
                      {lente.folio || lente.id.slice(0, 8)}
                    </span>
                    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', lente.tipo === 'LENTE_INTRAOCULAR' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600')}>
                      {lente.tipo === 'LENTE_INTRAOCULAR' ? 'LIO' : 'VISIÓN'}
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-gray-900 dark:text-[#E7E9EA]">{lente.marca} {lente.modelo}</h3>
                      <p className="text-xs text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">{lente.categoria || 'Sin categoria'} {lente.color ? `\u00b7 ${lente.color}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Precio Venta</span>
                      <p className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">${lente.precio_venta?.toLocaleString() || '\u2014'}</p>
                    </div>
                    <StatusBadge status={estadoLente} config={estadoConfig} />
                  </div>
                </div>

                <div className="border-t border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327]/30 dark:bg-[#202327]/30 px-4 py-3 sm:px-6 sm:py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    {(lente.tipo === 'LENTE_INTRAOCULAR' ? [
                      { label: 'Potencia', value: lente.potencia_dioptrias?.toString() || '—' },
                      { label: 'Tipo LIO', value: lente.tipo_lio || '—' },
                      { label: 'Modelo', value: lente.modelo_fabricante || '—' },
                    ] : [
                      { label: 'Esf\u00e9rico (SE)', value: lente.grado_esferico?.toString() || '—' },
                      { label: 'Cil\u00edndrico (CYL)', value: lente.grado_cilindrico?.toString() || '—' },
                      { label: 'Eje', value: lente.eje ? `${lente.eje}\u00b0` : '—' },
                      { label: 'Material', value: lente.material || '—' },
                    ] as Array<{ label: string; value: string; className?: string }>).concat([
                      { label: 'Stock Actual', value: `${lente.stock} pzas`, className: sinStock ? 'text-red-600' : stockBajo ? 'text-amber-600' : 'text-gray-900 dark:text-[#E7E9EA]' },
                      { label: 'M\u00ednimo', value: `${lente.stock_minimo} pzas`, className: 'text-gray-500 dark:text-[#71767B]' },
                    ]).map((item) => (
                      <div key={item.label} className="rounded-lg bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] px-4 py-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">{item.label}</span>
                        <p className={cn('mt-1 text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]', item.className)}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-100 dark:border-[#2F3336] px-4 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-[#71767B]">
                    <span>Proveedor: <span className="font-bold text-gray-700 dark:text-[#E7E9EA]">{lente.proveedor || '\u2014'}</span></span>
                    <span>Caducidad: <span className="font-bold text-gray-700 dark:text-[#E7E9EA]">{lente.fecha_caducidad || '\u2014'}</span></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => openKardex(lente)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                      <History className="h-3 w-3" /> <span className="hidden sm:inline">Kardex</span>
                    </button>
                    <button onClick={() => { setShowAdjust(lente.id); setAdjustQty(0); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                      <SlidersHorizontal className="h-3 w-3" /> <span className="hidden sm:inline">Ajustar Stock</span>
                    </button>
                    <Link href={`/inventario/${lente.id}/editar`} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                      <Pencil className="h-3 w-3" /> <span className="hidden sm:inline">Editar</span>
                    </Link>
                    <button onClick={() => setDeleteId(lente.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white dark:bg-[#16181C] px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-[#1D1F23] transition-colors">
                      <Trash2 className="h-3 w-3" /> <span className="hidden sm:inline">Eliminar</span>
                    </button>
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
            <h3 className="text-base font-extrabold text-gray-900 dark:text-[#E7E9EA]">Escanear Codigo de Barras</h3>
            <p className="text-xs text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Usa la camara o escribe el codigo manualmente</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-[#202327] p-1 mb-4">
          <button
            onClick={() => setScannerMode('camera')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-colors',
              scannerMode === 'camera' ? 'bg-white dark:bg-[#16181C] text-primary-700 shadow-sm' : 'text-gray-500 dark:text-[#71767B] hover:text-gray-700 dark:hover:text-[#E7E9EA] dark:text-[#E7E9EA]'
            )}
          >
            <ScanLine className="h-4 w-4" /> Camara
          </button>
          <button
            onClick={() => setScannerMode('manual')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-colors',
              scannerMode === 'manual' ? 'bg-white dark:bg-[#16181C] text-primary-700 shadow-sm' : 'text-gray-500 dark:text-[#71767B] hover:text-gray-700 dark:hover:text-[#E7E9EA] dark:text-[#E7E9EA]'
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
              className="block w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] dark:text-[#71767B] dark:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
              <div><span className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Marca:</span> <span className="font-bold">{scanResult.marca}</span></div>
              <div><span className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Modelo:</span> <span className="font-bold">{scanResult.modelo}</span></div>
              <div><span className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">SE:</span> <span className="font-bold">{scanResult.grado_esferico || '\u2014'}</span></div>
              <div><span className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">CYL:</span> <span className="font-bold">{scanResult.grado_cilindrico || '\u2014'}</span></div>
              <div><span className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Stock:</span> <span className={cn('font-bold', scanResult.stock === 0 ? 'text-red-600' : 'text-gray-900 dark:text-[#E7E9EA]')}>{scanResult.stock} pzas</span></div>
              <div><span className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Precio:</span> <span className="font-bold">${scanResult.precio_venta?.toLocaleString() || '\u2014'}</span></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Link href={`/inventario/${scanResult.id}/editar`} onClick={() => { setShowScanner(false); setScanResult(null); setBarcodeInput(''); }} className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors text-center">
                Editar
              </Link>
              <button onClick={() => { setShowScanner(false); setScanResult(null); setBarcodeInput(''); setShowAdjust(scanResult.id); setAdjustQty(0); }} className="flex-1 rounded-lg border border-primary-200 bg-white dark:bg-[#16181C] px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 transition-colors">
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
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA] text-center">Ajustar Stock</h3>
              <div className="rounded-lg bg-gray-50 dark:bg-[#202327] p-3 text-center">
                <span className="text-xs font-bold text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">{lente.marca} {lente.modelo}</span>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-[#E7E9EA] mt-1">Stock actual: <span className={stockClass}>{lente.stock}</span> pzas</p>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setAdjustQty((prev) => Math.max(prev - 1, -lente.stock))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                  <Minus className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">Cantidad</span>
                  <p className={cn('text-3xl font-extrabold', adjustQty >= 0 ? 'text-primary-600' : 'text-red-600')}>
                    {adjustQty > 0 ? '+' : ''}{adjustQty}
                  </p>
                  {adjustQty !== 0 && (
                    <p className="text-xs text-gray-400 dark:text-[#71767B] dark:text-[#71767B] mt-1">
                      Nuevo stock: <span className={cn('font-bold', newStock === 0 ? 'text-red-600' : 'text-gray-900 dark:text-[#E7E9EA]')}>{newStock}</span>
                    </p>
                  )}
                </div>
                <button onClick={() => setAdjustQty((prev) => prev + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => setShowAdjust(null)} className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">CANCELAR</button>
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
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-[#16181C] border-l border-gray-200 dark:border-[#2F3336] z-50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-[#2F3336] px-6 py-4">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-[#E7E9EA]">Kardex</h3>
                <p className="text-xs text-gray-400 dark:text-[#71767B]">{kardexItemName}</p>
              </div>
              <button onClick={() => setKardexItemId(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1D1F23] transition-colors">
                <X className="h-5 w-5 text-gray-400 dark:text-[#71767B]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {kardexLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : kardexData.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-8 w-8 text-gray-300 dark:text-[#2F3336] mx-auto mb-3" />
                  <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin movimientos registrados</p>
                </div>
              ) : (
                <div className="relative space-y-3">
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-[#2F3336]" />
                  {kardexData.map((mov) => {
                    const config = kardexTipoConfig[mov.tipo] || kardexTipoConfig.AJUSTE;
                    const Icon = config.icon;
                    return (
                      <div key={mov.id} className="relative flex items-start gap-3">
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336]">
                          <Icon className={cn('h-4 w-4', config.text)} />
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] p-3">
                          <div className="flex items-center justify-between">
                            <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', config.bg, config.text)}>
                              {mov.tipo.replace('_', ' ')}
                            </span>
                            <span className={cn('text-sm font-extrabold', mov.tipo.startsWith('SALIDA') ? 'text-red-600' : 'text-emerald-600')}>
                              {mov.tipo.startsWith('SALIDA') ? '-' : '+'}{mov.cantidad}
                            </span>
                          </div>
                          {mov.motivo && (
                            <p className="mt-1.5 text-xs text-gray-500 dark:text-[#71767B]">{mov.motivo}</p>
                          )}
                          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-400 dark:text-[#71767B]">
                            {mov.usuarios?.nombre_completo && <span>{mov.usuarios.nombre_completo}</span>}
                            <span>{new Date(mov.created_at).toLocaleString('es-MX')}</span>
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
