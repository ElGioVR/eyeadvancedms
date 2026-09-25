'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/money';
import { formatFechaCsv } from '@/lib/rangos';

export const PALETA = [
  '#1D9BF0',
  '#8B5CF6',
  '#F59E0B',
  '#10B981',
  '#F43F5E',
  '#64748B',
  '#14B8A6',
  '#A855F7',
];

export const ALTURA_BARRAS_DOCTOR = 'h-[360px] max-lg:h-[280px]';
export const ALTURA_DONUT = 'h-[320px] max-lg:h-[260px]';
export const ALTURA_ESTADO = 'h-[280px]';
export const ALTURA_SERIE = 'h-[300px] max-lg:h-[240px]';

export function ChartCard({
  titulo,
  ayuda,
  alto,
  className = '',
  children,
}: {
  titulo: string;
  ayuda?: string;
  alto: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-w-[360px] rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{titulo}</h3>
        {ayuda ? <span className="text-[11px] text-gray-400">{ayuda}</span> : null}
      </div>
      <div className={alto}>{children}</div>
    </div>
  );
}

function tooltipMoney(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : String(value ?? '');
}

export function BarrasDoctor({ data }: { data: Array<{ doctor_nombre: string; monto: number }> }) {
  const top = data.slice(0, 12);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.2)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={tooltipMoney} />
        <YAxis
          type="category"
          dataKey="doctor_nombre"
          width={132}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
        />
        <Tooltip
          formatter={(v: unknown) => [tooltipMoney(v), 'Monto']}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={22}>
          {top.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutFuente({ data }: { data: Array<{ label: string; monto: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="monto"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: unknown) => [tooltipMoney(v), 'Monto']}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: '#9CA3AF' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PastelEstado({ data }: { data: Array<{ label: string; monto: number; eventos: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="monto" nameKey="label" outerRadius="78%" paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: unknown) => [tooltipMoney(v), 'Monto']}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: '#9CA3AF' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SerieDiaria({
  data,
}: {
  data: Array<{ fecha: string; monto: number; eventos: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="gradMonto" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D9BF0" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#1D9BF0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.2)" />
        <XAxis
          dataKey="fecha"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          tickFormatter={(v: string) => formatFechaCsv(v)}
          minTickGap={28}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={tooltipMoney} width={78} />
        <Tooltip
          formatter={(v: unknown) => [tooltipMoney(v), 'Monto']}
          labelFormatter={(l) => formatFechaCsv(String(l))}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="monto"
          stroke="#1D9BF0"
          strokeWidth={2}
          fill="url(#gradMonto)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
