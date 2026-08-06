import { Customer, Driver, Location, Trip, TripComposition, Vehicle } from '@prisma/client';
import { TripEntity } from '../entities/trip.entity';

export type TripWithRelations = Trip & {
  customer: Customer | null;
  driver: Driver | null;
  origin: Location;
  destination: Location;
  composition: (TripComposition & { vehicle: Vehicle }) | null;
};

export function toTripEntity(trip: TripWithRelations): TripEntity {
  const entity = new TripEntity();
  entity.id = trip.id;
  entity.tenantId = trip.tenantId;
  entity.customerId = trip.customerId;
  entity.customerName = trip.customer?.name ?? null;
  entity.driverId = trip.driverId;
  entity.driverName = trip.driver?.name ?? null;
  entity.originLocationId = trip.originLocationId;
  entity.originName = trip.origin.name;
  entity.destinationLocationId = trip.destinationLocationId;
  entity.destinationName = trip.destination.name;
  entity.compositionId = trip.composition?.id ?? null;
  entity.vehiclePlate = trip.composition?.vehicle.plate ?? null;
  entity.status = trip.status;
  entity.priority = trip.priority;
  entity.notes = trip.notes;
  entity.plannedDeparture = trip.plannedDeparture;
  entity.plannedArrival = trip.plannedArrival;
  entity.actualDeparture = trip.actualDeparture;
  entity.actualArrival = trip.actualArrival;
  entity.createdAt = trip.createdAt;
  entity.updatedAt = trip.updatedAt;
  return entity;
}
