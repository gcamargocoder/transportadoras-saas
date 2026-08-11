// Fase 33, secao 17 -- nucleo puro de getEffectiveTollTariff(): dado um
// conjunto de tarifas ja carregadas para uma praca+categoria e uma data,
// decide qual (se alguma) esta vigente. Funcao pura (sem Prisma/IO) --
// TollRatesService so busca os candidatos no banco e delega a decisao aqui,
// mesmo padrao ja usado por toll-reconciliation.util.ts/
// operational-status.util.ts nesta base de codigo.
export type TollRateStatusValue = 'VERIFIED' | 'PENDING_REVIEW' | 'STALE' | 'UNAVAILABLE';

export interface TollRateCandidate {
  id: string;
  axleCategory: string;
  price: number;
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  status: TollRateStatusValue;
}

export interface EffectiveTollTariffResult {
  rateId: string;
  axleCategory: string;
  price: number;
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  status: TollRateStatusValue;
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

// Prioridade da secao 17: (1) correspondencia EXATA de categoria de eixos;
// nao ha "regra oficial equivalente" generica nesta fase (nenhuma fonte
// documentou uma tabela de conversao entre categorias -- ver relatorio);
// (3) NULL quando nao houver informacao suficiente. UNAVAILABLE nunca e
// retornado -- e o proprio marcador de "sem tarifa oficial conhecida".
export function resolveEffectiveTollTariff(
  candidates: TollRateCandidate[],
  axleCategory: string,
  date: Date,
): EffectiveTollTariffResult | null {
  const target = normalizeCategory(axleCategory);

  const applicable = candidates.filter((rate) => {
    if (normalizeCategory(rate.axleCategory) !== target) return false;
    if (rate.status === 'UNAVAILABLE') return false;
    if (rate.effectiveFrom.getTime() > date.getTime()) return false; // tarifa futura -- ainda nao vigente (secao 8)
    if (rate.effectiveUntil !== null && rate.effectiveUntil.getTime() <= date.getTime()) return false;
    return true;
  });

  if (applicable.length === 0) return null;

  // Defensivo: se por algum motivo houver mais de uma vigente na mesma data
  // (nao deveria, ver invariante de versionamento em TollRatesService), usa
  // a mais recente -- nunca soma/escolhe arbitrariamente.
  const mostRecent = applicable.reduce((latest, current) =>
    current.effectiveFrom.getTime() > latest.effectiveFrom.getTime() ? current : latest,
  );

  return {
    rateId: mostRecent.id,
    axleCategory: mostRecent.axleCategory,
    price: mostRecent.price,
    currency: mostRecent.currency,
    effectiveFrom: mostRecent.effectiveFrom,
    effectiveUntil: mostRecent.effectiveUntil,
    status: mostRecent.status,
  };
}
