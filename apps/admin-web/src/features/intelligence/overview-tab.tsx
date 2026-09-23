'use client';

import {
  AlertTriangle,
  CircleDollarSign,
  Clock,
  Gauge,
  PackageCheck,
  Route as RouteIcon,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { KpiResultEntity } from '../../types/entities';
import { KpiCard } from './kpi-card';

interface Slot {
  id: string;
  icon: LucideIcon;
}

// Visao executiva: 4 indicadores principais (volume e resultado) e 4 de
// eficiencia/qualidade. Todos KPIs oficiais do BI 1.
const PRIMARY: Slot[] = [
  { id: 'trips_completed', icon: RouteIcon },
  { id: 'deliveries_completed', icon: PackageCheck },
  { id: 'revenue', icon: CircleDollarSign },
  { id: 'operating_result', icon: Wallet },
];

const SECONDARY: Slot[] = [
  { id: 'cost_per_km', icon: Gauge },
  { id: 'on_time_delivery_rate', icon: Clock },
  { id: 'occurrences_total', icon: AlertTriangle },
  { id: 'idle_hours', icon: Timer },
];

export const OVERVIEW_KPI_IDS = [...PRIMARY, ...SECONDARY].map((slot) => slot.id);

export function OverviewTab({
  kpis,
  onExplain,
}: {
  kpis: Map<string, KpiResultEntity>;
  onExplain: (kpi: KpiResultEntity) => void;
}): JSX.Element {
  const render = (slots: Slot[], size: 'lg' | 'md') =>
    slots.map((slot) => {
      const kpi = kpis.get(slot.id);
      return kpi ? <KpiCard key={slot.id} kpi={kpi} icon={slot.icon} size={size} onExplain={onExplain} /> : null;
    });

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Volume e resultado" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {render(PRIMARY, 'lg')}
      </section>
      <section aria-label="Eficiência e qualidade" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {render(SECONDARY, 'md')}
      </section>
    </div>
  );
}
