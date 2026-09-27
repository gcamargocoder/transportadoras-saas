import { describe, expect, it } from 'vitest';
import type { BiAlertEntity, KpiResultEntity } from '../../types/entities';
import { buildAlertMessage } from './alert-format';

function kpi(overrides: Partial<KpiResultEntity> = {}): KpiResultEntity {
  return {
    id: 'cost_per_km',
    name: 'Custo por km',
    description: '',
    category: 'OPERATIONAL',
    unit: 'BRL_PER_KM',
    direction: 'LOWER_IS_BETTER',
    formula: '',
    sources: [],
    dimensions: [],
    limitations: [],
    additive: false,
    status: 'AVAILABLE',
    unavailableReason: null,
    value: 9,
    period: { start: '', end: '' },
    comparison: null,
    inputs: [],
    evidence: [],
    ...overrides,
  };
}

function alert(overrides: Partial<BiAlertEntity> = {}): BiAlertEntity {
  return {
    id: 'x',
    ruleId: 'cost_per_km_above_limit',
    ruleVersion: 1,
    name: 'Custo por km acima do limite',
    description: 'desc',
    severity: 'CRITICAL',
    conditionType: 'ABSOLUTE_THRESHOLD',
    limitValue: 7,
    referenceLabel: 'limite',
    kpi: kpi(),
    ...overrides,
  };
}

describe('buildAlertMessage', () => {
  it('ABSOLUTE_THRESHOLD: menciona o valor atual e o limite', () => {
    const message = buildAlertMessage(alert());
    expect(message).toContain('Custo por km está em');
    expect(message).toMatch(/9,00\/km/);
    expect(message).toMatch(/limite de R\$\s*7,00\/km/);
  });

  it('COMPARISON_CHANGE: usa o percentual oficial quando disponivel', () => {
    const message = buildAlertMessage(
      alert({
        conditionType: 'COMPARISON_CHANGE',
        limitValue: null,
        referenceLabel: 'período de comparação',
        kpi: kpi({
          id: 'revenue',
          name: 'Receita',
          unit: 'BRL',
          value: 20000,
          comparison: { period: { start: '', end: '' }, value: 100000, absoluteChange: -80000, percentChange: -80, unavailableReason: null },
        }),
      }),
    );
    expect(message).toContain('variação de 80%');
  });

  it('COMPARISON_CHANGE: sem percentChange, usa a variacao absoluta na unidade do KPI (nunca inventa percentual)', () => {
    const message = buildAlertMessage(
      alert({
        conditionType: 'COMPARISON_CHANGE',
        limitValue: null,
        kpi: kpi({
          id: 'revenue',
          name: 'Receita',
          unit: 'BRL',
          value: 20000,
          comparison: { period: { start: '', end: '' }, value: 0, absoluteChange: 20000, percentChange: null, unavailableReason: null },
        }),
      }),
    );
    expect(message).not.toMatch(/%/);
  });

  it('PERIOD_DEVIATION: menciona a media dos demais intervalos', () => {
    const message = buildAlertMessage(
      alert({
        conditionType: 'PERIOD_DEVIATION',
        limitValue: 2.5,
        referenceLabel: 'média do período',
        kpi: kpi({ id: 'occurrences_total', name: 'Ocorrências', unit: 'COUNT', value: 20 }),
      }),
    );
    expect(message).toContain('Ocorrências está em 20 no intervalo mais recente');
    expect(message).toMatch(/média de (2|3) nos demais intervalos do período/);
  });

  it('KPI sem valor (nunca deveria chegar do backend): cai para a descricao da regra, nunca quebra', () => {
    expect(buildAlertMessage(alert({ kpi: kpi({ value: null, unavailableReason: 'x' }) }))).toBe('desc');
  });
});
