'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

// Misma matriz de colores de estatus que la agenda
const ESTATUS_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador', AGENDADA: 'Agendada', PROCESADA: 'Procesada',
  PENDIENTE_ESTUDIO: 'P. Estudio', PENDIENTE_CIRUGIA: 'P. Cirugía',
  APLAZADA: 'Aplazada', REAGENDADA: 'Reagendada',
  COMPLETADA: 'Completada', CANCELADA: 'Cancelada',
};
const ESTATUS_COLOR: Record<string, string> = {
  BORRADOR: '#9ca3af', AGENDADA: '#60a5fa', PROCESADA: '#3b82f6',
  PENDIENTE_ESTUDIO: '#fbbf24', PENDIENTE_CIRUGIA: '#fb923c',
  APLAZADA: '#f59e0b', REAGENDADA: '#8b5cf6',
  COMPLETADA: '#10b981', CANCELADA: '#ef4444',
};

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(22, 24, 28, 0.92)',
  border: '1px solid #2F3336',
  borderRadius: 10,
  color: '#E7E9EA',
  fontSize: 12,
  fontWeight: 600,
} as const;

export default function DashboardCharts({
  estatusChartData,
  procChartData,
  agendaChartData,
}: {
  estatusChartData: Array<{ name: string; count: number }>;
  procChartData: Array<{ name: string; count: number }>;
  agendaChartData: Array<{ name: string; count: number }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
        <div className="border-b border-gray-100 dark:border-[#2F3336] px-5 py-3.5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Consultas por Estatus (30 días)</h2>
        </div>
        <div className="p-4">
          {estatusChartData.length === 0 ? (
            <p className="h-[160px] flex items-center justify-center text-sm text-gray-400 dark:text-[#71767B]">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={estatusChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71767B', fontWeight: 700 }} interval={0} angle={-24} textAnchor="end" height={44} />
                <YAxis tick={{ fontSize: 10, fill: '#71767B' }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#E7E9EA', fontWeight: 700 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {estatusChartData.map((entry) => (
                    <Cell key={entry.name} fill={ESTATUS_COLOR[Object.keys(ESTATUS_LABEL).find((k) => ESTATUS_LABEL[k] === entry.name) || ''] || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
        <div className="border-b border-gray-100 dark:border-[#2F3336] px-5 py-3.5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Top Procedimientos</h2>
        </div>
        <div className="p-4">
          {procChartData.length === 0 ? (
            <p className="h-[160px] flex items-center justify-center text-sm text-gray-400 dark:text-[#71767B]">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={procChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.18} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#71767B' }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#71767B', fontWeight: 600 }} width={96} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#E7E9EA', fontWeight: 700 }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
        <div className="border-b border-gray-100 dark:border-[#2F3336] px-5 py-3.5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Actividad de Agenda (7 días)</h2>
        </div>
        <div className="p-4">
          {agendaChartData.length === 0 ? (
            <p className="h-[160px] flex items-center justify-center text-sm text-gray-400 dark:text-[#71767B]">Sin cirugías programadas</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={agendaChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71767B', fontWeight: 700 }} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#71767B' }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#E7E9EA', fontWeight: 700 }} />
                <Bar dataKey="count" fill="#1D9BF0" radius={[6, 6, 0, 0]} barSize={26} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
