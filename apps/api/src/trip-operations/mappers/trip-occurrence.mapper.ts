import { Driver, Location, Trip, TripOccurrence, UserAccount, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { DeliveryOccurrenceListItemEntity } from '../entities/delivery-occurrence-list-item.entity';
import { TripOccurrenceEntity, TripOccurrenceStatus } from '../entities/trip-occurrence.entity';

// Fase 67 -- status e SEMPRE derivado, nunca uma coluna propria (mesmo
// principio de computeTripStopStatus). CANCELLED tem prioridade sobre
// RESOLVED: uma ocorrencia pode ter sido resolvida e depois cancelada pelo
// admin (correcao de um registro indevido), o cancelamento e a palavra
// final. Fase 101 -- IN_PROGRESS adicionado entre OPEN e RESOLVED
// (inProgressAt, novo timestamp, mesmo padrao). `inProgressAt` e opcional no
// tipo para nao quebrar chamadores antigos que so passam resolvedAt/
// cancelledAt (equivalente a nunca ter sido marcada em andamento).
export function computeTripOccurrenceStatus(occurrence: {
  resolvedAt: Date | null;
  cancelledAt: Date | null;
  inProgressAt?: Date | null;
}): TripOccurrenceStatus {
  if (occurrence.cancelledAt) return 'CANCELLED';
  if (occurrence.resolvedAt) return 'RESOLVED';
  if (occurrence.inProgressAt) return 'IN_PROGRESS';
  return 'OPEN';
}

// Fase 68 -- regra de classificacao "alerta operacional critico" (dashboard
// de ocorrencias, FleetAlert, VehicleOverview): severidade CRITICAL E ainda
// nao resolvida/cancelada (resolvedAt/cancelledAt nulos) -- nunca so a
// severidade. Deliberadamente NAO passa por computeTripOccurrenceStatus:
// uma ocorrencia critica em IN_PROGRESS (Fase 101) continua sendo um alerta
// em aberto (so sai do alerta quando de fato resolvida/cancelada) -- mesmo
// criterio das consultas Prisma reais em FleetOperationsMetricsService.
// computeAlerts/VehicleOverviewService/NotificationsService, que sempre
// filtram diretamente por resolvedAt:null,cancelledAt:null (nunca pelo
// status derivado), por eficiencia. Esta funcao pura documenta a regra e e
// o alvo dos testes unitarios de classificacao.
export function isCriticalOpenOccurrence(occurrence: {
  severity: string;
  resolvedAt: Date | null;
  cancelledAt: Date | null;
}): boolean {
  return occurrence.severity === 'CRITICAL' && occurrence.resolvedAt === null && occurrence.cancelledAt === null;
}

export function toTripOccurrenceEntity(occurrence: TripOccurrence): TripOccurrenceEntity {
  const entity = new TripOccurrenceEntity();
  entity.id = occurrence.id;
  entity.tripId = occurrence.tripId;
  entity.tripDeliveryStopId = occurrence.tripDeliveryStopId;
  entity.driverShiftId = occurrence.driverShiftId;
  entity.driverId = occurrence.driverId;
  entity.vehicleId = occurrence.vehicleId;
  entity.type = occurrence.type;
  entity.severity = occurrence.severity;
  entity.status = computeTripOccurrenceStatus(occurrence);
  entity.description = occurrence.description;
  entity.occurredAt = occurrence.occurredAt;
  entity.latitude = toNumberOrNull(occurrence.latitude);
  entity.longitude = toNumberOrNull(occurrence.longitude);
  entity.locationLabel = occurrence.locationLabel;
  entity.inProgressAt = occurrence.inProgressAt;
  entity.resolvedAt = occurrence.resolvedAt;
  entity.resolvedBy = occurrence.resolvedBy;
  entity.cancelledAt = occurrence.cancelledAt;
  entity.attachmentId = occurrence.attachmentId;
  entity.metadata = (occurrence.metadata as Record<string, unknown> | null) ?? null;
  entity.deviceEventId = occurrence.deviceEventId;
  entity.createdBy = occurrence.createdBy;
  entity.createdAt = occurrence.createdAt;
  entity.updatedAt = occurrence.updatedAt;
  return entity;
}

// Fase 101 -- linha da listagem cross-trip (GET /delivery-occurrences).
// tripDeliveryStop/trip/origin/destination sao sempre presentes NESTE
// contexto (a query base sempre filtra tripDeliveryStopId != null) --
// modelado como nao-nulo aqui de proposito, distinto da nulidade estrutural
// de TripOccurrence.tripDeliveryStopId em geral.
export type DeliveryOccurrenceListRow = TripOccurrence & {
  tripDeliveryStopId: string;
  trip: Trip & { origin: Location; destination: Location };
  tripDeliveryStop: { sequence: number };
  driver: Driver | null;
  vehicle: Vehicle | null;
  creator: UserAccount;
  resolver: UserAccount | null;
};

export function toDeliveryOccurrenceListItemEntity(occurrence: DeliveryOccurrenceListRow): DeliveryOccurrenceListItemEntity {
  const entity = new DeliveryOccurrenceListItemEntity();
  entity.id = occurrence.id;
  entity.tripId = occurrence.tripId;
  entity.tripStatus = occurrence.trip.status;
  entity.tripOriginName = occurrence.trip.origin.name;
  entity.tripDestinationName = occurrence.trip.destination.name;
  entity.tripDeliveryStopId = occurrence.tripDeliveryStopId;
  entity.tripDeliveryStopSequence = occurrence.tripDeliveryStop.sequence;
  entity.driverId = occurrence.driverId;
  entity.driverName = occurrence.driver?.name ?? null;
  entity.vehicleId = occurrence.vehicleId;
  entity.vehiclePlate = occurrence.vehicle?.plate ?? null;
  entity.type = occurrence.type;
  entity.severity = occurrence.severity;
  entity.status = computeTripOccurrenceStatus(occurrence);
  entity.description = occurrence.description;
  entity.occurredAt = occurrence.occurredAt;
  entity.resolvedAt = occurrence.resolvedAt;
  entity.resolvedBy = occurrence.resolvedBy;
  entity.resolverName = occurrence.resolver?.name ?? null;
  entity.cancelledAt = occurrence.cancelledAt;
  entity.attachmentId = occurrence.attachmentId;
  entity.createdBy = occurrence.createdBy;
  entity.creatorName = occurrence.creator.name;
  entity.createdAt = occurrence.createdAt;
  entity.updatedAt = occurrence.updatedAt;
  return entity;
}
