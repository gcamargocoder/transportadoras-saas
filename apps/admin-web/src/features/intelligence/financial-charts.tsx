'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KpiUnit } from '../../types/entities';
import { formatNumber } from '../../utils/format';
import { formatKpiValue } from './kpi-format';
import type { SeriesRow } from './series-format';

// BI 3 -- graficos da aba Financeiro. Todos leem pontos da API
// (/bi/kpis/series); ponto indisponivel (null) vira LACUNA, nunca zero.
// Cores: atual = marca (indigo), anterior = cinza tracejado; resultado usa
// polaridade (verde >= 0, vermelho < 0); composicao usa a paleta categorica
// validada (CVD/normal-vision) -- ver docs/bi-kpis.md.

const AXIS_TICK = { fontSize: 11, fill: '#64748b' };
const GRID = '#e2e8f0';
export const CURRENT_COLOR = '#4f46e5';
export const PREVIOUS_COLOR = '#94a3b8';
const POSITIVE_COLOR = '#16a34a';
const NEGATIVE_COLOR = '#dc2626';

// Ordem fixa (nunca ciclada): a cor segue a categoria, nao a posicao no ranking.
export const COST_CATEGORY_COLORS: Record<string, string> = {
  fuel_cost: '#2a78d6',
  maintenance_cost: '#eb6834',
  tire_cost: '#1baf7a',
  toll_cost: '#eda100',
  other_cost: '#e87ba4',
};

function compactAxis(unit: KpiUnit) {
  return (value: number) => {
    if (unit === 'PERCENT') return `${formatNumber(value)}%`;
    if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mi`;
    if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 0)} mil`;
    return formatNumber(value);
  };
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  name?: string;
  value?: number | null;
  color?: string;
  payload?: SeriesRow;
}

function SeriesTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unit: KpiUnit;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-popover">
      <p className="font-semibold text-ink">
        {label}
        {row?.partial && <span className="ml-1 font-normal text-warning-700">(período incompleto)</span>}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
              {item.name}
            </span>
            <span className="font-medium tabular-nums text-ink">
              {item.value === null || item.value === undefined ? 'sem dado' : formatKpiValue(unit, item.value)}
            </span>
          </li>
        ))}
      </ul>
      {row && typeof row.records === 'number' && (
        <p className="mt-1 text-ink-subtle">{formatNumber(row.records)} registros de origem</p>
      )}
    </div>
  );
}

// Tendencia de um KPI: periodo atual (linha cheia) e anterior (tracejada).
export function TrendLineChart({
  rows,
  unit,
  name,
  showPrevious,
}: {
  rows: SeriesRow[];
  unit: KpiUnit;
  name: string;
  showPrevious: boolean;
}): JSX.Element {
  return (
    <div className="h-56" role="img" aria-label={`${name} ao longo do período`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={AXIS_TICK} tickFormatter={compactAxis(unit)} />
          <Tooltip content={<SeriesTooltip unit={unit} />} cursor={{ stroke: '#cbd5e1' }} />
          {showPrevious && (
            <Line
              dataKey="previous"
              name="Período anterior"
              stroke={PREVIOUS_COLOR}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="current"
            name="Período atual"
            stroke={CURRENT_COLOR}
            strokeWidth={2}
            dot={rows.length <= 12 ? { r: 4, strokeWidth: 2, fill: '#fff' } : false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Resultado por balde: barra verde (lucro) ou vermelha (prejuizo), a partir
// de zero. Balde sem dado = sem barra.
export function ResultBarChart({ rows }: { rows: SeriesRow[] }): JSX.Element {
  return (
    <div className="h-56" role="img" aria-label="Resultado operacional ao longo do período">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={AXIS_TICK} tickFormatter={compactAxis('BRL')} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Tooltip content={<SeriesTooltip unit="BRL" />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="current" name="Resultado" radius={[4, 4, 4, 4]} maxBarSize={32} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.bucket} fill={(row.current ?? 0) < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface CostCategory {
  id: string;
  label: string;
}

// Composicao dos custos por balde (barras empilhadas, 1px de respiro entre
// segmentos). Legenda sempre visivel; os valores exatos ficam na tabela ao lado.
export function CostCompositionChart({
  rows,
  categories,
}: {
  rows: Array<Record<string, string | number | boolean | null>>;
  categories: CostCategory[];
}): JSX.Element {
  return (
    <div className="h-64" role="img" aria-label="Composição dos custos operacionais ao longo do período">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={AXIS_TICK} tickFormatter={compactAxis('BRL')} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            formatter={(value) => formatKpiValue('BRL', typeof value === 'number' ? value : null)}
            contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {categories.map((category, index) => (
            <Bar
              key={category.id}
              dataKey={category.id}
              name={category.label}
              stackId="costs"
              fill={COST_CATEGORY_COLORS[category.id]}
              stroke="#ffffff"
              strokeWidth={1}
              maxBarSize={36}
              radius={index === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
