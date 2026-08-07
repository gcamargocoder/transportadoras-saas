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
    const previous = sorted[i - 1];
    const current = sorted[i];
    const distanceKm = current.odometerKm - previous.odometerKm;
    segments.push({
      id: current.id,
      distanceKm,
      consumptionKmL: current.liters > 0 ? distanceKm / current.liters : null,
    });
  }

  return segments;
}

// Consumo medio agregado: distancia total (primeiro ao ultimo odometro)
// dividida pelos litros abastecidos ENTRE eles (exclui o primeiro
// abastecimento, que so estabelece o ponto de partida do odometro, sem
// trecho anterior para medir). Mais preciso que a media simples dos
// segmentos individuais (nao pondera trechos curtos igualmente a longos).
export function computeAverageConsumptionKmL(points: FuelConsumptionPoint[]): number | null {
  const sorted = sortByOdometer(points);
  if (sorted.length < 2) return null;

  const totalDistanceKm = sorted[sorted.length - 1].odometerKm - sorted[0].odometerKm;
  const totalLiters = sorted.slice(1).reduce((sum, point) => sum + point.liters, 0);

  return totalLiters > 0 ? totalDistanceKm / totalLiters : null;
}

export function computeTotalAmount(liters: number, pricePerLiter: number): number {
  return Math.round(liters * pricePerLiter * 100) / 100;
}
