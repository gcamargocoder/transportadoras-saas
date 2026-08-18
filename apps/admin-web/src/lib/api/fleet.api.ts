import type { Paginated, PaginationParams } from '../../types/api';
import type {
  FleetEntity,
  FuelSupplyEntity,
  MaintenanceEntity,
  TagProviderEntity,
  TrailerEntity,
  TripCompositionEntity,
  VehicleDocumentEntity,
  VehicleDriverAssignmentEntity,
  VehicleEntity,
  VehicleOverviewEntity,
  VehicleSummaryEntity,
  VehicleTagEntity,
} from '../../types/entities';
import type {
  DocumentType,
  FleetType,
  MaintenanceComponent,
  TrailerType,
  VehicleAvailability,
  VehicleFuelType,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
  VehicleOwnershipType,
  VehicleStatus,
  VehicleType,
} from '../../types/enums';
import { api } from './http';

// --- Vehicles ---
export interface FindVehiclesQuery extends PaginationParams {
  search?: string | undefined;
  fleetId?: string | undefined;
  type?: VehicleType | undefined;
  category?: string | undefined;
  status?: VehicleStatus | undefined;
  ownershipType?: VehicleOwnershipType | undefined;
  currentDriverId?: string | undefined;
  availability?: VehicleAvailability | undefined;
  plate?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateVehiclePayload {
  plate: string;
  fleetId?: string | undefined;
  renavam?: string | undefined;
  chassisNumber?: string | undefined;
  brand: string;
  model: string;
  manufactureYear?: number | undefined;
  modelYear?: number | undefined;
  color?: string | undefined;
  type: VehicleType;
  category?: string | undefined;
  ownershipType?: VehicleOwnershipType | undefined;
  fuelType?: VehicleFuelType | undefined;
  tankCapacityLiters?: number | undefined;
  averageConsumptionKmL?: number | undefined;
  odometerKm?: number | undefined;
  grossWeightKg?: number | undefined;
  netWeightKg?: number | undefined;
  cargoCapacityKg?: number | undefined;
  axleCount?: number | undefined;
  notes?: string | undefined;
}

export type UpdateVehiclePayload = Partial<CreateVehiclePayload>;

export function listVehicles(query: FindVehiclesQuery, signal?: AbortSignal) {
  return api.get<Paginated<VehicleEntity>>('/vehicles', query, signal);
}

export function getVehicleSummary(signal?: AbortSignal) {
  return api.get<VehicleSummaryEntity>('/vehicles/summary', undefined, signal);
}

export function getVehicle(id: string) {
  return api.get<VehicleEntity>(`/vehicles/${id}`);
}

export function getVehicleOverview(id: string, signal?: AbortSignal) {
  return api.get<VehicleOverviewEntity>(`/vehicles/${id}/overview`, undefined, signal);
}

export function createVehicle(payload: CreateVehiclePayload) {
  return api.post<VehicleEntity>('/vehicles', payload);
}

export function updateVehicle(id: string, payload: UpdateVehiclePayload) {
  return api.patch<VehicleEntity>(`/vehicles/${id}`, payload);
}

export function updateVehicleStatus(id: string, status: VehicleStatus) {
  return api.patch<VehicleEntity>(`/vehicles/${id}/status`, { status });
}

export function getVehicleDriverAssignments(id: string) {
  return api.get<VehicleDriverAssignmentEntity[]>(`/vehicles/${id}/driver-assignments`);
}

export interface CreateVehicleDocumentPayload {
  type: DocumentType;
  number?: string | undefined;
  issuedAt?: string | undefined;
  expiresAt?: string | undefined;
}

export function getVehicleDocuments(id: string) {
  return api.get<VehicleDocumentEntity[]>(`/vehicles/${id}/documents`);
}

export function createVehicleDocument(id: string, payload: CreateVehicleDocumentPayload) {
  return api.post<VehicleDocumentEntity>(`/vehicles/${id}/documents`, payload);
}

export function deleteVehicle(id: string) {
  return api.delete<void>(`/vehicles/${id}`);
}

export function getVehicleMaintenances(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<MaintenanceEntity>>(`/vehicles/${id}/maintenances`, query);
}

export function getVehicleFuelHistory(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<FuelSupplyEntity>>(`/vehicles/${id}/fuel-history`, query);
}

export function getVehicleTags(id: string) {
  return api.get<VehicleTagEntity[]>(`/vehicles/${id}/tags`);
}

export interface CreateVehicleTagPayload {
  tagProviderId: string;
  tagNumber: string;
  activatedAt?: string | undefined;
  expiresAt?: string | undefined;
}

export function createVehicleTag(vehicleId: string, payload: CreateVehicleTagPayload) {
  return api.post<VehicleTagEntity>(`/vehicles/${vehicleId}/tags`, payload);
}

// --- Trailers ---
export interface FindTrailersQuery extends PaginationParams {
  search?: string | undefined;
  type?: TrailerType | undefined;
  isActive?: boolean | undefined;
}

export interface CreateTrailerPayload {
  plate: string;
  type: TrailerType;
  notes?: string | undefined;
}

export function listTrailers(query: FindTrailersQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TrailerEntity>>('/trailers', query, signal);
}

export function getTrailer(id: string) {
  return api.get<TrailerEntity>(`/trailers/${id}`);
}

export function createTrailer(payload: CreateTrailerPayload) {
  return api.post<TrailerEntity>('/trailers', payload);
}

export function updateTrailer(id: string, payload: Partial<CreateTrailerPayload>) {
  return api.patch<TrailerEntity>(`/trailers/${id}`, payload);
}

export function deleteTrailer(id: string) {
  return api.delete<void>(`/trailers/${id}`);
}

// --- Fleets (frotas) ---
export interface FindFleetsQuery extends PaginationParams {
  search?: string | undefined;
  type?: FleetType | undefined;
  isActive?: boolean | undefined;
}

export interface CreateFleetPayload {
  name: string;
  type: FleetType;
  locationId?: string | undefined;
}

export function listFleets(query: FindFleetsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FleetEntity>>('/fleets', query, signal);
}

export function createFleet(payload: CreateFleetPayload) {
  return api.post<FleetEntity>('/fleets', payload);
}

export function updateFleet(id: string, payload: Partial<CreateFleetPayload>) {
  return api.patch<FleetEntity>(`/fleets/${id}`, payload);
}

export function deleteFleet(id: string) {
  return api.delete<void>(`/fleets/${id}`);
}

// --- Maintenances ---
export interface FindMaintenancesQuery extends PaginationParams {
  search?: string | undefined;
  status?: VehicleMaintenanceStatus | undefined;
  type?: VehicleMaintenanceType | undefined;
  priority?: VehicleMaintenancePriority | undefined;
  component?: MaintenanceComponent | undefined;
  vehicleId?: string | undefined;
  plate?: string | undefined;
  openedFrom?: string | undefined;
  openedTo?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface MaintenancePartInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateMaintenancePayload {
  vehicleId: string;
  type: VehicleMaintenanceType;
  priority?: VehicleMaintenancePriority | undefined;
  openedAt?: string | undefined;
  scheduledAt?: string | undefined;
  odometerKm?: number | undefined;
  workshop?: string | undefined;
  supplier?: string | undefined;
  mechanic?: string | undefined;
  description?: string | undefined;
  notes?: string | undefined;
  laborCost?: number | undefined;
  partsCost?: number | undefined;
  serviceOrderNumber?: string | undefined;
  warrantyUntil?: string | undefined;
  nextReviewAt?: string | undefined;
  component?: MaintenanceComponent | undefined;
  nextOdometerKm?: number | undefined;
  downtimeMinutes?: number | undefined;
  invoiceNumber?: string | undefined;
  maintenancePlanId?: string | undefined;
  parts?: MaintenancePartInput[] | undefined;
}

export function listMaintenances(query: FindMaintenancesQuery, signal?: AbortSignal) {
  return api.get<Paginated<MaintenanceEntity>>('/maintenances', query, signal);
}

export function getMaintenance(id: string) {
  return api.get<MaintenanceEntity>(`/maintenances/${id}`);
}

export function createMaintenance(payload: CreateMaintenancePayload) {
  return api.post<MaintenanceEntity>('/maintenances', payload);
}

export function updateMaintenance(id: string, payload: Partial<CreateMaintenancePayload>) {
  return api.patch<MaintenanceEntity>(`/maintenances/${id}`, payload);
}

export function updateMaintenanceStatus(id: string, status: VehicleMaintenanceStatus) {
  return api.patch<MaintenanceEntity>(`/maintenances/${id}/status`, { status });
}

export function deleteMaintenance(id: string) {
  return api.delete<void>(`/maintenances/${id}`);
}

// --- Tag providers (operadoras de pedágio, dado global) ---
export function listTagProviders(query: PaginationParams = {}, signal?: AbortSignal) {
  return api.get<Paginated<TagProviderEntity>>('/tag-providers', query, signal);
}

// --- Trip compositions (cavalo + carretas + configuração de eixos) ---
export interface FindTripCompositionsQuery extends PaginationParams {
  vehicleId?: string | undefined;
}

export function listTripCompositions(query: FindTripCompositionsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TripCompositionEntity>>('/trip-compositions', query, signal);
}

export function getTripComposition(id: string) {
  return api.get<TripCompositionEntity>(`/trip-compositions/${id}`);
}

export interface UpsertAxleConfigurationPayload {
  totalAxles: number;
  raisedAxles: number;
  loweredAxles: number;
  suspendedAxles: number;
  steeringAxles: number;
  tractionAxles: number;
  billableCategory: string;
}

export interface CreateTripCompositionPayload {
  vehicleId: string;
  trailers?: { trailerId: string; positionOrder: number }[] | undefined;
  axleConfiguration?: UpsertAxleConfigurationPayload | undefined;
}

export function createTripComposition(payload: CreateTripCompositionPayload) {
  return api.post<TripCompositionEntity>('/trip-compositions', payload);
}
