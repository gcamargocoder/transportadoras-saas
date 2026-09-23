'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { KpiResultEntity } from '../../types/entities';
import { formatKpiValue } from './kpi-format';

// Periodo atual x periodo anterior para KPIs de mesma unidade. So usa
// value/comparison.value devolvidos pela API -- nenhum ponto simulado.
// (Serie temporal por KPI ainda nao existe na API: ver docs/bi-kpis.md.)
export function PeriodComparisonChart({
  kpis,
  ariaLabel,
}: {
  kpis: KpiResultEntity[];
  ariaLabel: string;
}): JSX.Element | null {
  const rows = kpis
    .filter((kpi) => kpi.value !== null)
    .map((kpi) => ({ name: kpi.name, unit: kpi.unit, atual: kpi.value, anterior: kpi.comparison?.value ?? null }));
  if (rows.length === 0) return null;
  const unit = rows[0]?.unit ?? 'COUNT';

  return (
    <div className="h-56" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            formatter={(value) => formatKpiValue(unit, typeof value === 'number' ? value : null)}
            contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="anterior" name="Período anterior" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="atual" name="Período atual" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
