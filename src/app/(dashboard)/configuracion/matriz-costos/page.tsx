"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Beaker,
  Scissors,
  Shield,
  DollarSign,
  X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";

const SECCIONES = [
  { key: "costos", label: "Costos Base", icon: DollarSign },
  { key: "estudios", label: "Estudios", icon: Beaker },
  { key: "procedimientos", label: "Procedimientos", icon: Scissors },
  { key: "coberturas", label: "Coberturas", icon: Shield },
];

const TIPO_CONSULTA: Record<string, string> = {
  CONSULTA: "Consulta",
  ESTUDIO: "Estudio",
  REVISION: "Revisión",
  PROCEDIMIENTO: "Procedimiento",
};

const TIPO_VISITA: Record<string, string> = {
  PRIMERA_VEZ: "Primera Vez",
  SUBSECUENTE: "Subsecuente",
};

interface MatrizCosto {
  id: string;
  tipo_consulta: string;
  tipo_visita: string;
  costo: number;
  descripcion: string | null;
  activo: boolean;
}
interface CatalogoEstudio {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  bilateral: boolean;
  activo: boolean;
}
interface CatalogoProcedimiento {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  por_ojo: boolean;
  activo: boolean;
}
interface Cobertura {
  id: string;
  aseguranza_id: string;
  aseguranza_nombre: string;
  porcentaje_cobertura: number;
  monto_maximo: number | null;
  aplica_estudios: boolean;
  aplica_procedimientos: boolean;
  activo: boolean;
}
interface Aseguranza {
  id: string;
  nombre: string;
}

