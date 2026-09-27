import type { Paginated, PaginationParams } from '../../types/api';
import type { FuelTankBalanceEntity, FuelTankEntity, FuelTankMovementEntity } from '../../types/entities';
import type { FuelTankMovementType, FuelType } from '../../types/enums';
import { api } from './http';

export interface FindFuelTanksQuery extends PaginationParams {
  search?: string | undefined;
  isActive?: boolean | undefined;
  lowStock?: boolean | undefined;
  fuelType?: FuelType | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateFuelTankPayload {
  name: string;
  fuelType?: FuelType | undefined;
  capacityLiters: number;
  initialStockLiters: number;
  minStockLiters?: number | undefined;
  location?: string | undefined;
}

export interface UpdateFuelTankPayload {
  name?: string | undefined;
  minStockLiters?: number | undefined;
  location?: string | undefined;
}

export function listFuelTanks(query: FindFuelTanksQuery, signal?: AbortSignal) {
  return api.get<Paginated<FuelTankEntity>>('/fuel-tanks', query, signal);
}

export function getFuelTank(id: string) {
  return api.get<FuelTankEntity>(`/fuel-tanks/${id}`);
}

export function getFuelTankBalance(id: string) {
  return api.get<FuelTankBalanceEntity>(`/fuel-tanks/${id}/balance`);
}

export function createFuelTank(payload: CreateFuelTankPayload) {
  return api.post<FuelTankEntity>('/fuel-tanks', payload);
}

export function updateFuelTank(id: string, payload: UpdateFuelTankPayload) {
  return api.patch<FuelTankEntity>(`/fuel-tanks/${id}`, payload);
}

export function updateFuelTankStatus(id: string, isActive: boolean) {
  return api.patch<FuelTankEntity>(`/fuel-tanks/${id}/status`, { isActive });
}

export interface FindFuelTankMovementsQuery extends PaginationParams {
  type?: FuelTankMovementType | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function getFuelTankMovements(id: string, query: FindFuelTankMovementsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FuelTankMovementEntity>>(`/fuel-tanks/${id}/movements`, query, signal);
}
