import { TripStatus, VehicleStatus } from '@prisma/client';
import {
  computeIdleSegments,
  computeMaintenanceOverlapMinutes,
  IdleTripBoundary,
  MaintenanceInterval,
  mergeIntervals,
} from '../../fleet-operations/utils/idle-time.util';
import { KpiPeriod } from './kpi-period.util';

// BI 1 -- tempo da frota dentro de um periodo (utilizacao, disponibilidade,
// ociosidade). Funcao PURA sobre os dados ja carregados por
// FleetIdleTimeService.loadVehicleIdleData -- reaproveita as mesmas regras
// de idle-time.util.ts (segmentos ociosos, sobreposicao com manutencao sem
// duplicar minutos, uniao de intervalos). A unica regra nova aqui e o
// RECORTE de cada intervalo para dentro do periodo pedido (a listagem
// GET /fleet-operations/idle-time devolve periodos inteiros que apenas
// sobrepoem a janela; um KPI de periodo precisa somar so a parte interna).

// Veiculos fora da operacao nao compoem a capacidade da frota. Limitacao
// documentada: nao ha historico de Vehicle.status, entao vale o status ATUAL.
const OUT_OF_OPERATION_STATUSES: readonly VehicleStatus[] = [VehicleStatus.SOLD, VehicleStatus.INACTIVE];
const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];
const MS_PER_MINUTE = 60_000;

export interface FleetTimeVehicleInput {
  vehicleId: string;
  status: VehicleStatus;
  createdAt: Date;
  trips: IdleTripBoundary[];
  maintenanceIntervals: MaintenanceInterval[];
}

export interface FleetTimeTotals {
  /// Veiculos que compoem a capacidade (status atual != SOLD/INACTIVE e
  /// cadastrados antes do fim efetivo do periodo).
  vehiclesConsidered: number;
  /// Soma, por veiculo, dos minutos do periodo em que ele existia no cadastro.
  capacityMinutes: number;
  /// Minutos em viagem (actualDeparture -> actualArrival, ou ate agora se ativa).
  tripMinutes: number;
  /// Minutos cobertos por OS nao cancelada (startedAt/openedAt -> completedAt).
  maintenanceMinutes: number;
  /// Minutos ociosos entre viagens, ja descontada a manutencao.
  idleNetMinutes: number;
  /// Viagens com execucao real que tocaram o periodo.
  tripsConsidered: number;
  /// Periodos ociosos que tocaram o periodo.
  idleSegmentsConsidered: number;
  /// Fim efetivo usado (min(periodo.end, agora)) -- futuro nunca vira capacidade.
  effectiveEnd: Date;
}

function clip(start: Date, end: Date, windowStart: Date, windowEnd: Date): { start: Date; end: Date } | null {
  const s = Math.max(start.getTime(), windowStart.getTime());
  const e = Math.min(end.getTime(), windowEnd.getTime());
  return e > s ? { start: new Date(s), end: new Date(e) } : null;
}

function minutesOf(interval: { start: Date; end: Date }): number {
  return (interval.end.getTime() - interval.start.getTime()) / MS_PER_MINUTE;
}

export interface VehicleFleetTime {
  vehicleId: string;
  /// false = fora de operacao (status atual SOLD/INACTIVE) ou fora da janela
  /// do periodo (vendido antes / cadastrado depois) -- todos os campos abaixo
  /// ficam 0 e o chamador NUNCA deve tratar isso como "0% de utilizacao".
  considered: boolean;
  capacityMinutes: number;
  tripMinutes: number;
  maintenanceMinutes: number;
  idleNetMinutes: number;
  tripsConsidered: number;
  idleSegmentsConsidered: number;
}

const EMPTY_VEHICLE_ROW = (vehicleId: string): VehicleFleetTime => ({
  vehicleId,
  considered: false,
  capacityMinutes: 0,
  tripMinutes: 0,
  maintenanceMinutes: 0,
  idleNetMinutes: 0,
  tripsConsidered: 0,
  idleSegmentsConsidered: 0,
});

