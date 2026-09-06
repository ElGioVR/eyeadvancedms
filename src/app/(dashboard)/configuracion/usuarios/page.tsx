'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  X,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colaboradoresData } from '@/data/usuarios';
import type { Colaborador } from '@/types';

const ITEMS_PER_PAGE = 5;

export default function UsuariosPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<Colaborador | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const filtered = useMemo(
    () =>
      colaboradoresData.filter(
        (c) =>
          c.nombre.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
  }, []);

  const handlePrevPage = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const handleEditUser = useCallback((user: Colaborador) => {
    setEditingUser(user);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setEditingUser(null);
  }, []);

  const togglePassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar usuario por nombre o email..."
              className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
            <Plus className="h-4 w-4" />
            NUEVO USUARIO
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Colaborador</th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Rol Clínico</th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Último Acceso</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((user) => (
                <tr key={user.id} className={cn('group transition-colors hover:bg-gray-50/60', editingUser?.id === user.id && 'bg-primary-50/40')}>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', user.avatarColor)}>{user.iniciales}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900">{user.nombre}</div>
                        <div className="text-xs text-gray-400 truncate">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <span className={cn('inline-flex rounded-md px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset', user.rolColor)}>{user.rol}</span>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold', user.estado === 'ACTIVO' ? 'text-emerald-600' : 'text-gray-400')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', user.estado === 'ACTIVO' ? 'bg-emerald-500' : 'bg-gray-300')} />
                      {user.estado}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 text-sm text-gray-500">{user.ultimoAcceso}</td>
                  <td className="px-4 sm:px-6 py-4">
                    <button onClick={() => handleEditUser(user)} className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors">Editar</button>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr><td colSpan={5} className="px-4 sm:px-6 py-12 text-center">
                  <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">No se encontraron usuarios</p>
                </td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-4 sm:px-6 py-3">
            <span className="hidden sm:inline text-sm text-gray-400">Mostrando {paginated.length} de {filtered.length} usuarios</span>
            <span className="sm:hidden text-sm text-gray-400">{paginated.length}/{filtered.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={handlePrevPage} disabled={page === 1} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Anterior</span>
              </button>
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => handlePageChange(p)} className={cn('h-8 w-8 rounded-md text-sm font-bold transition-colors', p === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>{p}</button>
                ))}
              </div>
              <span className="sm:hidden text-sm font-medium text-gray-600 px-2">{page}/{totalPages}</span>
              <button onClick={handleNextPage} disabled={page === totalPages} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <span className="hidden sm:inline">Siguiente</span><ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit sidebar - overlay on mobile, sidebar on desktop */}
      {editingUser && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Editar Colaborador</h3>
              <button onClick={handleCloseSidebar} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex justify-center">
                <div className={cn('flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white', editingUser.avatarColor)}>{editingUser.iniciales}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre Completo</label>
                <input type="text" defaultValue={editingUser.nombre} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                <input type="email" defaultValue={editingUser.email} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Rol en el Sistema</label>
                <select defaultValue={editingUser.rol} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                  <option value="DOCTOR">Doctor (Médico Especialista)</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="RECEPCIONISTA">Recepcionista</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Contraseña Temporal</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} defaultValue="••••••••••••" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                  <button type="button" onClick={togglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Estado del Colaborador</label>
                    <p className="text-xs text-gray-400 mt-0.5">Permitir acceso al sistema clínico</p>
                  </div>
                  <button className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors', editingUser.estado === 'ACTIVO' ? 'bg-emerald-500' : 'bg-gray-300')}>
                    <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform', editingUser.estado === 'ACTIVO' ? 'translate-x-5.5' : 'translate-x-0.5')} />
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleCloseSidebar} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
                <button className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">GUARDAR CAMBIOS</button>
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
