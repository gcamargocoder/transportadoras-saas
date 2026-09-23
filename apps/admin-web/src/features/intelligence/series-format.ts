import type { KpiGranularity, KpiSeriesEntity, KpiSeriesPointEntity } from '../../types/entities';

// BI 3 -- apresentacao da serie temporal. So formata e alinha o que a API
// devolveu; nenhum ponto e criado, interpolado ou recalculado aqui.

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Rotulo curto do balde (o label da API ja esta no fuso do tenant).
export function formatBucketLabel(label: string, granularity: KpiGranularity): string {
  const [year, month, day] = label.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? month;
  if (granularity === 'month') return `${monthName}/${year?.slice(2)}`;
  if (granularity === 'week') return `sem. ${day}/${month}`;
  return `${day}/${month}`;
}

export const GRANULARITY_LABELS: Record<KpiGranularity, string> = { day: 'Dia', week: 'Semana', month: 'Mês' };

// Limites do servidor (MAX_BUCKETS em apps/api/src/bi/utils/kpi-buckets.util.ts),
// convertidos em dias para desabilitar opcoes que a API recusaria.
const MAX_DAYS: Record<KpiGranularity, number> = { day: 61, week: 52 * 7, month: Number.POSITIVE_INFINITY };

export function isGranularityAllowed(granularity: KpiGranularity, startDate: string, endDate: string): boolean {
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
  return days <= MAX_DAYS[granularity];
}

export interface SeriesRow {
  label: string;
  bucket: string;
  partial: boolean;
  current: number | null;
  previous: number | null;
  records: number;
  [key: string]: string | number | boolean | null;
}

function recordsOf(point: KpiSeriesPointEntity | undefined): number {
  return point ? point.evidence.reduce((sum, e) => sum + e.recordCount, 0) : 0;
}

// Linhas do grafico: ponto atual + ponto de comparacao na MESMA posicao
// (pareamento feito pela API). Sem ponto de comparacao => null (lacuna).
export function toSeriesRows(series: KpiSeriesEntity | undefined, granularity: KpiGranularity): SeriesRow[] {
  if (!series) return [];
  return series.points.map((point, index) => ({
    label: formatBucketLabel(point.label, granularity),
    bucket: point.label,
    partial: point.partial,
    current: point.value,
    previous: series.comparisonPoints?.[index]?.value ?? null,
    records: recordsOf(point),
  }));
}

// Varias series da mesma resposta lado a lado (ex: composicao dos custos),
// uma coluna por KPI, alinhadas pelo mesmo balde.
export function toStackedRows(
  seriesList: KpiSeriesEntity[],
  granularity: KpiGranularity,
): Array<Record<string, string | number | boolean | null>> {
  const [first] = seriesList;
  if (!first) return [];
  return first.points.map((point, index) => {
    const row: Record<string, string | number | boolean | null> = {
      label: formatBucketLabel(point.label, granularity),
      bucket: point.label,
      partial: point.partial,
    };
    for (const series of seriesList) row[series.id] = series.points[index]?.value ?? null;
    return row;
  });
}