// BI 4 -- calculo POR VEICULO, extraido do loop que antes so agregava (nunca
// uma segunda formula: computeFleetTimeTotals abaixo soma exatamente esta
// funcao). Usado tanto pelo agregado (utilizacao/disponibilidade/ociosidade
// da frota inteira) quanto pelo recorte por veiculo (GET /bi/kpis/breakdown
// ?dimension=vehicle).
export function computeVehicleFleetTime(vehicle: FleetTimeVehicleInput, period: KpiPeriod, now: Date): VehicleFleetTime {
  const effectiveEnd = new Date(Math.min(period.end.getTime(), now.getTime()));
  if (OUT_OF_OPERATION_STATUSES.includes(vehicle.status)) return EMPTY_VEHICLE_ROW(vehicle.vehicleId);

  // Veiculo cadastrado no meio do periodo so conta a partir do cadastro.
  const windowStart = new Date(Math.max(period.start.getTime(), vehicle.createdAt.getTime()));
  if (effectiveEnd.getTime() <= windowStart.getTime()) return EMPTY_VEHICLE_ROW(vehicle.vehicleId);

  const row: VehicleFleetTime = {
    ...EMPTY_VEHICLE_ROW(vehicle.vehicleId),
    considered: true,
    capacityMinutes: (effectiveEnd.getTime() - windowStart.getTime()) / MS_PER_MINUTE,
  };

  // Em viagem: uniao dos intervalos de execucao (nunca conta 2x o mesmo
  // minuto caso haja viagens sobrepostas por erro de lancamento).
  const tripIntervals: { start: Date; end: Date }[] = [];
  for (const trip of vehicle.trips) {
    if (!trip.actualDeparture) continue;
    const end = trip.actualArrival ?? (ACTIVE_TRIP_STATUSES.includes(trip.status) ? now : null);
    if (!end) continue;
    const clipped = clip(trip.actualDeparture, end, windowStart, effectiveEnd);
    if (!clipped) continue;
    tripIntervals.push(clipped);
    row.tripsConsidered += 1;
  }
  row.tripMinutes = mergeIntervals(tripIntervals).reduce((sum, i) => sum + minutesOf(i), 0);

  // Manutencao dentro do periodo (OS em aberto vai ate o fim efetivo).
  row.maintenanceMinutes = computeMaintenanceOverlapMinutes(windowStart, effectiveEnd, vehicle.maintenanceIntervals);

  // Ociosidade: mesmos segmentos de GET /fleet-operations/idle-time,
  // recortados ao periodo e liquidos de manutencao.
  for (const segment of computeIdleSegments(vehicle.trips, now)) {
    const clipped = clip(segment.idleStart, segment.idleEnd ?? now, windowStart, effectiveEnd);
    if (!clipped) continue;
    row.idleSegmentsConsidered += 1;
    const maintenance = computeMaintenanceOverlapMinutes(clipped.start, clipped.end, vehicle.maintenanceIntervals);
    row.idleNetMinutes += Math.max(0, minutesOf(clipped) - maintenance);
  }

  return row;
}

// BI 4 -- mapa por veiculo (chave = vehicleId), mesma regra acima aplicada a
// cada veiculo do escopo. Base do recorte por veiculo.
export function computeFleetTimeByVehicle(
  vehicles: FleetTimeVehicleInput[],
  period: KpiPeriod,
  now: Date,
): Map<string, VehicleFleetTime> {
  const map = new Map<string, VehicleFleetTime>();
  for (const vehicle of vehicles) map.set(vehicle.vehicleId, computeVehicleFleetTime(vehicle, period, now));
  return map;
}

export function computeFleetTimeTotals(vehicles: FleetTimeVehicleInput[], period: KpiPeriod, now: Date): FleetTimeTotals {
  const effectiveEnd = new Date(Math.min(period.end.getTime(), now.getTime()));
  const totals: FleetTimeTotals = {
    vehiclesConsidered: 0,
    capacityMinutes: 0,
    tripMinutes: 0,
    maintenanceMinutes: 0,
    idleNetMinutes: 0,
    tripsConsidered: 0,
    idleSegmentsConsidered: 0,
    effectiveEnd,
  };
  for (const row of computeFleetTimeByVehicle(vehicles, period, now).values()) {
    if (!row.considered) continue;
    totals.vehiclesConsidered += 1;
    totals.capacityMinutes += row.capacityMinutes;
    totals.tripMinutes += row.tripMinutes;
    totals.maintenanceMinutes += row.maintenanceMinutes;
    totals.idleNetMinutes += row.idleNetMinutes;
    totals.tripsConsidered += row.tripsConsidered;
    totals.idleSegmentsConsidered += row.idleSegmentsConsidered;
  }
  return totals;
}
