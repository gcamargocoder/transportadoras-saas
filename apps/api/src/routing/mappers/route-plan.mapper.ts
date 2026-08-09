import { RoutePlan, RoutePlanToll } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { RoutePlanTollEntity } from '../entities/route-plan-toll.entity';
import { RoutePlanEntity } from '../entities/route-plan.entity';

export type RoutePlanWithTolls = RoutePlan & { tolls: RoutePlanToll[] };

export function toRoutePlanTollEntity(toll: RoutePlanToll): RoutePlanTollEntity {
  const entity = new RoutePlanTollEntity();
  entity.id = toll.id;
  entity.tollPlazaId = toll.tollPlazaId;
  entity.sequence = toll.sequence;
  entity.name = toll.name;
  entity.latitude = toNumberOrNull(toll.latitude) ?? 0;
  entity.longitude = toNumberOrNull(toll.longitude) ?? 0;
  entity.distanceFromOriginMeters = toll.distanceFromOriginMeters;
  entity.estimatedAmount = toNumberOrNull(toll.estimatedAmount);
  entity.currency = toll.currency;
  entity.axleCountUsed = toll.axleCountUsed;
  entity.matchStatus = toll.matchStatus;
  entity.matchConfidence = toNumberOrNull(toll.matchConfidence);
  entity.source = toll.source;
  return entity;
}

// isCurrent e sempre calculado pelo chamador (comparando routePlan.id com
// Trip.routePlanId, ja carregado por quem chama) -- o mapper nunca faz
// consulta propria, mesmo padrao de outros mappers do projeto.
export function toRoutePlanEntity(routePlan: RoutePlanWithTolls, isCurrent: boolean): RoutePlanEntity {
  const entity = new RoutePlanEntity();
  entity.id = routePlan.id;
  entity.tripId = routePlan.tripId;
  entity.originLabel = routePlan.originLabel;
  entity.destinationLabel = routePlan.destinationLabel;
  entity.originLatitude = toNumberOrNull(routePlan.originLatitude) ?? 0;
  entity.originLongitude = toNumberOrNull(routePlan.originLongitude) ?? 0;
  entity.destinationLatitude = toNumberOrNull(routePlan.destinationLatitude) ?? 0;
  entity.destinationLongitude = toNumberOrNull(routePlan.destinationLongitude) ?? 0;
  entity.distanceMeters = routePlan.distanceMeters;
  entity.durationSeconds = routePlan.durationSeconds;
  entity.totalTollAmount = toNumberOrNull(routePlan.totalTollAmount);
  entity.tollEstimateSource = routePlan.tollEstimateSource;
  entity.currency = routePlan.currency;
  entity.axleCountUsed = routePlan.axleCountUsed;
  entity.reason = routePlan.reason;
  entity.provider = routePlan.provider;
  entity.providerRouteId = routePlan.providerRouteId;
  entity.isCurrent = isCurrent;
  entity.tolls = routePlan.tolls
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(toRoutePlanTollEntity);
  entity.createdAt = routePlan.createdAt;
  entity.updatedAt = routePlan.updatedAt;
  return entity;
}
