'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Search, Edit3, Trash2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoriasLentesConfigData } from '@/data/config';

export default function CategoriasLentesPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      categoriasLentesConfigData.filter((c) =>
        c.nombre.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
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
