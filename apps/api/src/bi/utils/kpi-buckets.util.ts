import { KpiPeriod } from './kpi-period.util';

// ============================================================================
// BI 3 -- baldes da serie temporal. Funcao PURA: divide [start, end] em
// dias/semanas/meses do CALENDARIO DO TENANT (TenantSettings.timezone), para
// que "setembro" seja setembro no fuso da transportadora, nao em UTC.
//
// Cada balde e um KpiPeriod fechado [start, end] (end = inicio do proximo
// balde - 1ms), recortado ao periodo pedido. Baldes recortados ou que
// terminam depois de "agora" sao marcados `partial` -- nunca um valor
// parcial apresentado como mes/semana completos.
// ============================================================================

export const KPI_GRANULARITIES = ['day', 'week', 'month'] as const;
export type KpiGranularity = (typeof KPI_GRANULARITIES)[number];

export const MAX_BUCKETS: Record<KpiGranularity, number> = { day: 62, week: 53, month: 25 };

export interface KpiBucket extends KpiPeriod {
  /** Rotulo estavel do inicio do balde no fuso do tenant: 2026-09-22 / 2026-09. */
  label: string;
  partial: boolean;
}

interface ZonedDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(instant: Date, timeZone: string): ZonedDate & { hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Deslocamento (ms) do fuso em relacao a UTC num instante: local - UTC.
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// Meia-noite local de uma data do calendario do fuso -> instante UTC.
// Recalcula o deslocamento no resultado (cobre transicoes de horario de verao).
export function zonedMidnight(date: ZonedDate, timeZone: string): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

function addDays(date: ZonedDate, days: number): ZonedDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function startOfBucket(date: ZonedDate, granularity: KpiGranularity): ZonedDate {
  if (granularity === 'month') return { year: date.year, month: date.month, day: 1 };
  if (granularity === 'week') {
    // Semana ISO: comeca na segunda-feira.
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay(); // 0 = domingo
    return addDays(date, -((weekday + 6) % 7));
  }
  return date;
}

function nextBucket(date: ZonedDate, granularity: KpiGranularity): ZonedDate {
  if (granularity === 'month') {
    return date.month === 12 ? { year: date.year + 1, month: 1, day: 1 } : { year: date.year, month: date.month + 1, day: 1 };
  }
  return addDays(date, granularity === 'week' ? 7 : 1);
}

function labelOf(date: ZonedDate, granularity: KpiGranularity): string {
  const mm = String(date.month).padStart(2, '0');
  if (granularity === 'month') return `${date.year}-${mm}`;
  return `${date.year}-${mm}-${String(date.day).padStart(2, '0')}`;
}

// Granularidade automatica: pontos suficientes para ler a tendencia sem
// estourar o limite de baldes.
export function resolveGranularity(period: KpiPeriod): KpiGranularity {
  const days = (period.end.getTime() - period.start.getTime()) / DAY_MS;
  if (days <= 45) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

export function buildKpiBuckets(
  period: KpiPeriod,
  granularity: KpiGranularity,
  timeZone: string,
  now: Date,
): KpiBucket[] {
  const buckets: KpiBucket[] = [];
  let cursor = startOfBucket(zonedParts(period.start, timeZone), granularity);
  let bucketStart = zonedMidnight(cursor, timeZone);

  while (bucketStart.getTime() <= period.end.getTime()) {
    const following = nextBucket(cursor, granularity);
    const followingStart = zonedMidnight(following, timeZone);
    const naturalEnd = new Date(followingStart.getTime() - 1);
    const start = new Date(Math.max(bucketStart.getTime(), period.start.getTime()));
    const end = new Date(Math.min(naturalEnd.getTime(), period.end.getTime()));
    buckets.push({
      start,
      end,
      label: labelOf(cursor, granularity),
      partial:
        start.getTime() !== bucketStart.getTime() ||
        end.getTime() !== naturalEnd.getTime() ||
        naturalEnd.getTime() > now.getTime(),
    });
    if (buckets.length > MAX_BUCKETS[granularity]) break;
    cursor = following;
    bucketStart = followingStart;
  }
  return buckets;
}
