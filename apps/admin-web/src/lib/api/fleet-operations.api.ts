import type { QueryableParams } from '../../types/api';
import type {
  FleetCostsEntity,
  FleetFuelAnalyticsEntity,
  FleetMaintenanceDashboardEntity,
  FleetOperationalIndicatorsEntity,
  FleetOperationsDashboardEntity,
  FleetStopsDashboardEntity,
} from '../../types/entities';
import { api } from './http';

// Fase 40 -- gestao operacional da frota. Filtros espelham
// FleetOperationsQueryDto (apps/api/src/fleet-operations/dto): startDate/
// endDate filtram pela data do EVENTO real de cada dominio (nunca
// createdAt); fleetId filtra por Vehicle.fleetId (nao se aplica aos cards
// fuel/tires do dashboard consolidado, que reaproveitam os dashboards
// proprios de abastecimento/pneus tal como existem).
export interface FleetOperationsQuery extends QueryableParams {
  startDate?: string | undefined;
  endDate?: string | undefined;
  vehicleId?: string | undefined;
  fleetId?: string | undefined;
}

export function getFleetOperationsDashboard(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetOperationsDashboardEntity>('/fleet-operations/dashboard', query, signal);
}

export function getFleetOperationsCosts(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetCostsEntity>('/fleet-operations/costs', query, signal);
}

export function getFleetOperationsMaintenance(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetMaintenanceDashboardEntity>('/fleet-operations/maintenance', query, signal);
}

export function getFleetOperationsStops(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetStopsDashboardEntity>('/fleet-operations/stops', query, signal);
}

export function getFleetOperationsIndicators(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetOperationalIndicatorsEntity>('/fleet-operations/operations', query, signal);
}

// Fase 42 -- gestao avancada de abastecimento (breakdown por veiculo/frota,
// rankings, evolucao mensal, periodo anterior e alertas).
export function getFleetOperationsFuel(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetFuelAnalyticsEntity>('/fleet-operations/fuel', query, signal);
}
