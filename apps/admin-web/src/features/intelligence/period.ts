// BI 2 -- periodo unico da Central de Inteligencia. Um so periodo alimenta
// todos os KPIs da tela (nunca um periodo por card). Os limites sao dias
// LOCAIS do usuario (00:00 -> 23:59:59.999), enviados como ISO com hora --
// a API respeita a hora explicita (ver apps/api/src/bi/utils/kpi-period.util.ts).

export const PERIOD_PRESETS = ['today', '7d', '30d', '3m', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const DEFAULT_PERIOD_PRESET: PeriodPreset = '30d';

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  '3m': '3 meses',
  custom: 'Personalizado',
};

export interface PeriodRange {
  startDate: string;
  endDate: string;
}

export function isPeriodPreset(value: string | null | undefined): value is PeriodPreset {
  return value !== null && value !== undefined && (PERIOD_PRESETS as readonly string[]).includes(value);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

// "2026-01-31" (input type=date) -> Date local, sem o deslocamento UTC de new Date('2026-01-31').
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Intervalo do preset. Dias inteiros e inclusivos: "7 dias" = hoje + 6 dias
// anteriores. `custom` exige as duas datas e inicio <= fim -- caso contrario
// null (a tela nao consulta a API com periodo invalido).
export function resolvePeriodRange(
  preset: PeriodPreset,
  now: Date,
  custom?: { from?: string | null; to?: string | null },
): PeriodRange | null {
  const end = endOfLocalDay(now);
  const today = startOfLocalDay(now);

  switch (preset) {
    case 'today':
      return { startDate: today.toISOString(), endDate: end.toISOString() };
    case '7d':
    case '30d': {
      const days = preset === '7d' ? 7 : 30;
      const start = new Date(today);
      start.setDate(start.getDate() - (days - 1));
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case '3m': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      start.setDate(start.getDate() + 1);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'custom': {
      const from = custom?.from ? parseLocalDate(custom.from) : null;
      const to = custom?.to ? parseLocalDate(custom.to) : null;
      if (!from || !to || from.getTime() > to.getTime()) return null;
      return { startDate: startOfLocalDay(from).toISOString(), endDate: endOfLocalDay(to).toISOString() };
    }
  }
}

const rangeFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const rangeFormatterWithYear = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

// "01 set – 30 set 2026" / "22 set 2026" -- rotulo curto do periodo.
export function formatPeriodLabel(start: string | Date, end: string | Date): string {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  if (s.toDateString() === e.toDateString()) return rangeFormatterWithYear.format(s);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${(sameYear ? rangeFormatter : rangeFormatterWithYear).format(s)} – ${rangeFormatterWithYear.format(e)}`;
}
