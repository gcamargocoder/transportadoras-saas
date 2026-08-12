export interface VehicleRankingAccumulator {
  value: number;
  count: number;
}

export interface VehicleRankingEntry extends VehicleRankingAccumulator {
  vehicleId: string;
}

/// Divisao com guarda -- retorna null (nunca 0 falso) quando o denominador
/// e zero, para o frontend nunca confundir "sem dado" com "media zero".
export function safeAverage(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

/// Acumula (valor, contagem) por vehicleId a partir de linhas de
/// `groupBy(['vehicleId'])`, ignorando linhas sem vehicleId (relacao
/// opcional). Mutavel por design -- chamada varias vezes sobre o mesmo Map
/// para mesclar fontes diferentes (ex: combustivel + manutencao + pedagio).
export function mergeVehicleAmounts<T extends { vehicleId: string | null; _count: number }>(
  target: Map<string, VehicleRankingAccumulator>,
  rows: T[],
  valueOf: (row: T) => number,
): void {
  for (const row of rows) {
    if (!row.vehicleId) continue;
    const current = target.get(row.vehicleId) ?? { value: 0, count: 0 };
    current.value += valueOf(row);
    current.count += row._count;
    target.set(row.vehicleId, current);
  }
}

/// Ordena por valor decrescente (ou por `count`, para rankings "por
/// quantidade" como nº de manutencoes/viagens) e corta em `limit` --
/// puramente em memoria, sem consulta ao banco (a busca de placa acontece a
/// parte, em lote). `direction: 'asc'` inverte para rankings "menor"/"pior"
/// (Fase 42, secao E do pedido -- menor custo, pior consumo etc.), mesma
/// funcao, nunca duplicada.
export function rankTopVehicles(
  merged: Map<string, VehicleRankingAccumulator>,
  limit: number,
  sortBy: 'value' | 'count' = 'value',
  direction: 'asc' | 'desc' = 'desc',
): VehicleRankingEntry[] {
  const factor = direction === 'desc' ? -1 : 1;
  return [...merged.entries()]
    .sort((a, b) => factor * (a[1][sortBy] - b[1][sortBy]))
    .slice(0, limit)
    .map(([vehicleId, agg]) => ({ vehicleId, value: agg.value, count: agg.count }));
}

/// Agrupa um Map de acumuladores por veiculo em um Map por frota, a partir
/// de um mapa auxiliar vehicleId->fleetId (buscado em lote pelo service,
/// nunca 1 query por veiculo). Veiculos sem fleetId caem no balde `null`
/// ("sem frota") -- estado real, nunca omitido.
export function mergeByFleet(
  merged: Map<string, VehicleRankingAccumulator>,
  vehicleFleetMap: Map<string, string | null>,
): Map<string | null, VehicleRankingAccumulator> {
  const byFleet = new Map<string | null, VehicleRankingAccumulator>();
  for (const [vehicleId, agg] of merged.entries()) {
    const fleetId = vehicleFleetMap.get(vehicleId) ?? null;
    const current = byFleet.get(fleetId) ?? { value: 0, count: 0 };
    current.value += agg.value;
    current.count += agg.count;
    byFleet.set(fleetId, current);
  }
  return byFleet;
}

/// Intervalo imediatamente anterior, de mesma duracao, a [start, end] --
/// usado para "comparacao com periodo anterior" (secao C do pedido). Nunca
/// chamado sem um periodo real informado pelo usuario (ver service).
export function computePreviousPeriodRange(start: Date, end: Date): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { start: previousStart, end: previousEnd };
}

/// Variacao percentual entre dois valores -- null (nunca Infinity/0 falso)
/// quando o valor anterior e zero, ja que "variacao percentual a partir de
/// zero" nao e um numero significativo.
export function computeDeltaPercent(current: number, previous: number): number | null {
  return previous !== 0 ? ((current - previous) / previous) * 100 : null;
}

/// Um valor e "outlier" quando excede a media por um multiplicador
/// centralizado em constants (nunca um numero magico espalhado) -- usado
/// pela camada de alertas (secao J do pedido). Sem media positiva, nunca ha
/// outlier (evita falso alarme com denominador degenerado).
export function isOutlier(value: number, average: number, multiplier: number): boolean {
  return average > 0 && value > average * multiplier;
}

/// Simetrico a isOutlier, para o lado "muito abaixo" da media (Fase 42 --
/// ex: consumo muito abaixo da media da frota). Sem media positiva ou
/// multiplicador invalido, nunca ha outlier.
export function isLowOutlier(value: number, average: number, multiplier: number): boolean {
  return average > 0 && multiplier > 0 && value < average / multiplier;
}

// Fase 42 -- acumulador por veiculo do dominio de abastecimento (mais rico
// que VehicleRankingAccumulator: precisa de custo/litros/contagem
// separados, alem da distancia/litros-entre-abastecimentos usada so para
// consumo -- ver FuelSuppliesService.getDashboard, mesmo principio de
// somar segmentos de varios veiculos antes de dividir).
export interface FuelVehicleAggregate {
  cost: number;
  liters: number;
  count: number;
  /** Soma de FuelConsumptionTotals.totalDistanceKm de cada veiculo com >= 2 pontos (0 se nenhum). */
  consumptionDistanceKm: number;
  /** Soma de FuelConsumptionTotals.totalLiters de cada veiculo com >= 2 pontos (0 se nenhum). */
  consumptionLiters: number;
}

/// Agrupa o mapa por veiculo do dominio de abastecimento em um mapa por
/// frota (mesmo espirito de mergeByFleet, mas com o acumulador mais rico
/// FuelVehicleAggregate em vez do generico VehicleRankingAccumulator).
/// fleetId=null = "sem frota" (estado real, nunca omitido).
export function mergeFuelByFleet(
  merged: Map<string, FuelVehicleAggregate>,
  vehicleFleetMap: Map<string, string | null>,
): Map<string | null, FuelVehicleAggregate> {
  const byFleet = new Map<string | null, FuelVehicleAggregate>();
  for (const [vehicleId, agg] of merged.entries()) {
    const fleetId = vehicleFleetMap.get(vehicleId) ?? null;
    const current = byFleet.get(fleetId) ?? {
      cost: 0,
      liters: 0,
      count: 0,
      consumptionDistanceKm: 0,
      consumptionLiters: 0,
    };
    current.cost += agg.cost;
    current.liters += agg.liters;
    current.count += agg.count;
    current.consumptionDistanceKm += agg.consumptionDistanceKm;
    current.consumptionLiters += agg.consumptionLiters;
    byFleet.set(fleetId, current);
  }
  return byFleet;
}

/// Media de (completedAt - openedAt) em horas, apenas sobre pares validos
/// (completedAt preenchido e posterior a openedAt). Calculado em memoria
/// porque Prisma nao agrega diferenca entre 2 colunas DateTime sem SQL
/// bruto, que este projeto evita.
export function computeAverageDurationHours(rows: { openedAt: Date; completedAt: Date | null }[]): number | null {
  const durationsHours = rows
    .filter((row): row is { openedAt: Date; completedAt: Date } => row.completedAt !== null)
    .map((row) => (row.completedAt.getTime() - row.openedAt.getTime()) / (1000 * 60 * 60))
    .filter((hours) => hours >= 0);

  return durationsHours.length > 0 ? durationsHours.reduce((sum, hours) => sum + hours, 0) / durationsHours.length : null;
}
