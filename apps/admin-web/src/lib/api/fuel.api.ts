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
export interface FindFuelSuppliesQuery extends PaginationParams {
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  fuelStationId?: string | undefined;
  fuelType?: FuelType | undefined;
  supplyDateFrom?: string | undefined;
  supplyDateTo?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateFuelSupplyPayload {
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  fuelStationId: string;
  attachmentId?: string | undefined;
  fuelType: FuelType;
  liters: number;
  pricePerLiter: number;
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
