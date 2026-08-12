// Calculo de km rodados/consumo entre abastecimentos consecutivos (Fase 18)
// -- funcao pura, sem dependencia de Prisma, reutilizada tanto por
// FuelSuppliesService (dashboard) quanto por VehiclesController
// (GET /vehicles/:id/fuel-history).
export interface FuelConsumptionPoint {
  id: string;
  odometerKm: number;
  liters: number;
}

export interface FuelConsumptionSegment {
  /** id do abastecimento MAIS RECENTE do par (o que "fechou" o trecho). */
  id: string;
  distanceKm: number;
  /** null quando liters = 0 (nao deveria ocorrer dado liters > 0 obrigatorio, mas defensivo). */
  consumptionKmL: number | null;
}

function sortByOdometer(points: FuelConsumptionPoint[]): FuelConsumptionPoint[] {
  return [...points].sort((a, b) => a.odometerKm - b.odometerKm);
}

// Um segmento por par de abastecimentos consecutivos (ordenados por
// odometro) -- distancia = diferenca de odometro; consumo = distancia /
// litros do abastecimento MAIS RECENTE do par (metodo "tanque cheio a
// tanque cheio", a aproximacao padrao quando nao ha sensor de nivel).
export function computeFuelConsumptionSegments(
  points: FuelConsumptionPoint[],
): FuelConsumptionSegment[] {
  const sorted = sortByOdometer(points);
  const segments: FuelConsumptionSegment[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted.at(i - 1);
    const current = sorted.at(i);
    if (!previous || !current) continue;
    const distanceKm = current.odometerKm - previous.odometerKm;
    segments.push({
      id: current.id,
      distanceKm,
      consumptionKmL: current.liters > 0 ? distanceKm / current.liters : null,
    });
  }

  return segments;
}

export interface FuelConsumptionTotals {
  totalDistanceKm: number;
  /** Litros abastecidos apos o primeiro ponto (que so define o odometro inicial). */
  totalLiters: number;
}

// Totais brutos (distancia + litros) de um conjunto de abastecimentos --
// base tanto de computeAverageConsumptionKmL (um veiculo) quanto de
// agregacoes que precisam somar distancia/litros de VARIOS veiculos antes
// de dividir (ex: dashboard da frota) -- ver FuelSuppliesService.getDashboard.
export function computeConsumptionTotals(
  points: FuelConsumptionPoint[],
): FuelConsumptionTotals | null {
  const sorted = sortByOdometer(points);
  if (sorted.length < 2) return null;

  const first = sorted.at(0);
  const last = sorted.at(-1);
  if (!first || !last) return null;

  return {
    totalDistanceKm: last.odometerKm - first.odometerKm,
    totalLiters: sorted.slice(1).reduce((sum, point) => sum + point.liters, 0),
  };
}

// Consumo medio agregado: distancia total (primeiro ao ultimo odometro)
// dividida pelos litros abastecidos ENTRE eles (exclui o primeiro
// abastecimento, que so estabelece o ponto de partida do odometro, sem
// trecho anterior para medir). Mais preciso que a media simples dos
// segmentos individuais (nao pondera trechos curtos igualmente a longos).
export function computeAverageConsumptionKmL(points: FuelConsumptionPoint[]): number | null {
  const totals = computeConsumptionTotals(points);
  if (!totals) return null;
  return totals.totalLiters > 0 ? totals.totalDistanceKm / totals.totalLiters : null;
}

export function computeTotalAmount(liters: number, pricePerLiter: number): number {
  return Math.round(liters * pricePerLiter * 100) / 100;
}

// Fase 42 -- deteccao de hodometro regressivo. DISTINTO de
// computeConsumptionTotals/computeFuelConsumptionSegments acima: aquelas
// funcoes ordenam por ODOMETRO (nunca produzem distancia negativa "por
// construcao", o que mascara um hodometro digitado errado ou trocado --
// sempre reordenam ao redor do problema em vez de sinaliza-lo). Esta funcao
// ordena pela ordem CRONOLOGICA real (supplyDate) e compara com o
// odometro: se um abastecimento mais recente no tempo tem odometro MENOR
// que o anterior, isso e uma inconsistencia real (nunca deveria acontecer
// em um veiculo real) -- usada pela camada de alertas, nunca pelo calculo
// de consumo em si.
export interface OdometerRegressionPoint {
  id: string;
  supplyDate: Date;
  odometerKm: number;
}

export interface OdometerRegressionPair {
  previousId: string;
  currentId: string;
  previousOdometerKm: number;
  currentOdometerKm: number;
}

export function detectOdometerRegression(points: OdometerRegressionPoint[]): OdometerRegressionPair[] {
  const sortedByDate = [...points].sort((a, b) => a.supplyDate.getTime() - b.supplyDate.getTime());
  const regressions: OdometerRegressionPair[] = [];

  for (let i = 1; i < sortedByDate.length; i++) {
    const previous = sortedByDate.at(i - 1);
    const current = sortedByDate.at(i);
    if (!previous || !current) continue;
    if (current.odometerKm < previous.odometerKm) {
      regressions.push({
        previousId: previous.id,
        currentId: current.id,
        previousOdometerKm: previous.odometerKm,
        currentOdometerKm: current.odometerKm,
      });
    }
  }

  return regressions;
}
