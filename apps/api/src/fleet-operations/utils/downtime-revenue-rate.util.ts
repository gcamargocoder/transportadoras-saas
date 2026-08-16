// Taxa de receita por hora de operacao, usada para estimar quanto a
// empresa deixa de ganhar quando um veiculo fica parado (dashboard "Tempo
// parado e receita perdida"). Funcao pura, sem dependencia de Prisma --
// base = TripMetrics.actualDurationMin (real, gravado por TripsService ao
// concluir a viagem) e TripRevenue.amount somado das viagens do veiculo.
// NUNCA usa distancia (Vehicle/TripMetrics.actualDistanceKm nunca e
// escrito por nenhum service, auditado e documentado em
// docs/fleet-operations-dashboard.md) -- so tempo real de operacao.
export interface RevenuePerHourResult {
  value: number | null;
  available: boolean;
  reason: string | null;
}

// completedTripCount < minTrips -> indisponivel (evita uma taxa instavel
// baseada em 1 unica viagem atipica). totalDurationMin <= 0 -> indisponivel
// (nao ha denominador real). Receita zero com duracao/viagens suficientes
// e uma taxa 0 legitima -- nunca confundida com "sem dado".
export function computeRevenuePerHour(
  totalRevenue: number,
  totalDurationMin: number,
  completedTripCount: number,
  minTrips: number,
): RevenuePerHourResult {
  if (completedTripCount < minTrips) {
    return { value: null, available: false, reason: 'INSUFFICIENT_TRIP_HISTORY' };
  }
  if (totalDurationMin <= 0) {
    return { value: null, available: false, reason: 'NO_OPERATING_HOURS_RECORDED' };
  }
  return { value: totalRevenue / (totalDurationMin / 60), available: true, reason: null };
}
