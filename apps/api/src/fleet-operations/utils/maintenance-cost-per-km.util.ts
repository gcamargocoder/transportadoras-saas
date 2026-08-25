import { computeVehicleDistancesKm } from '../../common/utils/vehicle-distance.util';

// Fase 45 -- custo de manutencao por km, seguindo a MESMA metodologia ja
// estabelecida para abastecimento (common/utils/fuel-consumption.util.ts):
// distancia = maior menos menor odometro registrado, somada por veiculo
// ANTES de dividir pelo custo somado (nunca uma media de razoes). So
// veiculos com >= 2 registros com odometerKm preenchido contribuem --
// custo de veiculos sem essa informacao suficiente fica de fora (nunca
// distorce o denominador usando odometro como se fosse distancia sem base
// para tal).
//
// Fase 85 -- o calculo de distancia em si (max-min por veiculo) foi
// extraido para common/utils/vehicle-distance.util.ts (computeVehicleDistancesKm),
// reutilizado tambem pelo custo/km da frota inteira em
// FleetOperationsMetricsService.computeCosts -- nunca duas implementacoes
// da mesma formula. Esta funcao preserva seu contrato original (exclui o
// CUSTO de veiculos sem distancia qualificada, especifico deste calculo).
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
  const distances = computeVehicleDistancesKm(points.map((p) => ({ vehicleId: p.vehicleId, odometerKm: p.odometerKm })));
  if (distances.size === 0) return null;

  const costByVehicle = new Map<string, number>();
  for (const point of points) {
    costByVehicle.set(point.vehicleId, (costByVehicle.get(point.vehicleId) ?? 0) + point.totalCost);
  }

  let totalCost = 0;
  let totalDistanceKm = 0;
  for (const [vehicleId, distanceKm] of distances) {
    totalDistanceKm += distanceKm;
    totalCost += costByVehicle.get(vehicleId) ?? 0;
  }
  return { totalCost, totalDistanceKm };
}
