import { Test } from '@nestjs/testing';
import { ALERT_RULES } from '../alerts/alert-rules';
import { KpiResultEntity, KpiSummaryEntity } from '../entities/bi-kpi.entity';
import { BiAlertsService } from './bi-alerts.service';
import { BiKpisService } from './bi-kpis.service';

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

function buildSummary(kpis: KpiResultEntity[]): KpiSummaryEntity {
  return {
    catalogVersion: '2',
    calculatedAt: new Date(),
    scope: { tenantId: 't1', vehicleId: null, fleetId: null, customerId: null, tankId: null },
    period: PERIOD,
    comparisonMode: 'PREVIOUS_PERIOD',
    comparisonPeriod: null,
    kpis,
  };
}

describe('BiAlertsService', () => {
  async function buildService(getSummary: jest.Mock, getSeries: jest.Mock) {
    const moduleRef = await Test.createTestingModule({
      providers: [BiAlertsService, { provide: BiKpisService, useValue: { getSummary, getSeries } }],
    }).compile();
    return moduleRef.get(BiAlertsService);
  }

  it('avaliacao em lote: 1 chamada a getSummary (todos os KPIs das regras) + 1 a getSeries (so KPIs com regra de desvio)', async () => {
    const getSummary = jest.fn().mockResolvedValue(buildSummary([kpi('cost_per_km', { value: 9, unit: 'BRL_PER_KM' })]));
    const getSeries = jest.fn().mockResolvedValue({ series: [] });
    const service = await buildService(getSummary, getSeries);

    await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(getSeries).toHaveBeenCalledTimes(1);
    const [, summaryQuery] = getSummary.mock.calls[0] as [string, { kpis: string[] }];
    const expectedIds = [...new Set(ALERT_RULES.map((rule) => rule.kpiId))];
    expect(summaryQuery.kpis).toEqual(expect.arrayContaining(expectedIds));
  });

  it('KPI ausente do summary (sem valor) nunca gera alerta -- nunca lanca', async () => {
    const getSummary = jest.fn().mockResolvedValue(buildSummary([]));
    const getSeries = jest.fn().mockResolvedValue({ series: [] });
    const service = await buildService(getSummary, getSeries);

    const result = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(result.items).toEqual([]);
  });

  it('gera um alerta rastreavel: kpi oficial embutido, id deterministico, regra+versao', async () => {
    const getSummary = jest.fn().mockResolvedValue(buildSummary([kpi('cost_per_km', { value: 9, unit: 'BRL_PER_KM', direction: 'LOWER_IS_BETTER' })]));
    const getSeries = jest.fn().mockResolvedValue({ series: [] });
    const service = await buildService(getSummary, getSeries);

    const result = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });
    const alert = result.items.find((a) => a.ruleId === 'cost_per_km_above_limit');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.kpi.value).toBe(9);
    expect(alert?.kpi.id).toBe('cost_per_km');
    expect(alert?.ruleVersion).toBe(1);
    expect(alert?.id).toContain('cost_per_km_above_limit:v1:cost_per_km:');
  });

  it('identidade estavel: a mesma entrada gera sempre o mesmo id (chamadas repetidas nunca duplicam identidade)', async () => {
    const getSummary = jest.fn().mockResolvedValue(buildSummary([kpi('cost_per_km', { value: 9, unit: 'BRL_PER_KM' })]));
    const getSeries = jest.fn().mockResolvedValue({ series: [] });
    const service = await buildService(getSummary, getSeries);

    const first = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });
    const second = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(first.items[0]?.id).toBe(second.items[0]?.id);
  });

  it('filtro de severidade aplicado apos a avaliacao', async () => {
    const getSummary = jest
      .fn()
      .mockResolvedValue(buildSummary([kpi('cost_per_km', { value: 6, unit: 'BRL_PER_KM', direction: 'LOWER_IS_BETTER' })]));
    const getSeries = jest.fn().mockResolvedValue({ series: [] });
    const service = await buildService(getSummary, getSeries);

    const all = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(all.items.some((a) => a.ruleId === 'cost_per_km_above_limit')).toBe(true);

    const filtered = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31', severity: ['CRITICAL'] });
    expect(filtered.items.some((a) => a.ruleId === 'cost_per_km_above_limit')).toBe(false);
  });

  it('regra de desvio de periodo so recebe a serie quando ha KPI com essa regra', async () => {
    const getSummary = jest.fn().mockResolvedValue(buildSummary([kpi('occurrences_total', { value: 30 })]));
    const getSeries = jest.fn().mockResolvedValue({
      series: [{ id: 'occurrences_total', points: [2, 3, 2, 3, 20].map((value) => ({ value })) }],
    });
    const service = await buildService(getSummary, getSeries);

    const result = await service.getAlerts('t1', { startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(result.items.some((a) => a.ruleId === 'occurrences_total_period_deviation')).toBe(true);
  });
});
