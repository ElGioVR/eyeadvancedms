'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Search, Edit3, Trash2, Truck, Mail, Phone, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { proveedoresConfigData } from '@/data/config';

export default function ProveedoresPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      proveedoresConfigData.filter((p) =>
        p.nombre.toLowerCase().includes(search.toLowerCase())
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
            placeholder="Buscar proveedor..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
          <Plus className="h-4 w-4" />
          NUEVO PROVEEDOR
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className={cn('h-1.5 w-full', p.color)} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-white', p.color)}>
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{p.nombre}</h3>
                    <p className="text-xs text-gray-400">{p.especialidad}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="text-gray-400 hover:text-primary-600 transition-colors"><Edit3 className="h-4 w-4" /></button>
                  <button className="text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700 ring-1 ring-primary-200">
                  {p.contactos} productos
                </span>
              </div>
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" /><span className="truncate">{p.email}</span></div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" /><span>{p.telefono}</span></div>
                <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-gray-400" /><span>{p.web}</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
