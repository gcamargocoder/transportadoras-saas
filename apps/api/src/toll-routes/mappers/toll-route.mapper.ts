import { TollPlaza, TollRoute, TollRouteStop } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TollRouteEntity } from '../entities/toll-route.entity';
import { TollRouteStopEntity } from '../entities/toll-route-stop.entity';

export type TollRouteStopWithPlaza = TollRouteStop & { tollPlaza: TollPlaza };
export type TollRouteWithStops = TollRoute & { stops: TollRouteStopWithPlaza[] };

export function toTollRouteStopEntity(stop: TollRouteStopWithPlaza): TollRouteStopEntity {
  const entity = new TollRouteStopEntity();
  entity.id = stop.id;
  entity.tollPlazaId = stop.tollPlazaId;
  entity.tollPlazaName = stop.tollPlaza.name;
  entity.highway = stop.tollPlaza.highway;
  entity.pricePerAxle = toNumberOrNull(stop.tollPlaza.pricePerAxle);
  entity.sequence = stop.sequence;
  return entity;
}

export function toTollRouteEntity(route: TollRouteWithStops): TollRouteEntity {
  const entity = new TollRouteEntity();
  entity.id = route.id;
  entity.tenantId = route.tenantId;
  entity.name = route.name;
  entity.originLabel = route.originLabel;
  entity.destinationLabel = route.destinationLabel;
  entity.isActive = route.isActive;
  entity.stops = route.stops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(toTollRouteStopEntity);
  entity.createdAt = route.createdAt;
  entity.updatedAt = route.updatedAt;
  return entity;
}
