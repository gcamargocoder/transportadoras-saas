'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardHeader } from '../../components/ui/card';
import type { DashboardChartPointEntity } from '../../types/entities';
import { formatCurrency, formatNumber } from '../../utils/format';

export function MonthlyChartCard({
  title,
  description,
  data,
  color = '#4f46e5',
  valueFormatter = formatCurrency,
}: {
  title: string;
  description?: string;
  data: DashboardChartPointEntity[];
  color?: string;
  valueFormatter?: (value: number) => string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="h-64 px-3 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
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
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#gradient-${title})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
