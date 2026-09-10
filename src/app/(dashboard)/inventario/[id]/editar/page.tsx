'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import LenteForm from '@/components/inventario/LenteForm';

export default function EditarLentePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [lente, setLente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchLente() {
      try {
        const res = await fetch('/api/inventario');
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.data || [];
        const found = items.find((l: any) => l.id === id);
        if (!found) throw new Error('Lente no encontrado');
        setLente({
          id: found.id,
          marca: found.marca || '',
          modelo: found.modelo || '',
          categoria_id: found.categoria_id || '',
          proveedor_id: found.proveedor_id || '',
          codigo_barras: found.codigo_barras || '',
          grado_esferico: found.grado_esferico?.toString() || '',
          grado_cilindrico: found.grado_cilindrico?.toString() || '',
          eje: found.eje?.toString() || '',
          material: found.material || '',
          color: found.color || '',
          stock: found.stock?.toString() || '0',
          stock_minimo: found.stock_minimo?.toString() || '5',
          precio_compra: found.precio_compra?.toString() || '',
          precio_venta: found.precio_venta?.toString() || '',
          lote: found.lote || '',
          fecha_caducidad: found.fecha_caducidad || '',
          notas: found.notas || '',
        });
      } catch (err: any) {
        setError(err.message || 'Error al cargar');
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
