'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { ParsedLabel } from '@/lib/parseLabel';

const LabelScanner = dynamic(() => import('./LabelScanner'), { ssr: false });

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.manufacturer.trim()) errs.manufacturer = 'El fabricante es obligatorio';
    if (!form.model.trim()) errs.model = 'El modelo es obligatorio';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const handleLabelParsed = useCallback((data: ParsedLabel) => {
    // Los <input type="number"> rechazan "+23.5": se quita el signo +
    const num = (v: string) => (v || '').replace(/^\+/, '');
    setForm((prev) => ({
      ...prev,
      manufacturer: data.manufacturer || prev.manufacturer,
      product_name: data.product_name || prev.product_name,
      model: data.model || prev.model,
      sphere: num(data.sphere) || prev.sphere,
      cylinder: num(data.cylinder) || prev.cylinder,
      add_intermediate: num(data.add_intermediate) || prev.add_intermediate,
      add_near: num(data.add_near) || prev.add_near,
      nozzle: data.nozzle || prev.nozzle,
      serial_number: data.serial_number || prev.serial_number,
      expiration_date: data.expiration_date || prev.expiration_date,
      barcode: data.barcode || prev.barcode,
      barcode_format: data.barcode_format || prev.barcode_format,
    }));
    toast('Datos de la etiqueta aplicados al formulario');
  }, [toast]);

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      // Solo se guardan los datos de la etiqueta. Cada foto = una pieza (serie única).
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
        precio_venta: form.precio_venta ? Number(form.precio_venta) : null,
      };
      if (mode === 'create') {
        payload.stock = 1;
        payload.stock_minimo = 0;
      }

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

      if (mode === 'edit') toast('Lente actualizado correctamente');
      else if (data.fusionado) toast(`Ya existía ${data.folio || 'este lente'}: se sumó ${data.agregado ?? 1} al stock (ahora ${data.stock})`);
      else toast('Lente registrado correctamente');
      router.push('/inventario');
    } catch {
      setErrors({ general: 'Error de conexion' });
    } finally {
      setSaving(false);
    }
  }

  const input =
    'block h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted shadow-soft transition-colors focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 dark:bg-surface-2';
  const inputErr = cn(input, 'border-red-400 focus:border-red-500 focus:ring-red-500/15');
  const etiqueta = 'mb-1 block text-[13px] font-medium text-fg-2';
  const seccion = 'mb-3 text-xs font-semibold uppercase tracking-wider text-muted';

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-20 lg:pb-0">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Link
          href="/inventario"
          aria-label="Volver"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-fg-2 shadow-soft transition-colors hover:bg-surface-2 dark:shadow-none"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-fg">
            {mode === 'edit' ? 'Editar lente' : 'Nuevo lente'}
          </h1>
          <p className="text-sm text-muted">
            {mode === 'edit' ? 'Corrige los datos de la etiqueta' : 'Toma la foto de la etiqueta y revisa los datos'}
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary hidden sm:inline-flex">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {errors.general && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0" /> {errors.general}
        </div>
      )}

      {/* Foto de la etiqueta (solo al crear) */}
      {mode === 'create' && <LabelScanner onParsed={handleLabelParsed} />}

      {/* Datos de la etiqueta */}
      <section className="card space-y-6">
        <div>
          <h3 className={seccion}>Lente</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={etiqueta}>Fabricante <span className="text-red-500">*</span></label>
              <input type="text" value={form.manufacturer} onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))} placeholder="Alcon" className={errors.manufacturer ? inputErr : input} />
              {errors.manufacturer && <p className="mt-1 text-xs text-red-500">{errors.manufacturer}</p>}
            </div>
            <div>
              <label className={etiqueta}>Modelo <span className="text-red-500">*</span></label>
              <input type="text" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value.toUpperCase() }))} placeholder="CNATT2" className={errors.model ? inputErr : input} />
              {errors.model && <p className="mt-1 text-xs text-red-500">{errors.model}</p>}
            </div>
            <div>
              <label className={etiqueta}>Producto</label>
              <input type="text" value={form.product_name} onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))} placeholder="Clareon PanOptix Toric IOL" className={input} />
            </div>
            <div>
              <label className={etiqueta}>Precio</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.precio_venta}
                  onChange={(e) => setForm((p) => ({ ...p, precio_venta: e.target.value }))}
                  className={cn(input, 'pl-7')}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className={seccion}>Graduación</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className={etiqueta}>Esfera (D)</label>
              <input type="number" inputMode="decimal" step="0.25" placeholder="23.5" value={form.sphere} onChange={(e) => setForm((p) => ({ ...p, sphere: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={etiqueta}>Cilindro (D)</label>
              <input type="number" inputMode="decimal" step="0.25" placeholder="1.00" value={form.cylinder} onChange={(e) => setForm((p) => ({ ...p, cylinder: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={etiqueta}>ADD interm.</label>
              <input type="number" inputMode="decimal" step="0.01" placeholder="2.17" value={form.add_intermediate} onChange={(e) => setForm((p) => ({ ...p, add_intermediate: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={etiqueta}>ADD cerca</label>
              <input type="number" inputMode="decimal" step="0.01" placeholder="3.25" value={form.add_near} onChange={(e) => setForm((p) => ({ ...p, add_near: e.target.value }))} className={input} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={etiqueta}>Nozzle</label>
              <input type="text" maxLength={3} placeholder="D" value={form.nozzle} onChange={(e) => setForm((p) => ({ ...p, nozzle: e.target.value.toUpperCase() }))} className={input} />
            </div>
          </div>
        </div>

        <div>
          <h3 className={seccion}>Trazabilidad</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={etiqueta}>Número de serie</label>
              <input type="text" inputMode="numeric" placeholder="26169559028" value={form.serial_number} onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={etiqueta}>Caducidad</label>
              <input type="date" value={form.expiration_date} onChange={(e) => setForm((p) => ({ ...p, expiration_date: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={etiqueta}>Código de barras</label>
              <input type="text" placeholder="Se llena con la foto" value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={etiqueta}>Formato del código</label>
              <input type="text" placeholder="CODE_128" value={form.barcode_format} onChange={(e) => setForm((p) => ({ ...p, barcode_format: e.target.value.toUpperCase() }))} className={input} />
            </div>
          </div>
        </div>
      </section>

      {/* Guardar fijo abajo en móvil */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line/70 glass p-3 sm:hidden">
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Guardar lente'}
        </button>
      </div>
    </div>
  );
}
