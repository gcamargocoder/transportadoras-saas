import { findKpiDefinition, KPI_CATALOG } from '../kpis/kpi-catalog';
import { BiPeriodSnapshot, KPI_EVIDENCE_SOURCES } from '../kpis/kpi.types';
import { buildKpiResult, buildKpiResults } from './build-kpi-results.util';
import { isDeliveredOnTime } from './bi-where.util';
import { evidenceSourcesOf } from './kpi-evidence-sources.util';

const HOUR = 60;

function snapshot(overrides: Partial<BiPeriodSnapshot> = {}, distanceKm: number | null = 1000): BiPeriodSnapshot {
  return {
    period: { start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-02-28T23:59:59.999Z') },
    revenue: { totalRevenue: 10000, recordCount: 4 },
    costs: {
      fuelCost: 3000,
      maintenanceCost: 1000,
      tireCost: 500,
      tollCost: 400,
      otherCost: 100,
      totalCost: 5000,
      fuelLiters: 500,
      otherCostByCategory: [],
      recordCounts: { fuelSupplies: 5, maintenances: 1, tires: 1, tireRetreads: 0, tollTransactions: 3, otherExpenses: 2 },
      distance:
        distanceKm === null
          ? { vehicleDistances: new Map(), totalDistanceKm: null, odometerReadings: 1 }
          : { vehicleDistances: new Map([['v1', distanceKm]]), totalDistanceKm: distanceKm, odometerReadings: 6 },
    },
    trips: { completed: 8 },
    deliveries: { completed: 10, withDeadline: 8, onTime: 6 },
    occurrences: { total: 3, critical: 1 },
    fleetTime: {
      vehiclesConsidered: 2,
      capacityMinutes: 200 * HOUR,
      tripMinutes: 50 * HOUR,
      maintenanceMinutes: 20 * HOUR,
      idleNetMinutes: 30 * HOUR,
      tripsConsidered: 8,
      idleSegmentsConsidered: 6,
      effectiveEnd: new Date('2026-02-28T23:59:59.999Z'),
    },
    ...overrides,
  };
}

function valueOf(id: string, s: BiPeriodSnapshot) {
  return buildKpiResult(findKpiDefinition(id)!, s, null);
}

describe('catalogo de KPIs', () => {
  it('ids unicos e metadados completos (formula, fonte, dimensoes)', () => {
    const ids = KPI_CATALOG.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kpi of KPI_CATALOG) {
      expect(kpi.name).toBeTruthy();
      expect(kpi.formula).toBeTruthy();
      expect(kpi.sources.length).toBeGreaterThan(0);
      expect(kpi.dimensions).toContain('period');
    }
  });

  it('toda fonte de evidencia declarada e conhecida', () => {
    for (const kpi of KPI_CATALOG) {
      for (const source of evidenceSourcesOf(kpi)) expect(KPI_EVIDENCE_SOURCES).toContain(source);
    }
  });

  it('snapshot vazio: nenhum KPI produz NaN/Infinity; sem denominador => UNAVAILABLE com motivo', () => {
    const empty = snapshot(
      {
        revenue: { totalRevenue: 0, recordCount: 0 },
        deliveries: { completed: 0, withDeadline: 0, onTime: 0 },
        fleetTime: { ...snapshot().fleetTime, vehiclesConsidered: 0, capacityMinutes: 0, tripMinutes: 0, maintenanceMinutes: 0, idleNetMinutes: 0 },
      },
      null,
    );
    for (const result of buildKpiResults(KPI_CATALOG, empty, empty)) {
      if (result.value !== null) expect(Number.isFinite(result.value)).toBe(true);
      else {
        expect(result.status).toBe('UNAVAILABLE');
        expect(result.unavailableReason).toBeTruthy();
      }
      if (result.comparison?.percentChange != null) expect(Number.isFinite(result.comparison.percentChange)).toBe(true);
    }
    for (const id of ['operating_margin', 'on_time_delivery_rate', 'distance_km', 'cost_per_km', 'revenue_per_km', 'fleet_utilization', 'fleet_availability', 'idle_hours']) {
      expect(valueOf(id, empty).status).toBe('UNAVAILABLE');
    }
  });
});

