import { TireLocationType } from '@prisma/client';
import { computeTireLifecycle } from './tire-lifecycle.util';

describe('computeTireLifecycle', () => {
  const now = new Date('2026-08-22T00:00:00.000Z');

  it('soma purchasePrice + custo de recapagens em totalCost', () => {
    const result = computeTireLifecycle({
      purchasePrice: 1500,
      retreadCostSum: 300,
      retreadsCount: 1,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.STOCK,
      mostRecentInstallDate: null,
      odometerReadings: [],
      now,
    });
    expect(result.totalCost).toBe(1800);
  });

  it('trata purchasePrice nulo como zero, nunca lanca erro', () => {
    const result = computeTireLifecycle({
      purchasePrice: null,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.STOCK,
      mostRecentInstallDate: null,
      odometerReadings: [],
      now,
    });
    expect(result.totalCost).toBe(0);
  });

  it('interventionsCount soma recapagens + inspecoes', () => {
    const result = computeTireLifecycle({
      purchasePrice: 0,
      retreadCostSum: 0,
      retreadsCount: 2,
      inspectionsCount: 3,
      currentLocationType: TireLocationType.STOCK,
      mostRecentInstallDate: null,
      odometerReadings: [],
      now,
    });
    expect(result.interventionsCount).toBe(5);
  });

  it('daysInstalled fica null quando o pneu esta em STOCK', () => {
    const result = computeTireLifecycle({
      purchasePrice: 0,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.STOCK,
      mostRecentInstallDate: new Date('2026-08-01T00:00:00.000Z'),
      odometerReadings: [],
      now,
    });
    expect(result.daysInstalled).toBeNull();
  });

  it('daysInstalled fica null quando nunca houve movimentacao', () => {
    const result = computeTireLifecycle({
      purchasePrice: 0,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.VEHICLE,
      mostRecentInstallDate: null,
      odometerReadings: [],
      now,
    });
    expect(result.daysInstalled).toBeNull();
  });

  it('daysInstalled calcula dias corridos desde a instalacao mais recente', () => {
    const result = computeTireLifecycle({
      purchasePrice: 0,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.VEHICLE,
      mostRecentInstallDate: new Date('2026-08-12T00:00:00.000Z'),
      odometerReadings: [],
      now,
    });
    expect(result.daysInstalled).toBe(10);
  });

  it('costPerKm indisponivel com menos de 2 leituras distintas de odometro', () => {
    const zero = computeTireLifecycle({
      purchasePrice: 1000,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.VEHICLE,
      mostRecentInstallDate: null,
      odometerReadings: [],
      now,
    });
    expect(zero.costPerKm).toEqual({ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' });

    const one = computeTireLifecycle({
      purchasePrice: 1000,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.VEHICLE,
      mostRecentInstallDate: null,
      odometerReadings: [100000, 100000],
      now,
    });
    expect(one.costPerKm.available).toBe(false);
  });

  it('costPerKm disponivel = totalCost / (maior - menor leitura)', () => {
    const result = computeTireLifecycle({
      purchasePrice: 1000,
      retreadCostSum: 500,
      retreadsCount: 1,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.VEHICLE,
      mostRecentInstallDate: null,
      odometerReadings: [100000, 105000, 102000],
      now,
    });
    expect(result.costPerKm).toEqual({ value: 1500 / 5000, available: true, reason: null });
  });
});
