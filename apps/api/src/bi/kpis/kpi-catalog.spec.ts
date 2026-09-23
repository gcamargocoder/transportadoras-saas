import { buildKpiResult, computeKpi } from '../utils/build-kpi-results.util';
import { mapWithConcurrency } from '../utils/concurrency.util';
import { requiredParts } from '../services/bi-kpi-series.service';
import { findKpiDefinition, KPI_CATALOG } from './kpi-catalog';
import { EMPTY_SNAPSHOT } from './empty-snapshot';
import { BiPeriodSnapshot, SnapshotPart } from './kpi.types';

// Parte nao declarada em `requires` vira um objeto que explode ao ser lido:
// garante que a serie temporal pode pular a coleta dessas partes sem mudar
// nenhum valor.
function poisoned(name: string): never {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        throw new Error(`parte nao declarada lida: ${name}.${String(prop)}`);
      },
    },
  ) as never;
}

function snapshotFor(parts: readonly SnapshotPart[]): BiPeriodSnapshot {
  const has = (p: SnapshotPart) => parts.includes(p);
  const costs = has('costs')
    ? {
        ...EMPTY_SNAPSHOT.costs,
        totalCost: 100,
        fuelCost: 40,
        otherCostByCategory: [{ category: 'FOOD' as const, amount: 10 }],
        get distance() {
          if (!has('distance')) return poisoned('costs.distance');
          return { vehicleDistances: new Map([['v', 50]]), totalDistanceKm: 50, odometerReadings: 2 };
        },
      }
    : has('distance')
      ? { ...EMPTY_SNAPSHOT.costs }
      : poisoned('costs');
  return {
    period: { start: new Date(0), end: new Date(1) },
    revenue: has('revenue') ? { totalRevenue: 200, recordCount: 2 } : poisoned('revenue'),
    costs,
    trips: has('trips') ? { completed: 3 } : poisoned('trips'),
    deliveries: has('deliveries') ? { completed: 4, withDeadline: 2, onTime: 1 } : poisoned('deliveries'),
    occurrences: has('occurrences') ? { total: 5, critical: 1 } : poisoned('occurrences'),
    fleetTime: has('fleetTime') ? { ...EMPTY_SNAPSHOT.fleetTime, vehiclesConsidered: 1, capacityMinutes: 600, tripMinutes: 60 } : poisoned('fleetTime'),
  } as BiPeriodSnapshot;
}

describe('catalogo -- requires/additive/dimensoes (BI 3)', () => {
  it.each(KPI_CATALOG.map((k) => [k.id, k] as const))('%s so le as partes declaradas em requires', (_id, kpi) => {
    expect(() => kpi.compute(snapshotFor(kpi.requires))).not.toThrow();
  });

  it('todo KPI declara ao menos uma parte e o flag additive', () => {
    for (const kpi of KPI_CATALOG) {
      expect(kpi.requires.length).toBeGreaterThan(0);
      expect(typeof kpi.additive).toBe('boolean');
    }
  });

  it('razoes e percentuais nunca sao marcados como somaveis', () => {
    for (const kpi of KPI_CATALOG.filter((k) => ['PERCENT', 'BRL_PER_KM'].includes(k.unit))) {
      expect(kpi.additive).toBe(false);
    }
    expect(findKpiDefinition('distance_km')!.additive).toBe(false);
  });

  it('uniao das partes dos KPIs pedidos (serie busca so o necessario)', () => {
    const defs = ['revenue', 'operating_cost'].map((id) => findKpiDefinition(id)!);
    expect(requiredParts(defs).sort()).toEqual(['costs', 'revenue']);
  });

  it('novos KPIs de custo compoem operating_cost', () => {
    const s = snapshotFor(['revenue', 'costs', 'distance']);
    const tire = findKpiDefinition('tire_cost')!.compute(s);
    const other = findKpiDefinition('other_cost')!.compute(s);
    expect(tire.value).toBe(s.costs.tireCost);
    expect(other.value).toBe(s.costs.otherCost);
    expect(other.inputs.find((i) => i.key === 'otherCost.FOOD')?.value).toBe(10);
  });

  it('recorte por cliente: so a receita aceita; os demais ficam indisponiveis sem executar a formula', () => {
    const s = snapshotFor(['revenue', 'costs']);
    expect(computeKpi(findKpiDefinition('revenue')!, s, { customer: true }).value).toBe(200);
    const result = buildKpiResult(findKpiDefinition('operating_result')!, s, s, { customer: true });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.unavailableReason).toMatch(/cliente/);
    expect(result.comparison?.value).toBeNull();
  });
});

describe('mapWithConcurrency', () => {
  it('preserva a ordem e respeita o limite', async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight -= 1;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('lista vazia', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
