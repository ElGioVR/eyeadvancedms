'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft } from 'lucide-react';
import LenteForm from '@/components/inventario/LenteForm';
import Skeleton from '@/components/ui/Skeleton';

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

interface RawLente {
  id: string;
  manufacturer: string;
  product_name: string;
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
  precio_compra: number | null;
  precio_venta: number | null;
  lote: string | null;
  notas: string | null;
  categoria_id: string | null;
  proveedor_id: string | null;
}

function aFormulario(found: RawLente): LenteData {
  return {
    id: found.id,
    manufacturer: found.manufacturer || '',
    product_name: found.product_name || '',
    model: found.model || '',
    sphere: found.sphere?.toString() || '',
    cylinder: found.cylinder?.toString() || '',
    add_intermediate: found.add_intermediate?.toString() || '',
    add_near: found.add_near?.toString() || '',
    nozzle: found.nozzle || '',
    serial_number: found.serial_number || '',
    expiration_date: found.expiration_date || '',
    barcode: found.barcode || '',
    barcode_format: found.barcode_format || '',
    stock: found.stock?.toString() || '0',
    stock_minimo: found.stock_minimo?.toString() || '5',
    precio_compra: found.precio_compra?.toString() || '',
    precio_venta: found.precio_venta?.toString() || '',
    lote: found.lote || '',
    notas: found.notas || '',
    categoria_id: found.categoria_id || '',
    proveedor_id: found.proveedor_id || '',
  };
}

export default function EditarLentePage() {
  const params = useParams();
  const id = params.id as string;
  const { data: found, error: swrError, isValidating } = useSWR<RawLente>(id ? `/api/inventario?id=${encodeURIComponent(id)}` : null, {
    // El formulario toma los datos al montarse: no revalidar mientras se edita.
    revalidateOnFocus: false,
  });
  const lente = useMemo(() => (found?.id ? aFormulario(found) : null), [found]);
  const error = swrError ? (swrError instanceof Error ? swrError.message : 'Error al cargar') : '';

  // El formulario copia los datos al montarse: se espera a la versión fresca del
  // servidor (la caché podría ser de antes de la última edición) y luego ya no se re-monta.
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!listo && !isValidating && (lente || swrError)) setListo(true);
  }, [listo, isValidating, lente, swrError]);

  if (!listo) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 animate-fadeIn" aria-busy="true" aria-label="Cargando lente">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <Skeleton className="h-3 w-32" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-11 w-full rounded-xl" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !lente) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-sm font-bold text-red-600">{error || 'Lente no encontrado'}</p>
          <Link href="/inventario" className="inline-flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-800">
            <ArrowLeft className="h-4 w-4" /> Volver al inventario
          </Link>
        </div>
      </div>
    );
  }

  return <LenteForm mode="edit" initialData={lente} />;
}
