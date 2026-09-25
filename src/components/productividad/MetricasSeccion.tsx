'use client';

import { AlertTriangle, CheckCircle2, DollarSign, TrendingUp, Users, Wallet } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/money';
import type { MetricasPayload } from '@/lib/productividad/metricas';
import {
  ALTURA_BARRAS_DOCTOR,
  ALTURA_DONUT,
  ALTURA_ESTADO,
  ALTURA_SERIE,
  BarrasDoctor,
  ChartCard,
  DonutFuente,
  PastelEstado,
  SerieDiaria,
} from './charts';

export default function MetricasSeccion({ data }: { data: MetricasPayload }) {
  const { kpis, por_doctor, por_fuente, por_estado, serie_diaria } = data;

  if (kpis.eventos === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Sin métricas en el rango"
        description="No hay eventos de productividad para el rango y doctor seleccionados"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          icon={DollarSign}
          label="Devengado"
          value={formatCurrency(kpis.monto)}
          color="text-primary-600"
          bgColor="bg-primary-50"
        />
        <StatCard
          icon={CheckCircle2}
          label="Pagado"
          value={formatCurrency(kpis.pagado)}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          icon={Wallet}
          label="Por pagar"
          value={formatCurrency(kpis.por_pagar)}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          icon={Users}
          label="Eventos"
          value={String(kpis.eventos)}
          color="text-violet-600"
          bgColor="bg-violet-50"
        />
        <StatCard
          icon={TrendingUp}
          label="Ticket promedio"
          value={formatCurrency(kpis.ticket_promedio)}
          color="text-sky-600"
          bgColor="bg-sky-50"
        />
        <StatCard
          icon={AlertTriangle}
          label="Sin monto"
          value={String(kpis.sin_monto)}
          color="text-gray-600"
          bgColor="bg-gray-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard titulo="Monto por doctor" ayuda="Top 12" alto={ALTURA_BARRAS_DOCTOR}>
          <BarrasDoctor data={por_doctor} />
        </ChartCard>
        <ChartCard titulo="Composición por fuente" ayuda="Monto" alto={ALTURA_DONUT}>
          <DonutFuente data={por_fuente} />
        </ChartCard>
        <ChartCard
          titulo="Tendencia diaria"
          ayuda="Monto por fecha"
          alto={ALTURA_SERIE}
          className="lg:col-span-2"
        >
          <SerieDiaria data={serie_diaria} />
        </ChartCard>
        <ChartCard
          titulo="Estado de pago"
          ayuda="Monto por estatus"
          alto={ALTURA_ESTADO}
          className="lg:col-span-2"
        >
          <PastelEstado data={por_estado} />
        </ChartCard>
      </div>
    </div>
  );
}
