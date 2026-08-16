// Fase 45 -- custo de manutencao por km, seguindo a MESMA metodologia ja
// estabelecida para abastecimento (common/utils/fuel-consumption.util.ts):
// distancia = maior menos menor odometro registrado, somada por veiculo
// ANTES de dividir pelo custo somado (nunca uma media de razoes). So
// veiculos com >= 2 registros com odometerKm preenchido contribuem --
// custo de veiculos sem essa informacao suficiente fica de fora (nunca
// distorce o denominador usando odometro como se fosse distancia sem base
// para tal).
export interface MaintenanceCostPerKmPoint {
  vehicleId: string;
  odometerKm: number | null;
  totalCost: number;
}

export interface MaintenanceCostPerKmTotals {
  totalCost: number;
  totalDistanceKm: number;
}

export function computeMaintenanceCostPerKmTotals(points: MaintenanceCostPerKmPoint[]): MaintenanceCostPerKmTotals | null {
  const byVehicle = new Map<string, { odometers: number[]; cost: number }>();
  for (const point of points) {
    const entry = byVehicle.get(point.vehicleId) ?? { odometers: [], cost: 0 };
    entry.cost += point.totalCost;
    if (point.odometerKm !== null) entry.odometers.push(point.odometerKm);
    byVehicle.set(point.vehicleId, entry);
  }

  let totalCost = 0;
  let totalDistanceKm = 0;
  for (const { odometers, cost } of byVehicle.values()) {
    if (odometers.length < 2) continue;
    const distanceKm = Math.max(...odometers) - Math.min(...odometers);
    if (distanceKm <= 0) continue;
    totalDistanceKm += distanceKm;
    totalCost += cost;
  }

  return totalDistanceKm > 0 ? { totalCost, totalDistanceKm } : null;
}
