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

interface LenteData {
  id?: string;
  marca: string;
  modelo: string;
  categoria_id: string;
  proveedor_id: string;
  codigo_barras: string;
  grado_esferico: string;
  grado_cilindrico: string;
  eje: string;
  material: string;
  color: string;
  stock: string;
  stock_minimo: string;
  precio_compra: string;
  precio_venta: string;
  lote: string;
  fecha_caducidad: string;
  notas: string;
}

const emptyForm: LenteData = {
  marca: '', modelo: '', categoria_id: '', proveedor_id: '',
  codigo_barras: '', grado_esferico: '', grado_cilindrico: '', eje: '',
  material: '', color: '', stock: '', stock_minimo: '',
  precio_compra: '', precio_venta: '', lote: '', fecha_caducidad: '', notas: '',
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

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.marca.trim()) errs.marca = 'La marca es obligatoria';
    if (!form.modelo.trim()) errs.modelo = 'El modelo es obligatorio';
    if (form.eje && (Number(form.eje) < 0 || Number(form.eje) > 180)) errs.eje = 'El eje debe ser entre 0 y 180';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const handleLabelParsed = useCallback((data: ParsedLabel) => {
    setForm((prev) => ({
      ...prev,
      marca: data.marca || prev.marca,
      modelo: data.modelo || prev.modelo,
      grado_esferico: data.esferico || prev.grado_esferico,
      grado_cilindrico: data.cilindrico || prev.grado_cilindrico,
      eje: data.eje || prev.eje,
      material: data.material || prev.material,
      color: data.color || prev.color,
      codigo_barras: data.codigo_barras || prev.codigo_barras,
      lote: data.lote || prev.lote,
      fecha_caducidad: data.caducidad || prev.fecha_caducidad,
    }));
    toast('Datos de la etiqueta aplicados al formulario');
  }, [toast]);

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        codigo_barras: form.codigo_barras || null,
        grado_esferico: form.grado_esferico ? Number(form.grado_esferico) : null,
        grado_cilindrico: form.grado_cilindrico ? Number(form.grado_cilindrico) : null,
        eje: form.eje ? Number(form.eje) : null,
        color: form.color || null,
        material: form.material || null,
        stock: form.stock ? Number(form.stock) : 0,
        stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : 5,
        precio_compra: form.precio_compra ? Number(form.precio_compra) : null,
        precio_venta: form.precio_venta ? Number(form.precio_venta) : null,
        lote: form.lote || null,
        fecha_caducidad: form.fecha_caducidad || null,
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

  const input = 'block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const inputErr = input.replace('border-gray-200', 'border-red-300').replace('focus:border-primary-500', 'focus:border-red-500').replace('focus:ring-primary-500', 'focus:ring-red-500');

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Link
          href="/inventario"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            {mode === 'edit' ? 'EDITAR LENTE' : 'NUEVO LENTE'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">
            {mode === 'edit' ? 'Modifique las especificaciones del lente' : 'Registre las especificaciones del lente en el inventario'}
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
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Identificacion</h3>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Marca <span className="text-red-500">*</span></label>
                  <input type="text" value={form.marca} onChange={(e) => setForm((p) => ({ ...p, marca: e.target.value }))} placeholder="Ej. Alcon, Zeiss, Essilor" className={errors.marca ? inputErr : input} />
                  {errors.marca && <p className="text-xs text-red-600 mt-1">{errors.marca}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Modelo <span className="text-red-500">*</span></label>
                  <input type="text" value={form.modelo} onChange={(e) => setForm((p) => ({ ...p, modelo: e.target.value }))} placeholder="Ej. SN60WF, SmartLife" className={errors.modelo ? inputErr : input} />
                  {errors.modelo && <p className="text-xs text-red-600 mt-1">{errors.modelo}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Categoria</label>
                  <select value={form.categoria_id} onChange={(e) => setForm((p) => ({ ...p, categoria_id: e.target.value }))} className={input}>
                    <option value="">Sin categoria</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Proveedor</label>
                  <select value={form.proveedor_id} onChange={(e) => setForm((p) => ({ ...p, proveedor_id: e.target.value }))} className={input}>
                    <option value="">Sin proveedor</option>
                    {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Especificaciones refractivas */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Especificaciones Refractivas</h3>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Esf\u00e9rico (SE)</label>
                  <input type="number" step="0.25" placeholder="-20.00 a +20.00" value={form.grado_esferico} onChange={(e) => setForm((p) => ({ ...p, grado_esferico: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Cil\u00edndrico (CYL)</label>
                  <input type="number" step="0.25" placeholder="0 a -6.00" value={form.grado_cilindrico} onChange={(e) => setForm((p) => ({ ...p, grado_cilindrico: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Eje</label>
                  <input type="number" min="0" max="180" placeholder="0-180" value={form.eje} onChange={(e) => setForm((p) => ({ ...p, eje: e.target.value }))} className={errors.eje ? inputErr : input} />
                  {errors.eje && <p className="text-xs text-red-600 mt-1">{errors.eje}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Material</label>
                  <input type="text" placeholder="Acrilico, Policarbonato" value={form.material} onChange={(e) => setForm((p) => ({ ...p, material: e.target.value }))} className={input} />
                </div>
              </div>
            </div>
          </div>

          {/* Detalles */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Detalles</h3>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Color</label>
                  <input type="text" placeholder="Transparente" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Codigo de Barras</label>
                  <input type="text" placeholder="7501234567890" value={form.codigo_barras} onChange={(e) => setForm((p) => ({ ...p, codigo_barras: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Lote</label>
                  <input type="text" placeholder="L-2024-001" value={form.lote} onChange={(e) => setForm((p) => ({ ...p, lote: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Caducidad</label>
                  <input type="date" value={form.fecha_caducidad} onChange={(e) => setForm((p) => ({ ...p, fecha_caducidad: e.target.value }))} className={input} />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))} placeholder="Observaciones adicionales..." rows={3} className={input} />
              </div>
            </div>
          </div>
        </div>

        {/* Right column - stock & pricing */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Stock</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Stock Inicial</label>
                <input type="number" min="0" placeholder="0" value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} className={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Stock M\u00ednimo</label>
                <input type="number" min="0" placeholder="5" value={form.stock_minimo} onChange={(e) => setForm((p) => ({ ...p, stock_minimo: e.target.value }))} className={input} />
                <p className="text-xs text-gray-400 mt-1">Alerta cuando el stock baje de esta cantidad</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Costos</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Precio de Compra ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.precio_compra} onChange={(e) => setForm((p) => ({ ...p, precio_compra: e.target.value }))} className={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Precio de Venta ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.precio_venta} onChange={(e) => setForm((p) => ({ ...p, precio_venta: e.target.value }))} className={input} />
              </div>
              {form.precio_compra && form.precio_venta && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="text-xs font-bold text-gray-400">Margen</span>
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
                <p className="text-sm font-extrabold text-gray-900">
                  {form.marca || 'Marca'} {form.modelo || 'Modelo'}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  {form.grado_esferico && <span>SE: {form.grado_esferico}</span>}
                  {form.grado_cilindrico && <span>CYL: {form.grado_cilindrico}</span>}
                  {form.eje && <span>Eje: {form.eje}\u00b0</span>}
                  {form.material && <span>\u00b7 {form.material}</span>}
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gray-400">Stock</span>
                    <p className={cn('text-sm font-extrabold', Number(form.stock) === 0 ? 'text-red-600' : 'text-gray-900')}>
                      {form.stock || '0'} pzas
                    </p>
                  </div>
                  {form.precio_venta && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-gray-400">Venta</span>
                      <p className="text-sm font-extrabold text-gray-900">${Number(form.precio_venta).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="w-full rounded-lg bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Guardando...' : mode === 'edit' ? 'ACTUALIZAR LENTE' : 'GUARDAR LENTE'}
          </button>
        </div>
      </div>
    </div>
  );
}
