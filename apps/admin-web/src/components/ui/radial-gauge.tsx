'use client';

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

const TONE_COLORS: Record<'brand' | 'success' | 'warning' | 'danger', string> = {
  brand: '#4f46e5',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
};

function toneForPercentage(percentage: number): 'success' | 'warning' | 'danger' {
  if (percentage < 20) return 'danger';
  if (percentage < 40) return 'warning';
  return 'success';
}

// Primeiro gauge radial do admin-web (recharts RadialBarChart, ja
// dependencia instalada, nunca usado ate aqui). PolarAngleAxis com dominio
// fixo [0,100] e necessario -- sem isso o RadialBarChart normaliza o angulo
// pelo proprio valor maximo dos dados (1 unico ponto), sempre desenhando o
// circulo cheio independente do percentual.
export function RadialGauge({
  percentage,
  size = 96,
  tone,
  label,
  centerValue,
  trackColor = '#e2e8f0',
}: {
  percentage: number;
  size?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  label?: string;
  centerValue?: string;
  trackColor?: string;
}): JSX.Element {
  const clamped = Math.min(100, Math.max(0, percentage));
  const resolvedTone = tone ?? toneForPercentage(clamped);
  const color = TONE_COLORS[resolvedTone];
  const data = [{ value: clamped, fill: color }];

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="72%" outerRadius="100%" barSize={Math.max(6, size * 0.12)}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar dataKey="value" background={{ fill: trackColor }} cornerRadius={999} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-ink">{centerValue ?? `${Math.round(clamped)}%`}</span>
        </div>
      </div>
      {label && (
        <p className="mt-1.5 max-w-full truncate text-xs font-medium text-ink-muted" title={label}>
          {label}
        </p>
      )}
    </div>
  );
}
