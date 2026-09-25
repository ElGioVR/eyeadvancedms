'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Save,
  Loader2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { ParsedLabel } from '@/lib/parseLabel';

const LabelScanner = dynamic(() => import('./LabelScanner'), { ssr: false });

interface CatProv {
  id: string;
  nombre: string;
}

// Auto-suggest: when user types a manufacturer, suggest matching categoria/proveedor
const suggestFromManufacturer = (manufacturer: string, cats: CatProv[], provs: CatProv[]): { categoriaId?: string; proveedorId?: string } => {
  const lower = manufacturer.toLowerCase().trim();
  if (!lower) return {};

  const catMatch = cats.find((c) => c.nombre.toLowerCase().includes(lower));
  const provMatch = provs.find((p) => p.nombre.toLowerCase().includes(lower));

  return {
    categoriaId: catMatch?.id,
    proveedorId: provMatch?.id,
  };
};

interface LenteData {
  id?: string;
  manufacturer: string;
  product_name: string;
  model: string;
  sphere: string;
  cylinder: string;
  add_intermediate: string;
  add_near: string;
  nozzle: string;
  serial_number: string;
  expiration_date: string;
  barcode: string;
  barcode_format: string;
  stock: string;
  stock_minimo: string;
  precio_compra: string;
  precio_venta: string;
  lote: string;
  notas: string;
  categoria_id: string;
  proveedor_id: string;
}

const emptyForm: LenteData = {
  manufacturer: '',
  product_name: '',
  model: '',
  sphere: '',
  cylinder: '',
  add_intermediate: '',
  add_near: '',
  nozzle: '',
  serial_number: '',
  expiration_date: '',
  barcode: '',
  barcode_format: '',
  stock: '',
  stock_minimo: '',
  precio_compra: '',
  precio_venta: '',
  lote: '',
  notas: '',
  categoria_id: '',
  proveedor_id: '',
};

interface LenteFormProps {
  initialData?: LenteData;
  mode: 'create' | 'edit';
}

