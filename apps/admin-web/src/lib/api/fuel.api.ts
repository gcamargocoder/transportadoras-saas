import type { Paginated, PaginationParams } from '../../types/api';
import type {
  FuelDashboardEntity,
  FuelStationEntity,
  FuelSupplyEntity,
} from '../../types/entities';
import type { FuelType, PaymentType } from '../../types/enums';
import { api } from './http';

// --- Fuel stations ---
export interface FindFuelStationsQuery extends PaginationParams {
  search?: string | undefined;
  state?: string | undefined;
  isActive?: boolean | undefined;
}

export interface CreateFuelStationPayload {
  name: string;
  cnpj?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  isActive?: boolean | undefined;
}

export function listFuelStations(query: FindFuelStationsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FuelStationEntity>>('/fuel-stations', query, signal);
}

export function createFuelStation(payload: CreateFuelStationPayload) {
  return api.post<FuelStationEntity>('/fuel-stations', payload);
}

export function updateFuelStation(id: string, payload: Partial<CreateFuelStationPayload>) {
  return api.patch<FuelStationEntity>(`/fuel-stations/${id}`, payload);
}

export function deleteFuelStation(id: string) {
  return api.delete<void>(`/fuel-stations/${id}`);
}

// --- Fuel supplies (abastecimentos) ---

// Fase 7 -- origem derivada de deviceEventId no backend (nunca uma coluna
// propria): DRIVER_APP quando o registro veio do app do motorista, ADMIN
// quando veio do administrativo.
export type FuelSupplySource = 'DRIVER_APP' | 'ADMIN';

export interface FindFuelSuppliesQuery extends PaginationParams {
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  fuelStationId?: string | undefined;
  fuelTankId?: string | undefined;
  source?: FuelSupplySource | undefined;
  fuelType?: FuelType | undefined;
  supplyDateFrom?: string | undefined;
  supplyDateTo?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

// Fase 7 -- fuelTankId/fuelStationId sao mutuamente exclusivos: presente =
// abastecimento INTERNO (baixa o tanque proprio na mesma transacao);
// ausente = EXTERNO (posto/fornecedor, ou nem isso quando desconhecido).
// pricePerLiter fica opcional -- obrigatorio (validado no backend) so
// quando EXTERNO; interno nao tem compra associada a ELE.
export interface CreateFuelSupplyPayload {
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  fuelStationId?: string | undefined;
  fuelTankId?: string | undefined;
  attachmentId?: string | undefined;
  fuelType: FuelType;
  liters: number;
  pricePerLiter?: number | undefined;
  odometerKm: number;
  supplyDate: string;
  paymentType?: PaymentType | undefined;
  invoiceNumber?: string | undefined;
  notes?: string | undefined;
}

export function listFuelSupplies(query: FindFuelSuppliesQuery, signal?: AbortSignal) {
  return api.get<Paginated<FuelSupplyEntity>>('/fuel-supplies', query, signal);
}

export function getFuelSupply(id: string) {
  return api.get<FuelSupplyEntity>(`/fuel-supplies/${id}`);
}

export function createFuelSupply(payload: CreateFuelSupplyPayload) {
  return api.post<FuelSupplyEntity>('/fuel-supplies', payload);
}

export function updateFuelSupply(id: string, payload: Partial<CreateFuelSupplyPayload>) {
  return api.patch<FuelSupplyEntity>(`/fuel-supplies/${id}`, payload);
}

export function deleteFuelSupply(id: string) {
  return api.delete<void>(`/fuel-supplies/${id}`);
}

export function getFuelDashboard(query: FindFuelSuppliesQuery = {}, signal?: AbortSignal) {
  return api.get<FuelDashboardEntity>('/fuel-supplies/dashboard', query, signal);
}
