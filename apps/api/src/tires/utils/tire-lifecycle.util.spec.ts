import { TireLocationType } from '@prisma/client';
import { computeTireLifecycle, TireLifecycleInput } from './tire-lifecycle.util';

describe('computeTireLifecycle', () => {
  const now = new Date('2026-08-22T00:00:00.000Z');

  // Fase 110 -- defaults neutros (todos os campos novos ausentes) para nao
  // repetir os 3 campos em todo teste que nao se importa com eles.
  function build(overrides: Partial<TireLifecycleInput> = {}): TireLifecycleInput {
    return {
      purchasePrice: 0,
      retreadCostSum: 0,
      retreadsCount: 0,
      inspectionsCount: 0,
      currentLocationType: TireLocationType.STOCK,
      mostRecentInstallDate: null,
      odometerReadings: [],
      now,
      expectedLifespanKm: null,
      installedAtOdometerKm: null,
      currentOdometerKm: null,
      ...overrides,
    };
  }

  it('soma purchasePrice + custo de recapagens em totalCost', () => {
    const result = computeTireLifecycle(build({ purchasePrice: 1500, retreadCostSum: 300, retreadsCount: 1 }));
    expect(result.totalCost).toBe(1800);
  });

  it('trata purchasePrice nulo como zero, nunca lanca erro', () => {
    const result = computeTireLifecycle(build({ purchasePrice: null }));
    expect(result.totalCost).toBe(0);
  });

  it('interventionsCount soma recapagens + inspecoes', () => {
    const result = computeTireLifecycle(build({ retreadsCount: 2, inspectionsCount: 3 }));
    expect(result.interventionsCount).toBe(5);
  });

  it('daysInstalled fica null quando o pneu esta em STOCK', () => {
    const result = computeTireLifecycle(
      build({ currentLocationType: TireLocationType.STOCK, mostRecentInstallDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    expect(result.daysInstalled).toBeNull();
  });

  it('daysInstalled fica null quando nunca houve movimentacao', () => {
    const result = computeTireLifecycle(build({ currentLocationType: TireLocationType.VEHICLE, mostRecentInstallDate: null }));
    expect(result.daysInstalled).toBeNull();
  });

  it('daysInstalled calcula dias corridos desde a instalacao mais recente', () => {
    const result = computeTireLifecycle(
      build({ currentLocationType: TireLocationType.VEHICLE, mostRecentInstallDate: new Date('2026-08-12T00:00:00.000Z') }),
    );
    expect(result.daysInstalled).toBe(10);
  });

  it('costPerKm indisponivel com menos de 2 leituras distintas de odometro', () => {
    const zero = computeTireLifecycle(build({ purchasePrice: 1000, currentLocationType: TireLocationType.VEHICLE }));
    expect(zero.costPerKm).toEqual({ value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' });

    const one = computeTireLifecycle(
      build({ purchasePrice: 1000, currentLocationType: TireLocationType.VEHICLE, odometerReadings: [100000, 100000] }),
    );
    expect(one.costPerKm.available).toBe(false);
  });

  it('costPerKm disponivel = totalCost / (maior - menor leitura)', () => {
    const result = computeTireLifecycle(
      build({
        purchasePrice: 1000,
        retreadCostSum: 500,
        retreadsCount: 1,
        currentLocationType: TireLocationType.VEHICLE,
        odometerReadings: [100000, 105000, 102000],
      }),
    );
    expect(result.costPerKm).toEqual({ value: 1500 / 5000, available: true, reason: null });
  });

  // Fase 110 -- distanceTraveledSinceInstallKm / remainingLifespanKm / lifespanUsedPercent.
  it('distanceTraveledSinceInstallKm fica null quando o pneu nao esta montado em veiculo', () => {
    const result = computeTireLifecycle(
      build({
        currentLocationType: TireLocationType.STOCK,
        installedAtOdometerKm: 100000,
        currentOdometerKm: 105000,
      }),
    );
    expect(result.distanceTraveledSinceInstallKm).toBeNull();
  });

  it('distanceTraveledSinceInstallKm fica null quando falta a leitura de instalacao ou a atual', () => {
    const semInstalacao = computeTireLifecycle(
      build({ currentLocationType: TireLocationType.VEHICLE, installedAtOdometerKm: null, currentOdometerKm: 105000 }),
    );
    expect(semInstalacao.distanceTraveledSinceInstallKm).toBeNull();

    const semAtual = computeTireLifecycle(
      build({ currentLocationType: TireLocationType.VEHICLE, installedAtOdometerKm: 100000, currentOdometerKm: null }),
    );
    expect(semAtual.distanceTraveledSinceInstallKm).toBeNull();
  });

  it('distanceTraveledSinceInstallKm fica null quando a leitura atual e menor que a de instalacao (dado inconsistente)', () => {
    const result = computeTireLifecycle(
      build({ currentLocationType: TireLocationType.VEHICLE, installedAtOdometerKm: 100000, currentOdometerKm: 99000 }),
    );
    expect(result.distanceTraveledSinceInstallKm).toBeNull();
  });

  it('distanceTraveledSinceInstallKm = odometro atual do veiculo - odometro da instalacao', () => {
    const result = computeTireLifecycle(
      build({ currentLocationType: TireLocationType.VEHICLE, installedAtOdometerKm: 100000, currentOdometerKm: 130000 }),
    );
    expect(result.distanceTraveledSinceInstallKm).toBe(30000);
  });

  it('remainingLifespanKm e lifespanUsedPercent ficam null sem expectedLifespanKm cadastrado', () => {
    const result = computeTireLifecycle(
      build({
        currentLocationType: TireLocationType.VEHICLE,
        installedAtOdometerKm: 100000,
        currentOdometerKm: 130000,
        expectedLifespanKm: null,
      }),
    );
    expect(result.remainingLifespanKm).toBeNull();
    expect(result.lifespanUsedPercent).toBeNull();
  });

  it('remainingLifespanKm e lifespanUsedPercent calculam a partir de expectedLifespanKm', () => {
    const result = computeTireLifecycle(
      build({
        currentLocationType: TireLocationType.VEHICLE,
        installedAtOdometerKm: 100000,
        currentOdometerKm: 130000,
        expectedLifespanKm: 80000,
      }),
    );
    expect(result.distanceTraveledSinceInstallKm).toBe(30000);
    expect(result.remainingLifespanKm).toBe(50000);
    expect(result.lifespanUsedPercent).toBe(37.5);
  });

  it('remainingLifespanKm pode ficar negativo quando o pneu ja rodou alem da vida util esperada', () => {
    const result = computeTireLifecycle(
      build({
        currentLocationType: TireLocationType.VEHICLE,
        installedAtOdometerKm: 100000,
        currentOdometerKm: 190000,
        expectedLifespanKm: 80000,
      }),
    );
    expect(result.remainingLifespanKm).toBe(-10000);
    expect(result.lifespanUsedPercent).toBe(112.5);
  });
});
