import { KpiResultEntity, KpiSeriesEntity, KpiSeriesPointEntity } from '../entities/bi-kpi.entity';
import { KpiDirection } from '../kpis/kpi.types';
import { ALERT_RULES, findAlertRule } from './alert-rules';
import { isAdverseChange } from './alert-rule.types';

const PERIOD = { start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-31T23:59:59.999Z') };

function kpi(id: string, overrides: Partial<KpiResultEntity> = {}): KpiResultEntity {
  return {
    id,
    name: id,
    description: '',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'LOWER_IS_BETTER',
    formula: '',
    sources: [],
    dimensions: [],
    limitations: [],
    additive: true,
    status: 'AVAILABLE',
    unavailableReason: null,
    value: 0,
    period: PERIOD,
    comparison: null,
    inputs: [],
    evidence: [],
    ...overrides,
  } as KpiResultEntity;
}

function comparison(value: number | null, absoluteChange: number | null, percentChange: number | null) {
  return { period: PERIOD, value, absoluteChange, percentChange, unavailableReason: null };
}

function point(value: number | null): KpiSeriesPointEntity {
  return {
    label: '',
    start: PERIOD.start,
    end: PERIOD.end,
    partial: false,
    status: value === null ? 'UNAVAILABLE' : 'AVAILABLE',
    value,
    unavailableReason: null,
    inputs: [],
    evidence: [],
  };
}

function series(id: string, values: (number | null)[]): KpiSeriesEntity {
  return {
    id,
    name: id,
    description: '',
    category: 'OPERATIONAL',
    unit: 'COUNT',
    direction: 'LOWER_IS_BETTER',
    formula: '',
    sources: [],
    dimensions: [],
    limitations: [],
    additive: true,
    points: values.map(point),
    comparisonPoints: null,
  };
}

describe('isAdverseChange', () => {
  it('HIGHER_IS_BETTER: queda e adversa, alta nao', () => {
    expect(isAdverseChange('HIGHER_IS_BETTER', -1)).toBe(true);
    expect(isAdverseChange('HIGHER_IS_BETTER', 1)).toBe(false);
  });
  it('LOWER_IS_BETTER: alta e adversa, queda nao', () => {
    expect(isAdverseChange('LOWER_IS_BETTER', 1)).toBe(true);
    expect(isAdverseChange('LOWER_IS_BETTER', -1)).toBe(false);
  });
  it('NEUTRAL e sem variacao nunca sao adversos', () => {
    expect(isAdverseChange('NEUTRAL', 100)).toBe(false);
    expect(isAdverseChange('HIGHER_IS_BETTER', 0)).toBe(false);
  });
});

describe('regra de limite absoluto (cost_per_km_above_limit)', () => {
  const rule = findAlertRule('cost_per_km_above_limit')!;

  it('abaixo do limite: sem alerta', () => {
    expect(rule.evaluate(kpi('cost_per_km', { value: 3, direction: 'LOWER_IS_BETTER' }))).toBeNull();
  });

  it('entre warning e critical: WARNING, limitValue = warning', () => {
    const hit = rule.evaluate(kpi('cost_per_km', { value: 6, direction: 'LOWER_IS_BETTER' }));
    expect(hit).toMatchObject({ severity: 'WARNING', limitValue: 5 });
  });

  it('acima do critical: CRITICAL, limitValue = critical', () => {
    const hit = rule.evaluate(kpi('cost_per_km', { value: 9, direction: 'LOWER_IS_BETTER' }));
    expect(hit).toMatchObject({ severity: 'CRITICAL', limitValue: 7 });
  });

  it('KPI UNAVAILABLE (value null) nunca gera alerta', () => {
    expect(rule.evaluate(kpi('cost_per_km', { value: null, unavailableReason: 'Sem distancia.' }))).toBeNull();
  });

  it('regra tem id estavel e versao explicita', () => {
    expect(rule.id).toBe('cost_per_km_above_limit');
    expect(rule.version).toBe(1);
  });
});

describe('regra de limite invertido (operating_margin_below_limit -- baixo e ruim)', () => {
  const rule = findAlertRule('operating_margin_below_limit')!;

  it('margem alta: sem alerta', () => {
    expect(rule.evaluate(kpi('operating_margin', { value: 25, unit: 'PERCENT', direction: 'HIGHER_IS_BETTER' }))).toBeNull();
  });

  it('margem entre critical e warning: WARNING', () => {
    const hit = rule.evaluate(kpi('operating_margin', { value: 5, unit: 'PERCENT', direction: 'HIGHER_IS_BETTER' }));
    expect(hit).toMatchObject({ severity: 'WARNING', limitValue: 10 });
  });

  it('margem negativa (prejuizo): CRITICAL', () => {
    const hit = rule.evaluate(kpi('operating_margin', { value: -2, unit: 'PERCENT', direction: 'HIGHER_IS_BETTER' }));
    expect(hit).toMatchObject({ severity: 'CRITICAL', limitValue: 0 });
  });
});

describe('regra de variacao temporal (revenue_relevant_change)', () => {
  const rule = findAlertRule('revenue_relevant_change')!;

  it('sem comparacao valida: sem alerta (nunca recalcula absoluteChange/percentChange)', () => {
    expect(rule.evaluate(kpi('revenue', { value: 100, unit: 'BRL', direction: 'HIGHER_IS_BETTER', comparison: null }))).toBeNull();
    expect(
      rule.evaluate(
        kpi('revenue', {
          value: 100,
          unit: 'BRL',
          direction: 'HIGHER_IS_BETTER',
          comparison: { period: PERIOD, value: null, absoluteChange: null, percentChange: null, unavailableReason: 'Sem periodo anterior.' },
        }),
      ),
    ).toBeNull();
  });

  it('variacao pequena: sem alerta', () => {
    const hit = rule.evaluate(kpi('revenue', { value: 105000, unit: 'BRL', direction: 'HIGHER_IS_BETTER', comparison: comparison(100000, 5000, 5) }));
    expect(hit).toBeNull();
  });

  it('queda relevante (adversa p/ HIGHER_IS_BETTER): severidade sobe com a magnitude', () => {
    const warning = rule.evaluate(kpi('revenue', { value: 82000, unit: 'BRL', direction: 'HIGHER_IS_BETTER', comparison: comparison(100000, -18000, -18) }));
    expect(warning).toMatchObject({ severity: 'WARNING' });
    const critical = rule.evaluate(kpi('revenue', { value: 60000, unit: 'BRL', direction: 'HIGHER_IS_BETTER', comparison: comparison(100000, -40000, -40) }));
    expect(critical).toMatchObject({ severity: 'CRITICAL' });
  });

  it('alta relevante (favoravel p/ HIGHER_IS_BETTER): severidade INFO, nunca WARNING/CRITICAL', () => {
    const hit = rule.evaluate(kpi('revenue', { value: 140000, unit: 'BRL', direction: 'HIGHER_IS_BETTER', comparison: comparison(100000, 40000, 40) }));
    expect(hit).toMatchObject({ severity: 'INFO' });
  });
});

describe('regra de variacao para KPI em PERCENT (on_time_delivery_rate_relevant_change -- usa pontos percentuais)', () => {
  const rule = findAlertRule('on_time_delivery_rate_relevant_change')!;

  it('queda de 5 p.p. (limite exato) gera WARNING; abaixo disso nao gera nada', () => {
    const noHit = rule.evaluate(kpi('on_time_delivery_rate', { value: 91, unit: 'PERCENT', direction: 'HIGHER_IS_BETTER', comparison: comparison(94, -3, -3.2) }));
    expect(noHit).toBeNull();
    const hit = rule.evaluate(kpi('on_time_delivery_rate', { value: 89, unit: 'PERCENT', direction: 'HIGHER_IS_BETTER', comparison: comparison(94, -5, -5.3) }));
    expect(hit).toMatchObject({ severity: 'WARNING' });
  });
});

describe('regra de desvio dentro do periodo (occurrences_total_period_deviation)', () => {
  const rule = findAlertRule('occurrences_total_period_deviation')!;
  const baseKpi = kpi('occurrences_total', { value: 30, direction: 'LOWER_IS_BETTER' });

  it('sem serie: sem alerta', () => {
    expect(rule.evaluate(baseKpi, undefined)).toBeNull();
  });

  it('poucos baldes com valor (< 5): sem alerta -- nunca inventa baseline', () => {
    const s = series('occurrences_total', [2, 3, null, 2]);
    expect(rule.evaluate(baseKpi, s)).toBeNull();
  });

  it('ultimo balde muito acima da media dos demais (mesmo periodo): WARNING, limitValue = media', () => {
    const s = series('occurrences_total', [2, 3, 2, 3, 20]);
    const hit = rule.evaluate(baseKpi, s);
    expect(hit?.severity).toBe('WARNING');
    expect(hit?.limitValue).toBeCloseTo(2.5, 5);
  });

  it('baldes estaveis: sem alerta', () => {
    const s = series('occurrences_total', [3, 4, 3, 4, 3]);
    expect(rule.evaluate(baseKpi, s)).toBeNull();
  });
});

describe('identidade e versao das regras', () => {
  it('todas as regras tem id unico e versao >= 1', () => {
    const ids = ALERT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of ALERT_RULES) expect(rule.version).toBeGreaterThanOrEqual(1);
  });

  it('findAlertRule retorna undefined para id desconhecido (nunca lanca)', () => {
    expect(findAlertRule('nao_existe')).toBeUndefined();
  });
});

// Achado de investigacao: KPI direction deve vir SEMPRE do catalogo oficial
// (nunca reinterpretado); este teste apenas documenta o contrato lido por
// isAdverseChange.
describe('contrato de direction', () => {
  it('todas as direcoes oficiais sao tratadas', () => {
    const directions: KpiDirection[] = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL'];
    for (const direction of directions) expect(() => isAdverseChange(direction, 1)).not.toThrow();
  });
});
