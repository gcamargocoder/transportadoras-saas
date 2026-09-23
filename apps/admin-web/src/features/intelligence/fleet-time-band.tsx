'use client';

import type { KpiResultEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';
import { findInput } from './kpi-format';

// Como as horas da frota se distribuiram no periodo, a partir das ENTRADAS
// ja devolvidas pelo KPI fleet_utilization (capacidade, viagem, manutencao,
// ociosidade). A largura de cada faixa e so proporcao visual das horas da
// API -- nenhum KPI e recalculado aqui.
export function FleetTimeBand({ kpi }: { kpi: KpiResultEntity | undefined }): JSX.Element | null {
  const capacity = findInput(kpi, 'capacityHours');
  if (!capacity || capacity <= 0) return null;

  const trip = findInput(kpi, 'tripHours') ?? 0;
  const maintenance = findInput(kpi, 'maintenanceHours') ?? 0;
  const idle = findInput(kpi, 'idleHours') ?? 0;
  const unclassified = Math.max(0, capacity - trip - maintenance - idle);

  const segments = [
    { key: 'trip', label: 'Em viagem', hours: trip, className: 'bg-brand-600' },
    { key: 'maintenance', label: 'Em manutenção', hours: maintenance, className: 'bg-warning-500' },
    { key: 'idle', label: 'Ocioso entre viagens', hours: idle, className: 'bg-slate-400' },
    { key: 'unclassified', label: 'Sem registro de operação', hours: unclassified, className: 'bg-slate-200' },
  ];

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${formatNumber(s.hours, 1)} h`).join('; ')}
      >
        {segments.map((segment) =>
          segment.hours > 0 ? (
            <div
              key={segment.key}
              className={segment.className}
              style={{ width: `${Math.min(100, (segment.hours / capacity) * 100)}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${segment.className}`} aria-hidden />
              {segment.label}
            </span>
            <span className="font-medium tabular-nums text-ink">{formatNumber(segment.hours, 1)} h</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-subtle">
        Capacidade: {formatNumber(capacity, 0)} h ({formatNumber(findInput(kpi, 'vehiclesConsidered'), 0)} veículos no
        período).
      </p>
    </div>
  );
}