export default function MatrizCostosPage() {
  const [seccion, setSeccion] = useState("costos");
  const [costos, setCostos] = useState<MatrizCosto[]>([]);
  const [estudios, setEstudios] = useState<CatalogoEstudio[]>([]);
  const [procedimientos, setProcedimientos] = useState<CatalogoProcedimiento[]>(
    [],
  );
  const [coberturas, setCoberturas] = useState<Cobertura[]>([]);
  const [aseguranzas, setAseguranzas] = useState<Aseguranza[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalTipo, setModalTipo] = useState<
    "estudio" | "procedimiento" | "cobertura" | "costo"
  >("estudio");
  const [editando, setEditando] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const [fNombre, setFNombre] = useState("");
  const [fDescripcion, setFDescripcion] = useState("");
  const [fCosto, setFCosto] = useState("");
  const [fBilateral, setFBilateral] = useState(true);
  const [fPorOjo, setFPorOjo] = useState(true);
  const [fActivo, setFActivo] = useState(true);
  const [fAseguranzaId, setFAseguranzaId] = useState("");
  const [fPorcentaje, setFPorcentaje] = useState("100");
  const [fMontoMax, setFMontoMax] = useState("");
  const [fAplicaEst, setFAplicaEst] = useState(true);
  const [fAplicaProc, setFAplicaProc] = useState(true);

  const [errorGlobal, setErrorGlobal] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setErrorGlobal("");
    try {
      const [c, e, p, co, a] = await Promise.all([
        fetch("/api/configuracion/matriz-costos").then((r) => r.json()),
        fetch("/api/configuracion/catalogo-estudios").then((r) => r.json()),
        fetch("/api/configuracion/catalogo-procedimientos").then((r) =>
          r.json(),
        ),
        fetch("/api/configuracion/coberturas-aseguranza").then((r) => r.json()),
        fetch("/api/configuracion/aseguranzas").then((r) => r.json()),
      ]);
      console.log("MATRIZ:", { costos: c.length, errores: { c: c.error, e: e.error } });
      if (c.error) setErrorGlobal(`Costos: ${c.error}`);
      if (e.error) setErrorGlobal((prev) => `${prev} Estudios: ${e.error}`);
      setCostos(Array.isArray(c) ? c : []);
      setEstudios(Array.isArray(e) ? e : []);
      setProcedimientos(Array.isArray(p) ? p : []);
      setCoberturas(Array.isArray(co) ? co : []);
      setAseguranzas(Array.isArray(a) ? a : []);
    } catch (err) {
      console.error("MATRIZ ERR:", err);
      setErrorGlobal("Error de conexion");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggleActivo = async (
    endpoint: string,
    id: string,
    activo: boolean,
  ) => {
    await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activo: !activo }),
    });
    cargar();
  };

  const eliminar = async (endpoint: string, id: string) => {
    await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    cargar();
  };

  const abrirCrear = (tipo: "estudio" | "procedimiento" | "cobertura") => {
    setModalTipo(tipo);
    setEditando(null);
    setFNombre("");
    setFDescripcion("");
    setFCosto("");
    setFBilateral(true);
    setFPorOjo(true);
    setFActivo(true);
    setFAseguranzaId("");
    setFPorcentaje("100");
    setFMontoMax("");
    setFAplicaEst(true);
    setFAplicaProc(true);
    setError("");
    setShowModal(true);
  };

  const abrirEditarCosto = (costo: MatrizCosto) => {
    setModalTipo("costo");
    setEditando(costo);
    setFCosto(String(costo.costo));
    setFDescripcion(costo.descripcion || "");
    setFActivo(costo.activo);
    setError("");
    setShowModal(true);
  };

  const abrirEditar = (tipo: "estudio" | "procedimiento", item: any) => {
    setModalTipo(tipo);
    setEditando(item);
    setFNombre(item.nombre);
    setFDescripcion(item.descripcion || "");
    setFCosto(String(item.costo));
    setFBilateral(item.bilateral ?? true);
    setFPorOjo(item.por_ojo ?? true);
    setFActivo(item.activo);
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setError("");
    if (modalTipo === "costo") {
      if (!fCosto || parseFloat(fCosto) < 0) {
        setError("Costo invalido");
        return;
      }
      setGuardando(true);
      const res = await fetch("/api/configuracion/matriz-costos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editando.id,
          costo: parseFloat(fCosto),
          descripcion: fDescripcion || null,
          activo: fActivo,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Error");
        setGuardando(false);
        return;
      }
    } else if (modalTipo === "cobertura") {
      if (!fAseguranzaId) {
        setError("Seleccione aseguranza");
        return;
      }
      setGuardando(true);
      const body = {
        aseguranza_id: fAseguranzaId,
        porcentaje_cobertura: parseFloat(fPorcentaje) || 100,
        monto_maximo: fMontoMax ? parseFloat(fMontoMax) : null,
        aplica_estudios: fAplicaEst,
        aplica_procedimientos: fAplicaProc,
      };
      const res = editando
        ? await fetch("/api/configuracion/coberturas-aseguranza", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editando.id, ...body }),
          })
        : await fetch("/api/configuracion/coberturas-aseguranza", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Error");
        setGuardando(false);
        return;
      }
    } else {
      if (!fNombre.trim()) {
        setError("Nombre requerido");
        return;
      }
      if (!fCosto || parseFloat(fCosto) < 0) {
        setError("Costo inválido");
        return;
      }
      setGuardando(true);
      const payload: any = {
        nombre: fNombre.trim(),
        descripcion: fDescripcion || null,
        costo: parseFloat(fCosto),
      };
      if (modalTipo === "estudio") {
        payload.bilateral = fBilateral;
        payload.activo = fActivo;
      } else {
        payload.por_ojo = fPorOjo;
        payload.activo = fActivo;
      }
      const endpoint =
        modalTipo === "estudio"
          ? "/api/configuracion/catalogo-estudios"
          : "/api/configuracion/catalogo-procedimientos";
      const res = editando
        ? await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editando.id, ...payload }),
          })
        : await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Error");
        setGuardando(false);
        return;
      }
    }
    setShowModal(false);
    cargar();
    setGuardando(false);
  };

  const costosFiltrados = costos;
  const estudiosFiltrados = estudios.filter(
    (e) => !search || e.nombre.toLowerCase().includes(search.toLowerCase()),
  );
  const procsFiltrados = procedimientos.filter(
    (p) => !search || p.nombre.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SECCIONES.map((s) => {
          const Icon = s.icon;
          const activo = seccion === s.key;
          return (
            <button
              key={s.key}
              onClick={() => {
                setSeccion(s.key);
                setSearch("");
              }}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${activo ? "bg-primary-600 text-white shadow-sm" : "bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#E7E9EA] dark:text-[#71767B] hover:bg-gray-50 dark:hover:bg-[#1D1F23] dark:bg-[#202327]"}`}
            >
              <Icon className="h-4 w-4" /> {s.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-gray-100 dark:bg-[#202327] animate-pulse"
            />
          ))}
        </div>
      ) : errorGlobal ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorGlobal}</div>
      ) : (
        <>
          {seccion === "costos" && (
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327]/50 dark:bg-[#202327]/50">
                <p className="text-sm text-gray-500 dark:text-[#71767B]">
                  Costos base por tipo de consulta y tipo de visita. Haz clic en
                  el monto para editarlo.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
                {costos.map((c) => (
                  <CostoCard
                    key={c.id}
                    costo={c}
                    onEditar={abrirEditarCosto}
                    onToggle={() =>
                      toggleActivo(
                        "/api/configuracion/matriz-costos",
                        c.id,
                        c.activo,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {seccion === "estudios" && (
            <CatalogoSeccion
              titulo="Catálogo de Estudios"
              items={estudiosFiltrados}
              search={search}
              onSearch={setSearch}
              placeholder="Buscar estudio..."
              onCrear={() => abrirCrear("estudio")}
              onEditar={(item) => abrirEditar("estudio", item)}
              onEliminar={(id) =>
                eliminar("/api/configuracion/catalogo-estudios", id)
              }
              onToggle={(id, activo) =>
                toggleActivo("/api/configuracion/catalogo-estudios", id, activo)
              }
              renderExtra={(e: CatalogoEstudio) => (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.bilateral ? "bg-sky-50 text-sky-700" : "bg-gray-100 dark:bg-[#202327] text-gray-500 dark:text-[#71767B]"}`}
                >
                  {e.bilateral ? "Bilateral" : "Unilateral"}
                </span>
              )}
              emptyIcon={Beaker}
              emptyTitle="No hay estudios"
              emptyDesc="Agregue estudios al catálogo para que aparezcan en el selector de consultas."
            />
          )}

          {seccion === "procedimientos" && (
            <CatalogoSeccion
              titulo="Catálogo de Procedimientos"
              items={procsFiltrados}
              search={search}
              onSearch={setSearch}
              placeholder="Buscar procedimiento..."
              onCrear={() => abrirCrear("procedimiento")}
              onEditar={(item) => abrirEditar("procedimiento", item)}
              onEliminar={(id) =>
                eliminar("/api/configuracion/catalogo-procedimientos", id)
              }
              onToggle={(id, activo) =>
                toggleActivo(
                  "/api/configuracion/catalogo-procedimientos",
                  id,
                  activo,
                )
              }
              renderExtra={(p: CatalogoProcedimiento) => (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.por_ojo ? "bg-sky-50 text-sky-700" : "bg-gray-100 dark:bg-[#202327] text-gray-500 dark:text-[#71767B]"}`}
                >
                  {p.por_ojo ? "Por ojo" : "Único"}
                </span>
              )}
              emptyIcon={Scissors}
              emptyTitle="No hay procedimientos"
              emptyDesc="Agregue procedimientos al catálogo para que aparezcan en el selector de consultas."
            />
          )}

          {seccion === "coberturas" && (
            <CoberturasSeccion
              coberturas={coberturas}
              aseguranzas={aseguranzas}
              onCrear={() => abrirCrear("cobertura")}
              onEditar={(c) => {
                setModalTipo("cobertura");
                setEditando(c);
                setFAseguranzaId(c.aseguranza_id);
                setFPorcentaje(String(c.porcentaje_cobertura));
                setFMontoMax(c.monto_maximo ? String(c.monto_maximo) : "");
                setFAplicaEst(c.aplica_estudios);
                setFAplicaProc(c.aplica_procedimientos);
                setFActivo(c.activo);
                setError("");
                setShowModal(true);
              }}
              onEliminar={(id) =>
                eliminar("/api/configuracion/coberturas-aseguranza", id)
              }
              onToggle={(id, activo) =>
                toggleActivo(
                  "/api/configuracion/coberturas-aseguranza",
                  id,
                  activo,
                )
              }
            />
          )}
        </>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        maxWidth="max-w-lg"
      >
        <h3 className="text-lg font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA] mb-4">
          {editando ? "Editar" : "Nuevo"}{" "}
          {modalTipo === "costo"
            ? "Costo Base"
            : modalTipo === "estudio"
              ? "Estudio"
              : modalTipo === "procedimiento"
                ? "Procedimiento"
                : "Cobertura"}
        </h3>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="space-y-4">
          {modalTipo === "costo" && (
            <>
              <div className="rounded-lg bg-gray-50 dark:bg-[#202327] p-3">
                <p className="text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider">Tipo</p>
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
                  {TIPO_CONSULTA[editando?.tipo_consulta]} - {TIPO_VISITA[editando?.tipo_visita]}
                </p>
              </div>
              <Field
                label="Costo"
                required
                value={fCosto}
                onChange={setFCosto}
                type="number"
                prefix="$"
              />
              <Field
                label="Descripcion"
                value={fDescripcion}
                onChange={setFDescripcion}
                textarea
              />
              <Check label="Activo" checked={fActivo} onChange={setFActivo} />
            </>
          )}
          {modalTipo !== "cobertura" && modalTipo !== "costo" && (
            <>
              <Field
                label="Nombre"
                required
                value={fNombre}
                onChange={setFNombre}
                placeholder="Nombre del estudio/procedimiento"
              />
              <Field
                label="Descripción"
                value={fDescripcion}
                onChange={setFDescripcion}
                textarea
              />
              <Field
                label="Costo"
                required
                value={fCosto}
                onChange={setFCosto}
                type="number"
                prefix="$"
              />
              {modalTipo === "estudio" ? (
                <Check
                  label="Bilateral (se cobra por cada ojo)"
                  checked={fBilateral}
                  onChange={setFBilateral}
                />
              ) : (
                <Check
                  label="Por ojo (se cobra por cada ojo)"
                  checked={fPorOjo}
                  onChange={setFPorOjo}
                />
              )}
              <Check label="Activo" checked={fActivo} onChange={setFActivo} />
            </>
          )}
          {modalTipo === "cobertura" && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">
                  Aseguranza *
                </label>
                <select
                  value={fAseguranzaId}
                  onChange={(e) => setFAseguranzaId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                >
                  <option value="">Seleccionar</option>
                  {aseguranzas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="% Cobertura"
                  value={fPorcentaje}
                  onChange={setFPorcentaje}
                  type="number"
                />
                <Field
                  label="Monto Máximo"
                  value={fMontoMax}
                  onChange={setFMontoMax}
                  type="number"
                  placeholder="Sin límite"
                />
              </div>
              <Check
                label="Aplica a estudios"
                checked={fAplicaEst}
                onChange={setFAplicaEst}
              />
              <Check
                label="Aplica a procedimientos"
                checked={fAplicaProc}
                onChange={setFAplicaProc}
              />
            </>
          )}
        </div>
        <div className="flex gap-3 pt-5 border-t border-gray-100 dark:border-[#2F3336] mt-6">
          <button
            onClick={() => setShowModal(false)}
            className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] dark:text-[#71767B] hover:bg-gray-50 dark:hover:bg-[#1D1F23] dark:bg-[#202327] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={guardando}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function CostoCard({
  costo,
  onEditar,
  onToggle,
}: {
  costo: MatrizCosto;
  onEditar: (costo: MatrizCosto) => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${costo.activo ? "border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] hover:shadow-md" : "border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] opacity-60"}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="inline-block rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 mb-2">
            {TIPO_CONSULTA[costo.tipo_consulta]}
          </span>
          <p className="text-xs text-gray-500 dark:text-[#71767B]">
            {TIPO_VISITA[costo.tipo_visita]}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle()}
            className={`rounded-full p-1.5 transition-colors ${costo.activo ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-300 dark:text-[#71767B] hover:bg-gray-100 dark:bg-[#202327]"}`}
          >
            {costo.activo ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => onEditar(costo)}
            className="rounded-full p-1.5 text-gray-300 dark:text-[#71767B] hover:text-primary-600 hover:bg-primary-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 1 1-1.897-1.897l2.817-2.818Z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-extrabold text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">$</span>
        <span className="text-2xl font-extrabold text-gray-900 dark:text-[#E7E9EA]">
          {costo.costo.toLocaleString("es-MX", { minimumFractionDigits: 0 })}
        </span>
      </div>
      {costo.descripcion && (
        <p className="mt-2 text-xs text-gray-400 dark:text-[#71767B] dark:text-[#71767B] truncate">
          {costo.descripcion}
        </p>
      )}
    </div>
  );
}

function CatalogoSeccion({
  titulo,
  items,
  search,
  onSearch,
  placeholder,
  onCrear,
  onEditar,
  onEliminar,
  onToggle,
  renderExtra,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDesc,
}: {
  titulo: string;
  items: any[];
  search: string;
  onSearch: (s: string) => void;
  placeholder: string;
  onCrear: () => void;
  onEditar: (item: any) => void;
  onEliminar: (id: string) => void;
  onToggle: (id: string, activo: boolean) => void;
  renderExtra: (item: any) => React.ReactNode;
  emptyIcon: any;
  emptyTitle: string;
  emptyDesc: string;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-[#71767B] dark:text-[#71767B]" />
          <input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] dark:text-[#71767B] dark:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <button
          onClick={onCrear}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={EmptyIcon}
          title={emptyTitle}
          description={emptyDesc}
        />
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327]/50 dark:bg-[#202327]/50">
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">
                  Costo
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B] dark:text-[#71767B] w-24">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
              {items.map((item: any) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]/60 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
                      {item.nombre}
                    </div>
                    {item.descripcion && (
                      <div className="text-xs text-gray-400 dark:text-[#71767B] dark:text-[#71767B] mt-0.5 truncate max-w-md">
                        {item.descripcion}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                    ${item.costo.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">{renderExtra(item)}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onToggle(item.id, item.activo)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors ${item.activo ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 dark:bg-[#202327] text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:bg-gray-200 dark:bg-[#202327]"}`}
                    >
                      {item.activo ? (
                        <>
                          <Eye className="h-3 w-3" /> Activo
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3" /> Inactivo
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEditar(item)}
                        className="text-xs font-bold text-primary-600 hover:text-primary-800 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onEliminar(item.id)}
                        className="text-gray-300 dark:text-[#71767B] hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CoberturasSeccion({
  coberturas,
  aseguranzas,
  onCrear,
  onEditar,
  onEliminar,
  onToggle,
}: {
  coberturas: Cobertura[];
  aseguranzas: Aseguranza[];
  onCrear: () => void;
  onEditar: (cobertura: Cobertura) => void;
  onEliminar: (id: string) => void;
  onToggle: (id: string, activo: boolean) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-[#71767B]">
          Define el porcentaje de cobertura que cada aseguranza aplica sobre
          estudios y procedimientos.
        </p>
        <button
          onClick={onCrear}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva Cobertura
        </button>
      </div>
      {coberturas.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No hay coberturas"
          description="Agregue coberturas para que se apliquen automáticamente al calcular costos."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coberturas.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-5 transition-all ${c.activo ? "border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] hover:shadow-md" : "border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] opacity-60"}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">
                    {c.aseguranza_nombre}
                  </h4>
                  <p className="text-xs text-gray-400 dark:text-[#71767B] dark:text-[#71767B] mt-0.5">
                    {c.aplica_estudios ? "Estudios" : ""}
                    {c.aplica_estudios && c.aplica_procedimientos ? " + " : ""}
                    {c.aplica_procedimientos ? "Procedimientos" : ""}
                  </p>
                </div>
                <button
                  onClick={() => onToggle(c.id, c.activo)}
                  className={`rounded-full p-1.5 transition-colors ${c.activo ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-300 dark:text-[#71767B] hover:bg-gray-100 dark:bg-[#202327]"}`}
                >
                  {c.activo ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-extrabold text-primary-600">
                  {c.porcentaje_cobertura}
                </span>
                <span className="text-lg font-bold text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">
                  % cobertura
                </span>
              </div>
              {c.monto_maximo && (
                <p className="text-xs text-gray-500 dark:text-[#71767B] mb-3">
                  Máximo: ${c.monto_maximo.toLocaleString()}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => onEditar(c)}
                  className="text-xs font-bold text-primary-600 hover:text-primary-800 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => onEliminar(c.id)}
                  className="text-xs font-bold text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:text-red-500 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Field({
  label,
  required,
  value,
  onChange,
  type = "text",
  placeholder,
  textarea,
  prefix,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
  prefix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-[#71767B] dark:text-[#71767B]">
            {prefix}
          </span>
        )}
        {textarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] dark:text-[#71767B] dark:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] py-2.5 ${prefix ? "pl-8 pr-4" : "px-4"} text-sm text-gray-900 dark:text-[#E7E9EA] placeholder:text-gray-400 dark:placeholder:text-[#71767B] dark:text-[#71767B] dark:text-[#71767B] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500`}
          />
        )}
      </div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${checked ? "border-primary-600 bg-primary-600" : "border-gray-300 dark:border-[#536471] group-hover:border-gray-400 dark:group-hover:border-[#536471]"}`}
      >
        {checked && <CheckIcon className="h-3 w-3 text-white" />}
      </div>
      <span className="text-sm font-bold text-gray-700 dark:text-[#E7E9EA]">{label}</span>
    </label>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={className}>
      <path
        d="M10 3L4.5 8.5L2 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
