import type { Paginated, PaginationParams } from '../../types/api';
import type {
  TireDashboardEntity,
  TireDisposalEntity,
  TireEntity,
  TireHistoryEntity,
  TireInspectionEntity,
  TireMovementEntity,
  TireRetreadEntity,
} from '../../types/entities';
import type { TireLocationType, TireStatus } from '../../types/enums';
import { api } from './http';

export interface FindTiresQuery extends PaginationParams {
  search?: string | undefined;
  status?: TireStatus | undefined;
  locationType?: TireLocationType | undefined;
  vehicleId?: string | undefined;
  trailerId?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTirePayload {
  fireNumber: string;
  manufacturer: string;
  model: string;
  size: string;
  dot?: string | undefined;
  serialNumber?: string | undefined;
  purchaseDate?: string | undefined;
  purchasePrice?: number | undefined;
  expectedLifespanKm?: number | undefined;
  initialTreadDepthMm?: number | undefined;
  currentTreadDepthMm?: number | undefined;
  status?: TireStatus | undefined;
}

export type UpdateTirePayload = Partial<CreateTirePayload>;

export function listTires(query: FindTiresQuery, signal?: AbortSignal) {
  return api.get<Paginated<TireEntity>>('/tires', query, signal);
}

export function getTire(id: string) {
  return api.get<TireEntity>(`/tires/${id}`);
}

export function createTire(payload: CreateTirePayload) {
  return api.post<TireEntity>('/tires', payload);
}

export function updateTire(id: string, payload: UpdateTirePayload) {
  return api.patch<TireEntity>(`/tires/${id}`, payload);
}

export function deleteTire(id: string) {
  return api.delete<void>(`/tires/${id}`);
}

export function getTireDashboard(signal?: AbortSignal) {
  return api.get<TireDashboardEntity>('/tires/dashboard', undefined, signal);
}

export function getTireHistory(id: string) {
  return api.get<TireHistoryEntity>(`/tires/${id}/history`);
}

export function getTireMovements(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<TireMovementEntity>>(`/tires/${id}/movements`, query);
}

// Fase 64 -- nomes alinhados ao CreateTireMovementDto do backend
// (newLocationType/newVehicleId/newTrailerId/newPosition). O client
// anterior enviava locationType/vehicleId/trailerId/position, que o
// ValidationPipe global (forbidNonWhitelisted: true) sempre rejeitava com
// 400 -- bug pre-existente que deixava "Nova movimentacao" inoperante,
// corrigido aqui.
export interface CreateTireMovementPayload {
  newLocationType: TireLocationType;
  newVehicleId?: string | undefined;
  newTrailerId?: string | undefined;
  newPosition?: string | undefined;
  odometerKm?: number | undefined;
  reason?: string | undefined;
  // Fase 109 -- OS (VehicleMaintenance) que motivou esta troca, quando
  // aplicavel.
  maintenanceId?: string | undefined;
}

export function createTireMovement(tireId: string, payload: CreateTireMovementPayload) {
  return api.post<TireMovementEntity>(`/tires/${tireId}/movements`, payload);
}

export function getTireRetreads(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<TireRetreadEntity>>(`/tires/${id}/retreads`, query);
}

export interface CreateTireRetreadPayload {
  company: string;
  cost: number;
  retreadDate: string;
  warranty?: string | undefined;
  mileageKm?: number | undefined;
  notes?: string | undefined;
}

export function createTireRetread(tireId: string, payload: CreateTireRetreadPayload) {
  return api.post<TireRetreadEntity>(`/tires/${tireId}/retreads`, payload);
}

export function getTireInspections(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<TireInspectionEntity>>(`/tires/${id}/inspections`, query);
}

export interface CreateTireInspectionPayload {
  inspectionDate: string;
  treadDepthMm: number;
  pressurePsi?: number | undefined;
  notes?: string | undefined;
}

export function createTireInspection(tireId: string, payload: CreateTireInspectionPayload) {
  return api.post<TireInspectionEntity>(`/tires/${tireId}/inspections`, payload);
}

export function getTireDisposal(id: string) {
  return api.get<TireDisposalEntity | null>(`/tires/${id}/disposal`);
}

export interface CreateTireDisposalPayload {
  reason: string;
  disposalDate: string;
  odometerKm?: number | undefined;
  residualValue?: number | undefined;
}

export function createTireDisposal(tireId: string, payload: CreateTireDisposalPayload) {
  return api.post<TireDisposalEntity>(`/tires/${tireId}/disposal`, payload);
}
