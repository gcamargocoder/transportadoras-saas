// Fase 85 -- primitivo compartilhado de distancia real percorrida, extraido
// de maintenance-cost-per-km.util.ts (Fase 45) para poder ser reutilizado
// por qualquer calculo de custo/km que precise agregar leituras de odometro
// de MULTIPLOS dominios (FuelSupply, VehicleMaintenance, etc.) sem duplicar
// a formula. Nunca usa TripMetrics.actualDistanceKm -- auditado e confirmado
// (Fases 41/62) que nenhum service em todo o apps/api/src escreve esse campo.
export interface OdometerReadingPoint {
  vehicleId: string;
  odometerKm: number | null;
}

// Distancia real = MAIOR menos MENOR odometro conhecido, POR VEICULO (nunca
// uma media de razoes entre veiculos). So veiculos com >= 2 leituras validas
// E distancia > 0 entram no mapa retornado -- o CHAMADOR decide se exclui o
// custo de veiculos fora do mapa (ver computeMaintenanceCostPerKmTotals) ou
// se aceita somar o custo total mesmo com denominador parcial (ver
// FleetOperationsMetricsService.computeCosts, custo/km da frota inteira).
export function computeVehicleDistancesKm(points: OdometerReadingPoint[]): Map<string, number> {
  const odometersByVehicle = new Map<string, number[]>();
  for (const point of points) {
    if (point.odometerKm === null) continue;
    const odometers = odometersByVehicle.get(point.vehicleId) ?? [];
    odometers.push(point.odometerKm);
    odometersByVehicle.set(point.vehicleId, odometers);
  }

  const distances = new Map<string, number>();
  for (const [vehicleId, odometers] of odometersByVehicle) {
    if (odometers.length < 2) continue;
    const distanceKm = Math.max(...odometers) - Math.min(...odometers);
    if (distanceKm > 0) distances.set(vehicleId, distanceKm);
  }
  return distances;
}

// Soma a distancia de TODOS os veiculos qualificados (>= 2 leituras, ver
// acima) -- null (nunca 0) quando nenhum veiculo tem dado suficiente, para o
// chamador nunca confundir "sem distancia" com "distancia zero".
export function sumVehicleDistancesKm(points: OdometerReadingPoint[]): number | null {
  const distances = computeVehicleDistancesKm(points);
  if (distances.size === 0) return null;
  let total = 0;
  for (const distanceKm of distances.values()) total += distanceKm;
  return total;
}
