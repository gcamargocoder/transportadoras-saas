'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { formatCurrency, formatNumber } from '../../utils/format';

// Fase 40 -- primeiro grafico de barras do admin-web (unico precedente ate
// aqui era o AreaChart de MonthlyChartCard). Mesmo estilo visual (eixo
// fontSize 11 fill #94a3b8, Tooltip contentStyle identico) para manter a
// UI consistente.
export function BarRankingChart({
  title,
  description,
  data,
  color = '#4f46e5',
  valueFormatter = formatCurrency,
  emptyMessage = 'Sem dados no período/filtro selecionado.',
}: {
  title: string;
  description?: string;
  data: { label: string; value: number }[];
  color?: string;
  valueFormatter?: (value: number) => string;
  emptyMessage?: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {data.length === 0 ? (
        <div className="px-5 py-6">
          <EmptyState title={emptyMessage} />
        </div>
      ) : (
        <div className="h-64 px-3 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(value: number) => formatNumber(value)}
              />
              <Tooltip
                formatter={(value: number) => valueFormatter(value)}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: '#e2e8f0',
                  fontSize: 12,
                  boxShadow: '0 8px 24px -4px rgb(15 23 42 / 0.14)',
                }}
              />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
