// Compara duas RoutePlan (ex: original x recalculada apos desvio) -- funcao
// pura, mesma padrao de toll-calculation.util.ts. Usada tanto pelo endpoint
// de recalculo quanto pela UI administrativa ("ROTA ORIGINAL / NOVA ROTA /
// Diferenca") para nunca duplicar essa subtracao em mais de um lugar.
export interface RouteComparisonInput {
  distanceMeters: number;
  durationSeconds: number;
  tollCount: number;
  totalTollAmount: number | null;
}

export interface RouteComparisonResult {
  distanceMetersDiff: number;
  durationSecondsDiff: number;
  tollCountDiff: number;
  /** Nulo quando qualquer um dos dois lados nao tem custo de pedagio conhecido. */
  totalTollAmountDiff: number | null;
}

export function computeRouteComparison(
  previous: RouteComparisonInput,
  next: RouteComparisonInput,
): RouteComparisonResult {
  return {
    distanceMetersDiff: next.distanceMeters - previous.distanceMeters,
    durationSecondsDiff: next.durationSeconds - previous.durationSeconds,
    tollCountDiff: next.tollCount - previous.tollCount,
    totalTollAmountDiff:
      previous.totalTollAmount !== null && next.totalTollAmount !== null
        ? Math.round((next.totalTollAmount - previous.totalTollAmount) * 100) / 100
        : null,
  };
}