describe('formulas', () => {
  const s = snapshot();

  it('financeiro: receita, despesas, resultado e margem', () => {
    expect(valueOf('revenue', s).value).toBe(10000);
    expect(valueOf('operating_cost', s).value).toBe(5000);
    expect(valueOf('operating_result', s).value).toBe(5000);
    expect(valueOf('operating_margin', s).value).toBe(50);
  });

  it('despesas = soma dos componentes expostos em inputs (rastreabilidade)', () => {
    const result = valueOf('operating_cost', s);
    const components = result.inputs.filter((i) => i.key !== 'totalCost').reduce((sum, i) => sum + (i.value ?? 0), 0);
    expect(components).toBe(result.value);
  });

  it('resultado negativo gera margem negativa (prejuizo nunca vira 0)', () => {
    const loss = snapshot({ revenue: { totalRevenue: 4000, recordCount: 1 } });
    expect(valueOf('operating_result', loss).value).toBe(-1000);
    expect(valueOf('operating_margin', loss).value).toBe(-25);
  });

  it('por km: custo, receita e consistencia com a distancia', () => {
    expect(valueOf('distance_km', s).value).toBe(1000);
    expect(valueOf('cost_per_km', s).value).toBe(5);
    expect(valueOf('revenue_per_km', s).value).toBe(10);
    const inputs = valueOf('cost_per_km', s).inputs;
    expect(inputs.find((i) => i.key === 'distanceKm')?.value).toBe(1000);
    expect(inputs.find((i) => i.key === 'totalCost')?.value).toBe(5000);
  });

  it('sem distancia qualificada: custo/km indisponivel (nunca divide por zero)', () => {
    const noDistance = snapshot({}, null);
    const result = valueOf('cost_per_km', noDistance);
    expect(result.value).toBeNull();
    expect(result.status).toBe('UNAVAILABLE');
  });

  it('entregas no prazo usa so entregas com previsao; expoe cobertura', () => {
    const result = valueOf('on_time_delivery_rate', s);
    expect(result.value).toBe(75);
    expect(result.inputs.find((i) => i.key === 'coverage')?.value).toBe(80);
  });

  it('frota: utilizacao, disponibilidade e ociosidade', () => {
    expect(valueOf('fleet_utilization', s).value).toBe(25);
    expect(valueOf('fleet_availability', s).value).toBe(90);
    expect(valueOf('idle_hours', s).value).toBe(30);
  });

  it('contagens operacionais e combustivel/pedagio', () => {
    expect(valueOf('trips_completed', s).value).toBe(8);
    expect(valueOf('deliveries_completed', s).value).toBe(10);
    expect(valueOf('occurrences_total', s).value).toBe(3);
    expect(valueOf('occurrences_critical', s).value).toBe(1);
    expect(valueOf('fuel_cost', s).value).toBe(3000);
    expect(valueOf('fuel_liters', s).value).toBe(500);
    expect(valueOf('toll_cost', s).value).toBe(400);
    expect(valueOf('maintenance_cost', s).value).toBe(1000);
  });

  it('evidencias carregam a contagem de registros de origem', () => {
    const evidence = valueOf('operating_cost', s).evidence;
    expect(evidence.find((e) => e.source === 'FUEL_SUPPLY')).toMatchObject({ recordCount: 5, listable: true });
    const fleet = valueOf('fleet_utilization', s).evidence;
    expect(fleet).toEqual([expect.objectContaining({ source: 'FLEET_TIME', listable: false })]);
  });
});

describe('comparacao entre periodos', () => {
  it('variacao absoluta e percentual usando a MESMA formula nos dois periodos', () => {
    const current = snapshot();
    const previous = snapshot({ revenue: { totalRevenue: 8000, recordCount: 3 } });
    const result = buildKpiResult(findKpiDefinition('revenue')!, current, previous);
    expect(result.comparison).toMatchObject({ value: 8000, absoluteChange: 2000, percentChange: 25 });
  });

  it('KPI em percentual: variacao absoluta em pontos percentuais', () => {
    const current = snapshot();
    const previous = snapshot({ revenue: { totalRevenue: 20000, recordCount: 3 } }); // margem 75%
    const result = buildKpiResult(findKpiDefinition('operating_margin')!, current, previous);
    expect(result.comparison?.absoluteChange).toBe(-25);
  });

  it('periodo anterior sem dado: comparacao presente, variacoes null e motivo informado', () => {
    const previous = snapshot({}, null);
    const result = buildKpiResult(findKpiDefinition('cost_per_km')!, snapshot(), previous);
    expect(result.comparison).toMatchObject({ value: null, absoluteChange: null, percentChange: null });
    expect(result.comparison?.unavailableReason).toBeTruthy();
  });

  it('valor anterior zero: percentChange null (nunca Infinity)', () => {
    const previous = snapshot({ trips: { completed: 0 } });
    const result = buildKpiResult(findKpiDefinition('trips_completed')!, snapshot(), previous);
    expect(result.comparison).toMatchObject({ absoluteChange: 8, percentChange: null });
  });

  it('sem periodo de comparacao: comparison null', () => {
    expect(buildKpiResult(findKpiDefinition('revenue')!, snapshot(), null).comparison).toBeNull();
  });
});

describe('isDeliveredOnTime', () => {
  const planned = new Date('2026-02-10T12:00:00Z');

  it('chegada ate a previsao (inclusive) = no prazo', () => {
    expect(isDeliveredOnTime({ plannedArrival: planned, actualArrival: planned, deliveredAt: null })).toBe(true);
  });

  it('1ms depois = atrasada (sem tolerancia)', () => {
    expect(
      isDeliveredOnTime({ plannedArrival: planned, actualArrival: new Date(planned.getTime() + 1), deliveredAt: null }),
    ).toBe(false);
  });

  it('sem actualArrival usa deliveredAt; sem nenhuma data nunca e "no prazo"', () => {
    expect(isDeliveredOnTime({ plannedArrival: planned, actualArrival: null, deliveredAt: new Date('2026-02-10T11:00:00Z') })).toBe(true);
    expect(isDeliveredOnTime({ plannedArrival: planned, actualArrival: null, deliveredAt: null })).toBe(false);
  });
});
