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
  // Fase 110 -- desgaste projetado por distancia (distinto do desgaste por
  // sulco, que e leitura direta -- ver TireEntity.wearPercentRemaining).
  // Nenhum dos 3 e inventado: expectedLifespanKm vem do cadastro do pneu
  // (opcional), installedAtOdometerKm vem do TireMovement que trouxe o
  // pneu para a localizacao atual, currentOdometerKm vem de
  // Vehicle.odometerKm (so quando o pneu esta montado em VEICULO -- carreta
  // nao tem odometro no sistema).
  expectedLifespanKm: number | null;
  installedAtOdometerKm: number | null;
  currentOdometerKm: number | null;
}

export interface TireLifecycleResult {
  totalCost: number;
  interventionsCount: number;
  daysInstalled: number | null;
  costPerKm: { value: number | null; available: boolean; reason: string | null };
  // Fase 110 -- todos null quando os dados de origem nao existem (nunca
  // estimados/inventados).
  distanceTraveledSinceInstallKm: number | null;
  remainingLifespanKm: number | null;
  lifespanUsedPercent: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TireDistanceLifespanInput {
  currentLocationType: TireLocationType;
  expectedLifespanKm: number | null;
  installedAtOdometerKm: number | null;
  currentOdometerKm: number | null;
}

export interface TireDistanceLifespanResult {
  distanceTraveledSinceInstallKm: number | null;
  remainingLifespanKm: number | null;
  lifespanUsedPercent: number | null;
}

// Fase 110 -- extraida de computeTireLifecycle para ser reaproveitada
// INTEGRALMENTE (nunca uma segunda formula) pelo coletor de notificacoes
// (collectTireLifespanNearReplacement, notifications.service.ts), que
// precisa do mesmo calculo em lote para todos os pneus montados do tenant.
export function computeTireDistanceLifespan(input: TireDistanceLifespanInput): TireDistanceLifespanResult {
  // so calcula enquanto o pneu esta montado em VEICULO (carreta nao tem
  // odometro) e ha as duas leituras necessarias; nunca negativo (leitura de
  // instalacao maior que a atual so pode significar dado inconsistente,
  // entao fica indisponivel em vez de mostrar km negativo).
  const distanceTraveledSinceInstallKm =
    input.currentLocationType === TireLocationType.VEHICLE &&
    input.installedAtOdometerKm !== null &&
    input.currentOdometerKm !== null &&
    input.currentOdometerKm >= input.installedAtOdometerKm
      ? input.currentOdometerKm - input.installedAtOdometerKm
      : null;

  const remainingLifespanKm =
    input.expectedLifespanKm !== null && distanceTraveledSinceInstallKm !== null
      ? input.expectedLifespanKm - distanceTraveledSinceInstallKm
      : null;

  const lifespanUsedPercent =
    input.expectedLifespanKm !== null && input.expectedLifespanKm > 0 && distanceTraveledSinceInstallKm !== null
      ? (distanceTraveledSinceInstallKm / input.expectedLifespanKm) * 100
      : null;

  return { distanceTraveledSinceInstallKm, remainingLifespanKm, lifespanUsedPercent };
}

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

  const { distanceTraveledSinceInstallKm, remainingLifespanKm, lifespanUsedPercent } = computeTireDistanceLifespan({
    currentLocationType: input.currentLocationType,
    expectedLifespanKm: input.expectedLifespanKm,
    installedAtOdometerKm: input.installedAtOdometerKm,
    currentOdometerKm: input.currentOdometerKm,
  });

  return {
    totalCost,
    interventionsCount,
    daysInstalled,
    costPerKm,
    distanceTraveledSinceInstallKm,
    remainingLifespanKm,
    lifespanUsedPercent,
  };
}
