'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Search, Edit3, Eye, Phone, Mail, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doctoresConfigData } from '@/data/doctores';

export default function DoctoresPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      doctoresConfigData.filter(
        (d) =>
          d.nombre.toLowerCase().includes(search.toLowerCase()) ||
          d.especialidad.toLowerCase().includes(search.toLowerCase())
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
            placeholder="Buscar doctor por nombre o especialidad..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
          <Plus className="h-4 w-4" />
          NUEVO DOCTOR
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((doc) => (
          <div key={doc.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white', doc.color)}>
                  {doc.iniciales}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{doc.nombre}</h3>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Stethoscope className="h-3 w-3" />
                    {doc.especialidad}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Céd. {doc.cedula}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <div className="text-lg font-extrabold text-gray-900">{doc.consultas}</div>
                  <div className="text-[10px] text-gray-400 uppercase font-semibold">Consultas</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <div className="text-lg font-extrabold text-gray-900">{doc.aseguranzas.length}</div>
                  <div className="text-[10px] text-gray-400 uppercase font-semibold">Aseguranzas</div>
                </div>
              </div>

              {/* Aseguranzas */}
              <div className="flex flex-wrap gap-1 mb-4">
                {doc.aseguranzas.map((a) => (
                  <span key={a} className="rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700 ring-1 ring-primary-100">
                    {a}
                  </span>
                ))}
              </div>

              {/* Contact */}
              <div className="space-y-1.5 text-xs text-gray-500 border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" /><span className="truncate">{doc.email}</span></div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" /><span>{doc.telefono}</span></div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                  <Eye className="h-3.5 w-3.5" />
                  Ver Perfil
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
