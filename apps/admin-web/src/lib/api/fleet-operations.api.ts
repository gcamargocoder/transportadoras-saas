import type { QueryableParams } from '../../types/api';
import type {
  FleetCostsEntity,
  FleetCompositionsOverviewEntity,
  FleetEmptyTripsSummaryEntity,
  FleetFinancialDashboardEntity,
  FleetFuelAnalyticsEntity,
  FleetMaintenanceDashboardEntity,
  FleetOccurrencesDashboardEntity,
  FleetOperationalIndicatorsEntity,
  FleetOperationsDashboardEntity,
  FleetDowntimeCostEntity,
  FleetStopsDashboardEntity,
  FleetTiresOverviewEntity,
  FleetVehiclesOverviewEntity,
} from '../../types/entities';
import type {
  ExpenseCategory,
  ExpenseStatus,
  RevenueCategory,
  TireStatus,
  TrailerType,
  TripOccurrenceSeverity,
  TripOccurrenceStatus,
  TripOccurrenceType,
  TripStopStatus,
  TripStopType,
  VehicleStatus,
  VehicleType,
} from '../../types/enums';
import { api } from './http';

// Fase 40 -- gestao operacional da frota. Filtros espelham
// FleetOperationsQueryDto (apps/api/src/fleet-operations/dto): startDate/
// endDate filtram pela data do EVENTO real de cada dominio (nunca
// createdAt); fleetId filtra por Vehicle.fleetId (nao se aplica aos cards
// fuel/tires do dashboard consolidado, que reaproveitam os dashboards
// proprios de abastecimento/pneus tal como existem). Fase 44 -- driverId/
// type/status so sao aplicados por getFleetOperationsStops (ranking por
// motorista + alertas de duracao longa), ignorados pelos demais.
export interface FleetOperationsQuery extends QueryableParams {
  startDate?: string | undefined;
  endDate?: string | undefined;
  vehicleId?: string | undefined;
  fleetId?: string | undefined;
  driverId?: string | undefined;
  type?: TripStopType | undefined;
  status?: TripStopStatus | undefined;
  // Aplicados apenas por getFleetOperationsVehicles.
  vehicleType?: VehicleType | undefined;
  vehicleStatus?: VehicleStatus | undefined;
  // Aplicado apenas por getFleetOperationsTires.
  tireStatus?: TireStatus | undefined;
  // Aplicado apenas por getFleetOperationsCompositions.
  trailerType?: TrailerType | undefined;
  // Fase 51 -- aplicados apenas por getFleetOperationsFinancial.
  customerId?: string | undefined;
  revenueCategory?: RevenueCategory | undefined;
  expenseCategory?: ExpenseCategory | undefined;
  expenseStatus?: ExpenseStatus | undefined;
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

// Composicao da frota (iteracao de redesign visual) -- foto do estado atual,
// ignora startDate/endDate.
export function getFleetOperationsVehicles(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetVehiclesOverviewEntity>('/fleet-operations/vehicles', query, signal);
}

// Pneus (iteracao de redesign visual) -- custo/evolucao mensal respeitam
// startDate/endDate; composicao/gauge de desgaste sao estado atual.
export function getFleetOperationsTires(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetTiresOverviewEntity>('/fleet-operations/tires', query, signal);
}

// Tempo parado (TripStop) e receita perdida ESTIMADA (taxa de receita/hora
// por veiculo, historico completo, ignora startDate/endDate -- so o tempo
// parado em si respeita o periodo).
export function getFleetOperationsDowntimeCost(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetDowntimeCostEntity>('/fleet-operations/downtime-cost', query, signal);
}

// Fase 92 -- resumo de viagens vazias (Trip.loadStatus = EMPTY). Listagem
// detalhada/filtrada fica em listEmptyTrips (lib/api/trips.api.ts,
// GET /trips/empty-runs).
export function getFleetOperationsEmptyTrips(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetEmptyTripsSummaryEntity>('/fleet-operations/empty-trips', query, signal);
}

// Uso de veiculo+carreta por viagem: composicao atual da frota de carretas
// (ignora startDate/endDate), configuracao de eixos/ranking/tempo parado vs.
// em uso respeitam o periodo (via viagens no escopo do filtro).
export function getFleetOperationsCompositions(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetCompositionsOverviewEntity>('/fleet-operations/compositions', query, signal);
}

// Fase 51 -- gestao financeira operacional: receita/despesa/custo total/
// adiantamentos/resultado/margem, evolucao mensal, rankings e detalhamento,
// tudo no mesmo escopo de filtro (periodo/veiculo/frota/motorista/cliente/
// categoria/status).
export function getFleetOperationsFinancial(query: FleetOperationsQuery = {}, signal?: AbortSignal) {
  return api.get<FleetFinancialDashboardEntity>('/fleet-operations/financial', query, signal);
}

// Fase 68 -- dashboard de ocorrencias (TripOccurrence, Fase 67). DTO proprio
// (nao reaproveita FleetOperationsQuery -- from/to/type/status la ja tem
// outro significado, ver find-fleet-occurrences-query.dto.ts no backend).
export interface FleetOccurrencesQuery extends QueryableParams {
  from?: string | undefined;
  to?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  type?: TripOccurrenceType | undefined;
  severity?: TripOccurrenceSeverity | undefined;
  status?: TripOccurrenceStatus | undefined;
}

export function getFleetOperationsOccurrences(query: FleetOccurrencesQuery = {}, signal?: AbortSignal) {
  return api.get<FleetOccurrencesDashboardEntity>('/fleet-operations/occurrences', query, signal);
}
