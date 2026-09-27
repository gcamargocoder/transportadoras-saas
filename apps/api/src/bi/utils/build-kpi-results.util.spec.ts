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
          ? { vehicleDistances: new Map(), totalDistanceKm: null, odometerReadings: 1, readingCounts: new Map() }
          : {
              vehicleDistances: new Map([['v1', distanceKm]]),
              totalDistanceKm: distanceKm,
              odometerReadings: 6,
              readingCounts: new Map([['v1', 6]]),
            },
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
    fuelTank: {
      stockAtEnd: 7000,
      tanksConsidered: 1,
      receivedLiters: 2000,
      receiptCount: 2,
      receivedCost: 11000,
      averagePurchasePrice: 5.5,
      pricedReceiptLiters: 2000,
      internalLiters: 1200,
      internalFuelingCount: 4,
      adjustmentLitersNet: -30,
      adjustmentCount: 1,
      movementsCount: 7,
      reconciliationDivergenceLiters: -30,
      reconciliationChecksCount: 1,
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

  // Fase 6 -- ledger do tanque proprio (fuel_tank_*), fonte SEPARADA de
  // fuel_cost/fuel_liters (FuelSupply, consumo do veiculo) ja testados acima.
  describe('gestao de combustivel -- ledger do tanque (Fase 6)', () => {
    it('estoque, entradas, saidas, ajustes, custo e contagem de movimentacoes', () => {
      expect(valueOf('fuel_tank_stock', s).value).toBe(7000);
      expect(valueOf('fuel_received_liters', s).value).toBe(2000);
      expect(valueOf('fuel_internal_liters', s).value).toBe(1200);
      expect(valueOf('fuel_adjustment_liters', s).value).toBe(-30);
      expect(valueOf('fuel_received_cost', s).value).toBe(11000);
      expect(valueOf('fuel_average_purchase_price', s).value).toBe(5.5);
      expect(valueOf('fuel_movements_count', s).value).toBe(7);
      expect(valueOf('fuel_reconciliation_divergence_liters', s).value).toBe(-30);
    });

    it('estoque indisponivel (nenhum tanque com movimentacao ate o periodo) fica UNAVAILABLE, nunca 0', () => {
      const noStock = snapshot({ fuelTank: { ...s.fuelTank, stockAtEnd: null, tanksConsidered: 1 } });
      const result = valueOf('fuel_tank_stock', noStock);
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.value).toBeNull();
      expect(result.unavailableReason).toBeTruthy();
    });

    it('preco medio de compra indisponivel sem recebimento com preco fica UNAVAILABLE, nunca 0', () => {
      const noPrice = snapshot({ fuelTank: { ...s.fuelTank, averagePurchasePrice: null, pricedReceiptLiters: 0 } });
      const result = valueOf('fuel_average_purchase_price', noPrice);
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.value).toBeNull();
    });

    it('ajuste negativo (falta) preserva o sinal -- nunca convertido para valor absoluto', () => {
      expect(valueOf('fuel_adjustment_liters', s).value).toBeLessThan(0);
      expect(valueOf('fuel_reconciliation_divergence_liters', s).value).toBeLessThan(0);
    });

    it('evidencias: cada KPI aponta para a fonte correta do ledger', () => {
      expect(valueOf('fuel_tank_stock', s).evidence).toEqual([expect.objectContaining({ source: 'FUEL_TANK_STOCK_SNAPSHOT' })]);
      expect(valueOf('fuel_received_liters', s).evidence).toEqual([expect.objectContaining({ source: 'FUEL_TANK_RECEIPT', recordCount: 2 })]);
      expect(valueOf('fuel_internal_liters', s).evidence).toEqual([
        expect.objectContaining({ source: 'FUEL_TANK_INTERNAL_FUELING', recordCount: 4 }),
      ]);
      expect(valueOf('fuel_adjustment_liters', s).evidence).toEqual([expect.objectContaining({ source: 'FUEL_TANK_ADJUSTMENT', recordCount: 1 })]);
      expect(valueOf('fuel_reconciliation_divergence_liters', s).evidence).toEqual([
        expect.objectContaining({ source: 'FUEL_TANK_INVENTORY_CHECK', recordCount: 1 }),
      ]);
      const movementsEvidence = valueOf('fuel_movements_count', s).evidence.map((e) => e.source);
      expect(movementsEvidence).toEqual(['FUEL_TANK_RECEIPT', 'FUEL_TANK_INTERNAL_FUELING', 'FUEL_TANK_ADJUSTMENT']);
    });

    it('recorte por cliente nao se aplica: fica indisponivel sem executar a formula (mesmo padrao de receita x custo)', () => {
      const result = buildKpiResult(findKpiDefinition('fuel_tank_stock')!, s, null, { customer: true });
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.unavailableReason).toMatch(/cliente/);
    });

    it('recorte por veiculo/frota nao se aplica a fuel_tank_stock (sem vinculo com veiculo)', () => {
      const result = buildKpiResult(findKpiDefinition('fuel_tank_stock')!, s, null, { vehicle: true });
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.unavailableReason).toMatch(/veiculo/);
    });

    it('fuel_internal_liters ACEITA recorte por veiculo (abastecimento interno sempre vinculado a um veiculo)', () => {
      const result = buildKpiResult(findKpiDefinition('fuel_internal_liters')!, s, null, { vehicle: true });
      expect(result.status).toBe('AVAILABLE');
      expect(result.value).toBe(1200);
    });

    it('recorte por tanque so se aplica aos KPIs de tanque -- fuel_cost (FuelSupply) fica indisponivel', () => {
      const result = buildKpiResult(findKpiDefinition('fuel_cost')!, s, null, { tank: true });
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.unavailableReason).toMatch(/tanque/);
      const tankResult = buildKpiResult(findKpiDefinition('fuel_tank_stock')!, s, null, { tank: true });
      expect(tankResult.status).toBe('AVAILABLE');
    });
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
