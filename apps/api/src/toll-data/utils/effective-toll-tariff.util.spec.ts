import { resolveEffectiveTollTariff, TollRateCandidate } from './effective-toll-tariff.util';

function rate(overrides: Partial<TollRateCandidate> = {}): TollRateCandidate {
  return {
    id: 'rate-1',
    axleCategory: '9 eixos',
    price: 100,
    currency: 'BRL',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveUntil: null,
    status: 'VERIFIED',
    ...overrides,
  };
}

describe('resolveEffectiveTollTariff', () => {
  it('sem nenhuma tarifa cadastrada, retorna null (nunca inventa valor)', () => {
    expect(resolveEffectiveTollTariff([], '9 eixos', new Date('2026-06-01'))).toBeNull();
  });

  it('encontra a tarifa vigente por correspondencia exata de categoria', () => {
    const result = resolveEffectiveTollTariff([rate()], '9 eixos', new Date('2026-06-01'));
    expect(result?.price).toBe(100);
  });

  it('categoria diferente (7 eixos) nao encontra a tarifa de 9 eixos -- nunca assume equivalencia', () => {
    const result = resolveEffectiveTollTariff([rate({ axleCategory: '9 eixos' })], '7 eixos', new Date('2026-06-01'));
    expect(result).toBeNull();
  });

  it('7 e 9 eixos coexistem independentemente para a mesma praca', () => {
    const rates = [
      rate({ id: 'r9', axleCategory: '9 eixos', price: 100 }),
      rate({ id: 'r7', axleCategory: '7 eixos', price: 80 }),
    ];
    expect(resolveEffectiveTollTariff(rates, '9 eixos', new Date('2026-06-01'))?.price).toBe(100);
    expect(resolveEffectiveTollTariff(rates, '7 eixos', new Date('2026-06-01'))?.price).toBe(80);
  });

  describe('historico e vigencia', () => {
    const oldRate = rate({
      id: 'old',
      price: 100,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveUntil: new Date('2026-08-11T00:00:00.000Z'),
    });
    const newRate = rate({
      id: 'new',
      price: 105,
      effectiveFrom: new Date('2026-08-11T00:00:00.000Z'),
      effectiveUntil: null,
    });
    const both = [oldRate, newRate];

    it('viagem realizada ANTES da troca consulta a tarifa antiga', () => {
      const result = resolveEffectiveTollTariff(both, '9 eixos', new Date('2026-08-10T12:00:00.000Z'));
      expect(result?.rateId).toBe('old');
      expect(result?.price).toBe(100);
    });

    it('viagem realizada NA/APOS a troca consulta a tarifa nova', () => {
      const result = resolveEffectiveTollTariff(both, '9 eixos', new Date('2026-08-11T00:00:00.000Z'));
      expect(result?.rateId).toBe('new');
      expect(result?.price).toBe(105);
    });

    it('o historico continua consultavel (nunca apagado)', () => {
      const result = resolveEffectiveTollTariff(both, '9 eixos', new Date('2026-03-15T00:00:00.000Z'));
      expect(result?.price).toBe(100);
    });
  });

  it('tarifa com vigencia FUTURA nao e usada antes de effectiveFrom', () => {
    const futureRate = rate({ effectiveFrom: new Date('2026-12-01T00:00:00.000Z') });
    const result = resolveEffectiveTollTariff([futureRate], '9 eixos', new Date('2026-08-10'));
    expect(result).toBeNull();
  });

  it('tarifa com vigencia futura E consultada quando a data da consulta ja alcancou effectiveFrom', () => {
    const futureRate = rate({ effectiveFrom: new Date('2026-12-01T00:00:00.000Z') });
    const result = resolveEffectiveTollTariff([futureRate], '9 eixos', new Date('2026-12-01T00:00:00.000Z'));
    expect(result?.price).toBe(100);
  });

  it('status UNAVAILABLE nunca e retornado como tarifa valida', () => {
    const result = resolveEffectiveTollTariff([rate({ status: 'UNAVAILABLE' })], '9 eixos', new Date('2026-06-01'));
    expect(result).toBeNull();
  });

  it('status PENDING_REVIEW/STALE ainda sao retornados (o chamador decide como exibir a confianca)', () => {
    expect(resolveEffectiveTollTariff([rate({ status: 'PENDING_REVIEW' })], '9 eixos', new Date('2026-06-01'))?.status).toBe(
      'PENDING_REVIEW',
    );
    expect(resolveEffectiveTollTariff([rate({ status: 'STALE' })], '9 eixos', new Date('2026-06-01'))?.status).toBe('STALE');
  });
});
