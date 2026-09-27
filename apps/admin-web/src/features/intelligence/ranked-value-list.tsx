'use client';

import { EmptyState } from '../../components/ui/empty-state';
import type { KpiUnit } from '../../types/entities';
import { cn } from '../../utils/cn';
import { formatKpiValue } from './kpi-format';

export interface RankedValueItem {
  key: string | null;
  label: string;
  value: number | null;
  unavailableReason: string | null;
}

export function sortRankedItems<T extends { value: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });
}

// BI 7 -- ranking compacto de 1 KPI por dimensao (veiculo/tipo/severidade).
// NAO substitui as tabelas investigativas de Frota/Custos/Prazos/Ocorrencias
// (varias metricas por linha, busca e ordenacao interativas); aqui e sempre
// 1 metrica, so leitura. Ordenar por valor e aceitavel (mesmo padrao das
// tabelas por veiculo) -- o que nunca se faz e rotular "melhor"/"pior".
export function RankedValueList({
  unit,
  items,
  emptyTitle = 'Nenhum item no escopo selecionado',
}: {
  unit: KpiUnit;
  items: RankedValueItem[];
  emptyTitle?: string;
}): JSX.Element {
  if (items.length === 0) return <EmptyState title={emptyTitle} />;
  const max = Math.max(0, ...items.map((i) => Math.abs(i.value ?? 0)));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.key ?? it.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">{it.label}</span>
            <span className={cn('tabular-nums', it.value === null ? 'text-ink-subtle' : 'text-ink')} title={it.unavailableReason ?? undefined}>
              {it.value === null ? '—' : formatKpiValue(unit, it.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${max > 0 ? (Math.abs(it.value ?? 0) / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
