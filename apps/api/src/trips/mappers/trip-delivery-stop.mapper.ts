import { Customer, Location, TripDeliveryStop } from '@prisma/client';
import { TripDeliveryStopEntity } from '../entities/trip-delivery-stop.entity';

export type TripDeliveryStopWithRelations = TripDeliveryStop & {
  customer: Customer | null;
  location: Location;
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
  entity.notes = stop.notes;
  entity.createdAt = stop.createdAt;
  entity.updatedAt = stop.updatedAt;
  return entity;
}
