import type { Paginated, PaginationParams, QueryableParams } from '../../types/api';
import type {
  ContractEntity,
  FreightDashboardEntity,
  FreightQuoteEntity,
  FreightRuleEntity,
  FreightRuleFeeEntity,
  FreightTableEntity,
  TripFreightEntity,
  TripProfitabilityEntity,
} from '../../types/entities';
import type { ContractStatus, FreightRuleStatus, FreightTableStatus, VehicleType } from '../../types/enums';
import { api } from './http';

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

export interface FindContractsQuery extends PaginationParams {
  customerId?: string | undefined;
  status?: ContractStatus | undefined;
  search?: string | undefined;
  expired?: boolean | undefined;
}

export function listContracts(query: FindContractsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ContractEntity>>('/freight/contracts', query, signal);
}

export function getContract(id: string) {
  return api.get<ContractEntity>(`/freight/contracts/${id}`);
}

export interface CreateContractPayload {
  customerId: string;
  code: string;
  description?: string | undefined;
  startDate: string;
  endDate?: string | undefined;
  notes?: string | undefined;
  commercialTerms?: string | undefined;
}

export function createContract(payload: CreateContractPayload) {
  return api.post<ContractEntity>('/freight/contracts', payload);
}

export interface UpdateContractPayload extends Partial<CreateContractPayload> {
  status?: ContractStatus | undefined;
}

export function updateContract(id: string, payload: UpdateContractPayload) {
  return api.patch<ContractEntity>(`/freight/contracts/${id}`, payload);
}

// ---------------------------------------------------------------------------
// Tabelas de frete
// ---------------------------------------------------------------------------

export interface FindFreightTablesQuery extends PaginationParams {
  customerId?: string | undefined;
  contractId?: string | undefined;
  status?: FreightTableStatus | undefined;
  search?: string | undefined;
}

export function listFreightTables(query: FindFreightTablesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FreightTableEntity>>('/freight/tables', query, signal);
}

export function getFreightTable(id: string) {
  return api.get<FreightTableEntity>(`/freight/tables/${id}`);
}

export interface CreateFreightTablePayload {
  customerId: string;
  contractId?: string | undefined;
  name: string;
  code: string;
  effectiveFrom: string;
  effectiveUntil?: string | undefined;
  notes?: string | undefined;
}

export function createFreightTable(payload: CreateFreightTablePayload) {
  return api.post<FreightTableEntity>('/freight/tables', payload);
}

export interface UpdateFreightTablePayload extends Partial<CreateFreightTablePayload> {
  status?: FreightTableStatus | undefined;
}

export function updateFreightTable(id: string, payload: UpdateFreightTablePayload) {
  return api.patch<FreightTableEntity>(`/freight/tables/${id}`, payload);
}

// ---------------------------------------------------------------------------
// Regras de frete (versionadas)
// ---------------------------------------------------------------------------

export interface FindFreightRulesQuery extends PaginationParams {
  freightTableId?: string | undefined;
  status?: FreightRuleStatus | undefined;
}

export function listFreightRules(query: FindFreightRulesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FreightRuleEntity>>('/freight/rules', query, signal);
}

export function getFreightRule(id: string) {
  return api.get<FreightRuleEntity>(`/freight/rules/${id}`);
}

export interface FreightRuleFields {
  originLocationId?: string | undefined;
  destinationLocationId?: string | undefined;
  originRegion?: string | undefined;
  destinationRegion?: string | undefined;
  cargoType?: string | undefined;
  vehicleType?: VehicleType | undefined;
  minWeightKg?: number | undefined;
  maxWeightKg?: number | undefined;
  minCubageM3?: number | undefined;
  maxCubageM3?: number | undefined;
  priority?: number | undefined;
  baseAmount?: number | undefined;
  perKmAmount?: number | undefined;
  perTonAmount?: number | undefined;
  minimumAmount?: number | undefined;
  tollAmount?: number | undefined;
  riskAdditionalAmount?: number | undefined;
  nightAdditionalAmount?: number | undefined;
  dailyRateAmount?: number | undefined;
  demurrageAmount?: number | undefined;
  otherFees?: FreightRuleFeeEntity[] | undefined;
  notes?: string | undefined;
}

export interface CreateFreightRulePayload extends FreightRuleFields {
  freightTableId: string;
  effectiveFrom?: string | undefined;
}

export function createFreightRule(payload: CreateFreightRulePayload) {
  return api.post<FreightRuleEntity>('/freight/rules', payload);
}

export interface ReviseFreightRulePayload extends FreightRuleFields {
  effectiveFrom?: string | undefined;
}

export function reviseFreightRule(id: string, payload: ReviseFreightRulePayload) {
  return api.post<FreightRuleEntity>(`/freight/rules/${id}/revise`, payload);
}

// ---------------------------------------------------------------------------
// Simulacao + integracao com a viagem
// ---------------------------------------------------------------------------

export interface FreightCalculationInput {
  originLocationId?: string | undefined;
  destinationLocationId?: string | undefined;
  originRegion?: string | undefined;
  destinationRegion?: string | undefined;
  cargoType?: string | undefined;
  vehicleType?: VehicleType | undefined;
  distanceKm?: number | undefined;
  weightKg?: number | undefined;
  cubageM3?: number | undefined;
  nightService?: boolean | undefined;
  riskCargo?: boolean | undefined;
  dailyCount?: number | undefined;
  demurrageCount?: number | undefined;
}

export interface SimulateFreightPayload extends FreightCalculationInput {
  customerId: string;
  freightTableId?: string | undefined;
  asOf?: string | undefined;
}

export function simulateFreight(payload: SimulateFreightPayload) {
  return api.post<FreightQuoteEntity>('/freight/simulate', payload);
}

export function getTripFreight(tripId: string) {
  return api.get<TripFreightEntity | null>(`/freight/trips/${tripId}`);
}

export interface ApplyFreightToTripPayload extends FreightCalculationInput {
  customerId?: string | undefined;
  contractId?: string | undefined;
  freightTableId?: string | undefined;
}

export function applyFreightToTrip(tripId: string, payload: ApplyFreightToTripPayload) {
  return api.post<TripFreightEntity>(`/freight/trips/${tripId}/apply`, payload);
}

export interface UpdateTripFreightPayload {
  contractedAmount?: number | undefined;
  finalAmount?: number | undefined;
}

export function updateTripFreight(tripId: string, payload: UpdateTripFreightPayload) {
  return api.patch<TripFreightEntity>(`/freight/trips/${tripId}`, payload);
}

export function applyFreightRevenue(tripId: string) {
  return api.post<TripFreightEntity>(`/freight/trips/${tripId}/apply-revenue`, {});
}

export function getTripProfitability(tripId: string) {
  return api.get<TripProfitabilityEntity>(`/freight/trips/${tripId}/profitability`);
}

// ---------------------------------------------------------------------------
// Dashboard comercial
// ---------------------------------------------------------------------------

export interface FindFreightDashboardQuery extends QueryableParams {
  startDate?: string | undefined;
  endDate?: string | undefined;
  customerId?: string | undefined;
}

export function getFreightDashboard(query: FindFreightDashboardQuery = {}, signal?: AbortSignal) {
  return api.get<FreightDashboardEntity>('/freight/dashboard', query, signal);
}
