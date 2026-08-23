import { TripOccurrence } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripOccurrenceEntity, TripOccurrenceStatus } from '../entities/trip-occurrence.entity';

// Fase 67 -- status e SEMPRE derivado, nunca uma coluna propria (mesmo
// principio de computeTripStopStatus). CANCELLED tem prioridade sobre
// RESOLVED: uma ocorrencia pode ter sido resolvida e depois cancelada pelo
// admin (correcao de um registro indevido), o cancelamento e a palavra final.
export function computeTripOccurrenceStatus(occurrence: {
  resolvedAt: Date | null;
  cancelledAt: Date | null;
}): TripOccurrenceStatus {
  if (occurrence.cancelledAt) return 'CANCELLED';
  if (occurrence.resolvedAt) return 'RESOLVED';
  return 'OPEN';
}

// Fase 68 -- regra de classificacao "alerta operacional critico" (dashboard
// de ocorrencias, FleetAlert, VehicleOverview): severidade CRITICAL E
// status OPEN (nunca so a severidade -- uma ocorrencia critica ja resolvida
// ou cancelada deixa de ser um alerta em aberto). As consultas Prisma em
// FleetOperationsMetricsService.computeAlerts/VehicleOverviewService
// implementam a MESMA regra diretamente no `where` (severity: CRITICAL,
// resolvedAt: null, cancelledAt: null), por eficiencia (filtro no banco,
// nunca buscar tudo para filtrar em memoria) -- esta funcao pura documenta
// a regra e e o alvo dos testes unitarios de classificacao.
export function isCriticalOpenOccurrence(occurrence: {
  severity: string;
  resolvedAt: Date | null;
  cancelledAt: Date | null;
}): boolean {
  return occurrence.severity === 'CRITICAL' && computeTripOccurrenceStatus(occurrence) === 'OPEN';
}

export function toTripOccurrenceEntity(occurrence: TripOccurrence): TripOccurrenceEntity {
  const entity = new TripOccurrenceEntity();
  entity.id = occurrence.id;
  entity.tripId = occurrence.tripId;
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