export default function LenteForm({ initialData, mode }: LenteFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<LenteData>(initialData || emptyForm);
  const [cats, setCats] = useState<CatProv[]>([]);
  const [provs, setProvs] = useState<CatProv[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/configuracion/categorias-lentes').then((r) => r.json()).then(setCats).catch(() => {});
    fetch('/api/configuracion/proveedores').then((r) => r.json()).then(setProvs).catch(() => {});
  }, []);

  useEffect(() => {
    const suggestion = suggestFromManufacturer(form.manufacturer, cats, provs);
    setForm((p) => ({
      ...p,
      ...(suggestion.categoriaId ? { categoria_id: suggestion.categoriaId } : {}),
      ...(suggestion.proveedorId ? { proveedor_id: suggestion.proveedorId } : {}),
    }));
  }, [form.manufacturer, cats, provs]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.manufacturer.trim()) errs.manufacturer = 'El fabricante es obligatorio';
    if (!form.model.trim()) errs.model = 'El modelo es obligatorio';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const handleLabelParsed = useCallback((data: ParsedLabel) => {
    setForm((prev) => ({
      ...prev,
      manufacturer: data.manufacturer || prev.manufacturer,
      product_name: data.product_name || prev.product_name,
      model: data.model || prev.model,
      sphere: data.sphere || prev.sphere,
      cylinder: data.cylinder || prev.cylinder,
      add_intermediate: data.add_intermediate || prev.add_intermediate,
      add_near: data.add_near || prev.add_near,
      nozzle: data.nozzle || prev.nozzle,
      serial_number: data.serial_number || prev.serial_number,
      expiration_date: data.expiration_date || prev.expiration_date,
      barcode: data.barcode || prev.barcode,
      categoria_id: prev.categoria_id || (() => {
        // category is derived, not extracted - we'll set it based on product type
        return prev.categoria_id;
      })(),
    }));
    toast('Datos de la etiqueta aplicados al formulario');
  }, [toast]);

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        manufacturer: form.manufacturer.trim(),
        product_name: form.product_name.trim(),
        model: form.model.trim(),
        sphere: form.sphere ? Number(form.sphere) : null,
        cylinder: form.cylinder ? Number(form.cylinder) : null,
        add_intermediate: form.add_intermediate ? Number(form.add_intermediate) : null,
        add_near: form.add_near ? Number(form.add_near) : null,
        nozzle: form.nozzle || null,
        serial_number: form.serial_number || null,
        expiration_date: form.expiration_date || null,
        barcode: form.barcode || null,
        barcode_format: form.barcode_format || null,
        stock: form.stock ? Number(form.stock) : 0,
        stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : 5,
        precio_compra: form.precio_compra ? Number(form.precio_compra) : null,
        precio_venta: form.precio_venta ? Number(form.precio_venta) : null,
        lote: form.lote || null,
        notas: form.notas || null,
        categoria_id: form.categoria_id || null,
        proveedor_id: form.proveedor_id || null,
      };

      const res = await fetch('/api/inventario', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: mode === 'edit' ? JSON.stringify({ id: initialData?.id, ...payload }) : JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrors({ general: data.error || 'Error al guardar' });
        return;
      }

      toast(mode === 'edit' ? 'Lente actualizado correctamente' : 'Lente registrado correctamente');
      router.push('/inventario');
    } catch {
      setErrors({ general: 'Error de conexion' });
    } finally {
      setSaving(false);
    }
  }

  const input = 'block w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder-gray-400 dark:placeholder-[#71767B] shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const inputErr = input.replace('border-gray-200', 'border-red-300').replace('focus:border-primary-500', 'focus:border-red-500').replace('focus:ring-primary-500', 'focus:ring-red-500');

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Link
          href="/inventario"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-[#E7E9EA]">
            {mode === 'edit' ? 'EDITAR ÍTEM' : 'NUEVO ÍTEM DE INVENTARIO'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-400 dark:text-[#71767B]">
            {mode === 'edit' ? 'Modifique las especificaciones del ítem' : 'Registre un lente de visión o intraocular en el inventario'}
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando...' : mode === 'edit' ? 'ACTUALIZAR' : 'GUARDAR'}
        </button>
      </div>

      {errors.general && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" /> {errors.general}
        </div>
      )}

{/* Label Scanner - only show in create mode */}
      {mode === 'create' && (
        <LabelScanner onParsed={handleLabelParsed} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identificacion */}
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Identificacion</h3>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Fabricante <span className="text-red-500">*</span></label>
                  <input type="text" value={form.manufacturer} onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))} placeholder="Ej. Alcon, Zeiss, Essilor" className={errors.manufacturer ? inputErr : input} />
                  {errors.manufacturer && <p className="text-xs text-red-600 mt-1">{errors.manufacturer}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Producto</label>
                  <input type="text" value={form.product_name} onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))} placeholder="Ej. Clareon PanOptix Toric IOL" className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Modelo <span className="text-red-500">*</span></label>
                  <input type="text" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} placeholder="Ej. CNATT2" className={errors.model ? inputErr : input} />
                  {errors.model && <p className="text-xs text-red-600 mt-1">{errors.model}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Categoria</label>
                  <select value={form.categoria_id} onChange={(e) => setForm((p) => ({ ...p, categoria_id: e.target.value }))} className={input}>
                    <option value="">Sin categoria</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  {suggestFromManufacturer(form.manufacturer, cats, provs).categoriaId && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-[#71767B] capitalize">Sugerido: {cats.find((c) => c.id === suggestFromManufacturer(form.manufacturer, cats, provs)?.categoriaId)?.nombre || ''}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Proveedor</label>
                  <select value={form.proveedor_id} onChange={(e) => setForm((p) => ({ ...p, proveedor_id: e.target.value }))} className={input}>
                    <option value="">Sin proveedor</option>
                    {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  {suggestFromManufacturer(form.manufacturer, cats, provs).proveedorId && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-[#71767B] capitalize">Sugerido: {provs.find((p) => p.id === suggestFromManufacturer(form.manufacturer, cats, provs)?.proveedorId)?.nombre || ''}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Especificaciones Opticas */}
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Especificaciones Opticas</h3>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Esfera (D)</label>
                  <input type="number" step="0.25" placeholder="Ej. +23.50" value={form.sphere} onChange={(e) => setForm((p) => ({ ...p, sphere: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Cilindro (D)</label>
                  <input type="number" step="0.25" placeholder="Ej. 1.00" value={form.cylinder} onChange={(e) => setForm((p) => ({ ...p, cylinder: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Nozzle</label>
                  <input type="text" placeholder="Ej. D" value={form.nozzle} onChange={(e) => setForm((p) => ({ ...p, nozzle: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">ADD Intermedia (D)</label>
                  <input type="number" step="0.25" placeholder="Ej. 2.17" value={form.add_intermediate} onChange={(e) => setForm((p) => ({ ...p, add_intermediate: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">ADD Cercana (D)</label>
                  <input type="number" step="0.25" placeholder="Ej. 3.25" value={form.add_near} onChange={(e) => setForm((p) => ({ ...p, add_near: e.target.value }))} className={input} />
                </div>
              </div>
            </div>
          </div>

          {/* Trazabilidad */}
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Trazabilidad</h3>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Lote</label>
                  <input type="text" placeholder="L-2024-001" value={form.lote} onChange={(e) => setForm((p) => ({ ...p, lote: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Fecha Caducidad</label>
                  <input type="date" value={form.expiration_date} onChange={(e) => setForm((p) => ({ ...p, expiration_date: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Numero de Serie</label>
                  <input type="text" placeholder="Ej. 26169559028" value={form.serial_number} onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))} className={input} />
                </div>
              </div>
            </div>
          </div>

        {/* Codigo de Barras & Notas */}
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Codigo de Barras & Notas</h3>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Codigo de Barras</label>
                <input type="text" placeholder="7501234567890" value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))} className={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Formato de Codigo</label>
                <input type="text" placeholder="Ej. CODE_39, EAN_13" value={form.barcode_format} onChange={(e) => setForm((p) => ({ ...p, barcode_format: e.target.value }))} className={input} />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Notas</label>
              <textarea value={form.notas} onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))} placeholder="Observaciones adicionales..." rows={3} className={input} />
            </div>
</div>
          </div>
        </div>

        {/* Right column - stock & pricing */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Stock</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Stock Inicial</label>
                <input type="number" min="0" placeholder="0" value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} className={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Stock M\u00ednimo</label>
                <input type="number" min="0" placeholder="5" value={form.stock_minimo} onChange={(e) => setForm((p) => ({ ...p, stock_minimo: e.target.value }))} className={input} />
                <p className="text-xs text-gray-400 dark:text-[#71767B] mt-1">Alerta cuando el stock baje de esta cantidad</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Costos</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Precio de Compra ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.precio_compra} onChange={(e) => setForm((p) => ({ ...p, precio_compra: e.target.value }))} className={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B] mb-1.5">Precio de Venta ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.precio_venta} onChange={(e) => setForm((p) => ({ ...p, precio_venta: e.target.value }))} className={input} />
              </div>
              {form.precio_compra && form.precio_venta && (
                <div className="rounded-lg bg-gray-50 dark:bg-[#202327] p-3">
                  <span className="text-xs font-bold text-gray-400 dark:text-[#71767B]">Margen</span>
                  <p className="text-lg font-extrabold text-emerald-600">
                    {((Number(form.precio_venta) - Number(form.precio_compra)) / Number(form.precio_compra) * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Preview card */}
          <div className="rounded-xl border border-primary-200 bg-primary-50/50 shadow-sm">
            <div className="px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary-700 mb-3">Vista Previa</h3>
              <div className="space-y-2">
                <p className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                  {form.manufacturer || 'Fabricante'} {form.model || 'Modelo'}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-[#71767B]">
                  {form.sphere && <span>Esfera: {form.sphere} D</span>}
                  {form.cylinder && <span>Cilindro: {form.cylinder} D</span>}
                  {form.add_intermediate && <span>ADD Int: {form.add_intermediate} D</span>}
                  {form.add_near && <span>ADD Cerc: {form.add_near} D</span>}
                  {form.nozzle && <span>Nozzle: {form.nozzle}</span>}
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">Stock</span>
                    <p className={cn('text-sm font-extrabold', Number(form.stock) === 0 ? 'text-red-600' : 'text-gray-900 dark:text-[#E7E9EA]')}>
                      {form.stock || '0'} pzas
                    </p>
                  </div>
                  {form.precio_venta && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-[#71767B]">Venta</span>
                      <p className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">${Number(form.precio_venta).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="w-full rounded-lg bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Guardando...' : mode === 'edit' ? 'ACTUALIZAR ÍTEM' : 'GUARDAR ÍTEM'}
          </button>
        </div>
      </div>
    </div>
  );
}
