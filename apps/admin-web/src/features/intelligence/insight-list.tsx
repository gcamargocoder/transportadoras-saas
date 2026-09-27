'use client';

import { EmptyState } from '../../components/ui/empty-state';
import type { KpiInsight } from './report-insights';

// BI 9/11 -- unica renderizacao das frases de report-insights.ts, reaproveitada
// pelo Relatorio (BI 9) e pelo painel "O que mudou" da Visao geral (BI 11).
const TONE_DOT: Record<KpiInsight['tone'], string> = {
  positive: 'bg-success-500',
  negative: 'bg-danger-500',
  neutral: 'bg-info-500',
  unavailable: 'bg-ink-subtle',
};

export function InsightList({
  insights,
  onSelect,
  emptyTitle = 'Sem base de comparação suficiente',
  emptyDescription = 'Nenhum indicador principal tem período anterior válido para comparar.',
}: {
  insights: KpiInsight[];
  onSelect: (kpiId: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}): JSX.Element {
  if (insights.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {insights.map((insight) => (
        <li key={insight.kpiId}>
          <button type="button" onClick={() => onSelect(insight.kpiId)} className="group flex w-full items-start gap-2.5 text-left text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[insight.tone]}`} aria-hidden />
            <span className="text-ink group-hover:underline">{insight.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
