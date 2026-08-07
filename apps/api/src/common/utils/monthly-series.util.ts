// Serie mensal (ultimos N meses, sempre com todos os meses presentes --
// mes sem movimentacao entra com value = 0, nunca omitido). Funcao pura,
// reutilizada por qualquer modulo que precise de graficos "por mes" (Fase
// 19 -- Dashboard Executivo).
export interface MonthlySeriesPoint {
  month: string;
  value: number;
}

export interface MonthlySeriesRow {
  date: Date;
  value: number;
}

const MONTH_LABELS_PT_BR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

interface MonthBucket {
  start: Date;
  end: Date;
  label: string;
  value: number;
}

// Limites (inicio inclusive / fim exclusivo, UTC) dos ultimos `monthsBack`
// meses, incluindo o mes de `reference` -- do mais antigo para o mais
// recente. Exposto separadamente para quem precisa so do "piso" de data
// (ex: filtro `gte` de uma query) sem agregar nada ainda.
export function buildMonthlyRange(monthsBack: number, reference: Date = new Date()): MonthBucket[] {
  const months: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const label = MONTH_LABELS_PT_BR[start.getUTCMonth()] ?? '';
    months.push({ start, end, label, value: 0 });
  }
  return months;
}

// Agrega `rows` (cada uma com uma data e um valor) nos "baldes" mensais dos
// ultimos `monthsBack` meses. Para series de SOMA (receita/despesa/custo),
// `value` de cada linha e o valor monetario; para series de CONTAGEM
// (quantidade de viagens), `value` de cada linha e simplesmente 1.
export function aggregateMonthlySeries(
  rows: MonthlySeriesRow[],
  monthsBack = 12,
  reference: Date = new Date(),
): MonthlySeriesPoint[] {
  const buckets = buildMonthlyRange(monthsBack, reference);

  for (const row of rows) {
    const bucket = buckets.find((b) => row.date >= b.start && row.date < b.end);
    if (bucket) bucket.value += row.value;
  }

  return buckets.map((b) => ({ month: b.label, value: Math.round(b.value * 100) / 100 }));
}
