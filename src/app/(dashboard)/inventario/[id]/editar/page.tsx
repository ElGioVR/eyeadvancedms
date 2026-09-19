'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import LenteForm from '@/components/inventario/LenteForm';

interface LenteData {
  id: string;
  tipo: string;
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
  potencia_dioptrias: string;
  tipo_lio: string;
  modelo_fabricante: string;
}

interface RawLente {
  id: string;
  tipo: string;
  marca: string;
  modelo: string;
  categoria_id: string | null;
  proveedor_id: string | null;
  codigo_barras: string | null;
  grado_esferico: number | null;
  grado_cilindrico: number | null;
  eje: number | null;
  material: string | null;
  color: string | null;
  stock: number;
  stock_minimo: number;
  precio_compra: number | null;
  precio_venta: number | null;
  lote: string | null;
  fecha_caducidad: string | null;
  notas: string | null;
  potencia_dioptrias: number | null;
  tipo_lio: string | null;
  modelo_fabricante: string | null;
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
          tipo: found.tipo || 'LENTE_VISION',
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
          potencia_dioptrias: found.potencia_dioptrias?.toString() || '',
          tipo_lio: found.tipo_lio || '',
          modelo_fabricante: found.modelo_fabricante || '',
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
