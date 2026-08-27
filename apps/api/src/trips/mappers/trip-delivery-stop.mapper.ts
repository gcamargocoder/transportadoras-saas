import { Customer, Driver, Location, Prisma, Trip, TripDeliveryStop } from '@prisma/client';
import { DeliveryStopListItemEntity } from '../entities/delivery-stop-list-item.entity';
import { TripDeliveryStopEntity } from '../entities/trip-delivery-stop.entity';

export type TripDeliveryStopWithRelations = TripDeliveryStop & {
  customer: Customer | null;
  location: Location;
};

// Fase 99 -- include reaproveitado tanto pela query quanto pelo tipo do
// mapper da listagem cross-trip (TripDeliveryStopsService.findAll), nunca
// declarado duas vezes.
export const DELIVERY_STOP_LIST_INCLUDE = {
  customer: true,
  location: true,
  trip: { include: { driver: true, origin: true, destination: true } },
} satisfies Prisma.TripDeliveryStopInclude;

export type DeliveryStopListRow = TripDeliveryStop & {
  customer: Customer | null;
  location: Location;
  trip: Trip & { driver: Driver | null; origin: Location; destination: Location };
};

export function toTripDeliveryStopEntity(stop: TripDeliveryStopWithRelations): TripDeliveryStopEntity {
  const entity = new TripDeliveryStopEntity();
  entity.id = stop.id;
  entity.tripId = stop.tripId;
  entity.sequence = stop.sequence;
  entity.customerId = stop.customerId;
  entity.customerName = stop.customer?.name ?? null;
  entity.locationId = stop.locationId;
  entity.locationName = stop.location.name;
  entity.locationAddress = stop.location.address;
  entity.status = stop.status;
  entity.plannedArrival = stop.plannedArrival;
  entity.actualArrival = stop.actualArrival;
  entity.deliveredAt = stop.deliveredAt;
  entity.failureReason = stop.failureReason;
  entity.notes = stop.notes;
  entity.createdAt = stop.createdAt;
  entity.updatedAt = stop.updatedAt;
  return entity;
}

export function toDeliveryStopListItemEntity(stop: DeliveryStopListRow): DeliveryStopListItemEntity {
  const entity = new DeliveryStopListItemEntity();
  entity.id = stop.id;
  entity.tripId = stop.tripId;
  entity.tripStatus = stop.trip.status;
  entity.tripOriginName = stop.trip.origin.name;
  entity.tripDestinationName = stop.trip.destination.name;
  entity.driverId = stop.trip.driverId;
  entity.driverName = stop.trip.driver?.name ?? null;
  entity.sequence = stop.sequence;
  entity.customerId = stop.customerId;
  entity.customerName = stop.customer?.name ?? null;
  entity.locationId = stop.locationId;
  entity.locationName = stop.location.name;
  entity.locationAddress = stop.location.address;
  entity.status = stop.status;
  entity.plannedArrival = stop.plannedArrival;
  entity.actualArrival = stop.actualArrival;
  entity.deliveredAt = stop.deliveredAt;
  entity.failureReason = stop.failureReason;
  entity.notes = stop.notes;
  entity.createdAt = stop.createdAt;
  entity.updatedAt = stop.updatedAt;
  return entity;
}
