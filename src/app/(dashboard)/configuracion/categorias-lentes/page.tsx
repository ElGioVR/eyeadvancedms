'use client';

import { useState } from 'react';
import { Plus, Search, Edit3, Trash2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const categorias = [
  { id: 1, nombre: 'Lente Monofocal', descripcion: 'Corrige un solo punto visual (miopía o hipermetropía)', stock: 156, color: 'bg-sky-500', estado: 'ACTIVO' },
  { id: 2, nombre: 'Lente Bifocal', descripcion: 'Corrige visión de cerca y lejos con dos zonas', stock: 89, color: 'bg-primary-500', estado: 'ACTIVO' },
  { id: 3, nombre: 'Lente Progresivo', descripcion: 'Transición gradual sin líneas visibles', stock: 67, color: 'bg-purple-500', estado: 'ACTIVO' },
  { id: 4, nombre: 'Lente de Contacto', descripcion: 'Lente tórica y esférica de contacto', stock: 234, color: 'bg-emerald-500', estado: 'ACTIVO' },
  { id: 5, nombre: 'Mica Policarbonato', descripcion: 'Material resistente a impactos, ideal para niños', stock: 312, color: 'bg-amber-500', estado: 'ACTIVO' },
  { id: 6, nombre: 'Mica Trivex', descripcion: 'Ligera y resistente, mejor óptica que policarbonato', stock: 45, color: 'bg-rose-500', estado: 'ACTIVO' },
  { id: 7, nombre: 'Lente Fotocromático', descripcion: 'Se oscurece con la luz solar', stock: 78, color: 'bg-cyan-500', estado: 'ACTIVO' },
  { id: 8, nombre: 'Antirreflejante', descripcion: 'Tratamiento para reducir reflejos', stock: 0, color: 'bg-gray-400', estado: 'SIN STOCK' },
];

export default function CategoriasLentesPage() {
  const [search, setSearch] = useState('');
  const filtered = categorias.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar categoría..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
          <Plus className="h-4 w-4" />
          NUEVA CATEGORÍA
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Categoría</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Descripción</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((cat) => (
              <tr key={cat.id} className="group transition-colors hover:bg-gray-50/60">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', cat.color)}>
                      <Package className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">{cat.nombre}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">{cat.descripcion}</td>
                <td className="px-6 py-4">
                  <span className={cn('text-sm font-bold', cat.stock > 0 ? 'text-gray-900' : 'text-gray-400')}>{cat.stock}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold', cat.stock > 0 ? 'text-emerald-600' : 'text-gray-400')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', cat.stock > 0 ? 'bg-emerald-500' : 'bg-gray-300')} />
                    {cat.stock > 0 ? 'ACTIVO' : 'SIN STOCK'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button className="text-gray-400 hover:text-primary-600 transition-colors"><Edit3 className="h-4 w-4" /></button>
                    <button className="text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
