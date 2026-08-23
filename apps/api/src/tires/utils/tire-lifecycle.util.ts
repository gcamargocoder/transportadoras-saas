import { TireLocationType } from '@prisma/client';

export interface TireLifecycleInput {
  purchasePrice: number | null;
  retreadCostSum: number;
  retreadsCount: number;
  inspectionsCount: number;
  currentLocationType: TireLocationType;
  mostRecentInstallDate: Date | null;
  odometerReadings: number[];
  now: Date;
}

export interface TireLifecycleResult {
  totalCost: number;
  interventionsCount: number;
  daysInstalled: number | null;
  costPerKm: { value: number | null; available: boolean; reason: string | null };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Fase 64 -- funcao pura (facil de testar isoladamente), reaproveitada por
// TiresService.findOne. daysInstalled so faz sentido enquanto o pneu esta
// efetivamente instalado (locationType != STOCK); em estoque ou sem
// nenhuma movimentacao registrada, fica null (nunca 0 mascarando ausencia).
// costPerKm usa a maior e a menor leitura de odometerKm JA REGISTRADAS
// pelas movimentacoes do proprio pneu -- nunca uma distancia estimada.
export function computeTireLifecycle(input: TireLifecycleInput): TireLifecycleResult {
  const totalCost = (input.purchasePrice ?? 0) + input.retreadCostSum;
  const interventionsCount = input.retreadsCount + input.inspectionsCount;

  const daysInstalled =
    input.currentLocationType !== TireLocationType.STOCK && input.mostRecentInstallDate
      ? Math.max(0, Math.floor((input.now.getTime() - input.mostRecentInstallDate.getTime()) / MS_PER_DAY))
      : null;

  const distinctReadings = [...new Set(input.odometerReadings)];
  let costPerKm: TireLifecycleResult['costPerKm'];
  if (distinctReadings.length < 2) {
    costPerKm = { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' };
  } else {
    const distanceKm = Math.max(...distinctReadings) - Math.min(...distinctReadings);
    costPerKm =
      distanceKm > 0
        ? { value: totalCost / distanceKm, available: true, reason: null }
        : { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' };
  }

  return { totalCost, interventionsCount, daysInstalled, costPerKm };
}
