'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import LenteForm from '@/components/inventario/LenteForm';

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

export default function EditarLentePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [lente, setLente] = useState<LenteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchLente() {
      try {
        const res = await fetch(`/api/inventario?id=${id}`);
        if (!res.ok) throw new Error('Lente no encontrado');
        const found: RawLente = await res.json();
        setLente({
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
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar');
      } finally {
        setLoading(false);
      }
    }
    fetchLente();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto" />
          <p className="text-sm text-gray-400">Cargando lente...</p>
        </div>
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
