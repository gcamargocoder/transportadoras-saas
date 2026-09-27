import { describe, expect, it } from 'vitest';
import type { KpiResultEntity } from '../../types/entities';
import { buildInsights, buildKpiInsight } from './report-insights';

function kpi(overrides: Partial<KpiResultEntity> = {}): KpiResultEntity {
  return {
    id: 'operating_cost',
    name: 'Despesas operacionais',
    description: '',
    category: 'FINANCIAL',
    unit: 'BRL',
    direction: 'LOWER_IS_BETTER',
    formula: '',
    sources: [],
    dimensions: [],
    limitations: [],
    additive: true,
    status: 'AVAILABLE',
    unavailableReason: null,
    value: 354200,
    period: { start: '', end: '' },
    comparison: { period: { start: '', end: '' }, value: 330000, absoluteChange: 24200, percentChange: 7.33, unavailableReason: null },
    inputs: [],
    evidence: [],
    ...overrides,
  };
}

describe('buildKpiInsight (BI 9 -- motor de interpretacao)', () => {
  it('gera frase de aumento com percentual oficial (custo, LOWER_IS_BETTER)', () => {
    const insight = buildKpiInsight(kpi());
    expect(insight?.text).toBe('Despesas operacionais aumentou 7,3% em relação ao período anterior.');
    expect(insight?.tone).toBe('negative'); // custo subindo e pior
  });

  it('gera frase de queda com tom positivo quando LOWER_IS_BETTER cai', () => {
    const insight = buildKpiInsight(
      kpi({ comparison: { period: { start: '', end: '' }, value: 400000, absoluteChange: -45800, percentChange: -11.5, unavailableReason: null } }),
    );
    expect(insight?.text).toContain('diminuiu 11,5%');
    expect(insight?.tone).toBe('positive');
  });

  it('KPI PERCENT descreve de-para (ex: pontualidade) e nunca assume que queda e sempre negativa', () => {
    const onTime = kpi({
      id: 'on_time_delivery_rate',
      name: 'Entregas no prazo',
      unit: 'PERCENT',
      direction: 'HIGHER_IS_BETTER',
      value: 89,
      comparison: { period: { start: '', end: '' }, value: 94, absoluteChange: -5, percentChange: -5.3, unavailableReason: null },
      inputs: [{ key: 'coverage', label: 'Cobertura', value: 82, unit: 'PERCENT' }],
    });
    const insight = buildKpiInsight(onTime);
    expect(insight?.text).toBe('Entregas no prazo diminuiu de 94,0% para 89,0%. Cobertura de dados: 82,0%.');
    expect(insight?.tone).toBe('negative');
  });

  it('KPI NEUTRAL (ex: distancia) nunca recebe tom positivo/negativo', () => {
    const distance = kpi({ id: 'distance_km', name: 'Distância percorrida', unit: 'KM', direction: 'NEUTRAL', value: 90000, comparison: { period: { start: '', end: '' }, value: 84133, absoluteChange: 5867, percentChange: 6.97, unavailableReason: null } });
    const insight = buildKpiInsight(distance);
    expect(insight?.tone).toBe('neutral');
  });

  it('sem variacao: frase de estabilidade, nunca "aumentou 0%"', () => {
    const insight = buildKpiInsight(kpi({ value: 330000, comparison: { period: { start: '', end: '' }, value: 330000, absoluteChange: 0, percentChange: 0, unavailableReason: null } }));
    expect(insight?.text).toBe('Despesas operacionais ficou estável em relação ao período anterior.');
    expect(insight?.tone).toBe('neutral');
  });

  it('KPI UNAVAILABLE (value null) nunca gera conclusao', () => {
    expect(buildKpiInsight(kpi({ value: null, unavailableReason: 'Sem dado.' }))).toBeNull();
  });

  it('sem base de comparacao valida (comparison null ou incompleta) nunca gera conclusao', () => {
    expect(buildKpiInsight(kpi({ comparison: null }))).toBeNull();
    expect(buildKpiInsight(kpi({ comparison: { period: { start: '', end: '' }, value: null, absoluteChange: null, percentChange: null, unavailableReason: 'Sem periodo anterior.' } }))).toBeNull();
  });

  it('percentChange nulo (ex: base zero) usa a variacao absoluta na unidade do KPI, nunca inventa percentual', () => {
    const insight = buildKpiInsight(kpi({ comparison: { period: { start: '', end: '' }, value: 0, absoluteChange: 354200, percentChange: null, unavailableReason: null } }));
    expect(insight?.text).toContain('aumentou');
    expect(insight?.text).not.toMatch(/%/);
  });
});

describe('buildInsights', () => {
  it('ignora KPIs ausentes do mapa e os sem insight valido, preservando a ordem pedida', () => {
    const kpis = new Map<string, KpiResultEntity>([
      ['operating_cost', kpi()],
      ['revenue', kpi({ id: 'revenue', name: 'Receita', value: null })],
    ]);
    const insights = buildInsights(['revenue', 'operating_cost', 'nao_existe'], kpis);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.kpiId).toBe('operating_cost');
  });
});
