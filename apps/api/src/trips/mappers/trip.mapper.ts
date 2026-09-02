import {
  AxleConfiguration,
  Customer,
  Driver,
  Location,
  TollRoute,
  Trip,
  TripComposition,
  Vehicle,
} from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PreviousTripSummaryEntity, TripEntity } from '../entities/trip.entity';

// Fase D -- forma do nested SELECT de previousTrip no TRIP_INCLUDE
// (trips.service.ts). Dados minimos da ida vinculada, nunca satelites.
export type PreviousTripRelation = Pick<
  Trip,
  'id' | 'status' | 'plannedDeparture' | 'loadStatus' | 'plannedLoadStatus'
> & {
  origin: { name: string };
  destination: { name: string };
};

export type TripWithRelations = Trip & {
  customer: Customer | null;
  driver: Driver | null;
  origin: Location;
  destination: Location;
  composition:
    | (TripComposition & { vehicle: Vehicle; axleConfiguration: AxleConfiguration | null })
    | null;
  tollRoute: TollRoute | null;
  previousTrip: PreviousTripRelation | null;
};

function toPreviousTripSummary(previous: PreviousTripRelation | null): PreviousTripSummaryEntity | null {
  if (!previous) return null;
  const entity = new PreviousTripSummaryEntity();
  entity.id = previous.id;
  entity.status = previous.status;
  entity.originName = previous.origin.name;
  entity.destinationName = previous.destination.name;
  entity.plannedDeparture = previous.plannedDeparture;
  entity.loadStatus = previous.loadStatus;
  entity.plannedLoadStatus = previous.plannedLoadStatus;
  return entity;
}

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
  entity.tollRouteId = trip.tollRouteId;
  entity.tollRouteName = trip.tollRoute?.name ?? null;
  entity.status = trip.status;
  entity.priority = trip.priority;
  entity.notes = trip.notes;
  entity.plannedDeparture = trip.plannedDeparture;
  entity.plannedArrival = trip.plannedArrival;
  entity.actualDeparture = trip.actualDeparture;
  entity.actualArrival = trip.actualArrival;
  entity.loadStatus = trip.loadStatus;
  entity.plannedLoadStatus = trip.plannedLoadStatus;
  entity.previousTripId = trip.previousTripId;
  entity.previousTrip = toPreviousTripSummary(trip.previousTrip);
  entity.initialOdometerKm = toNumberOrNull(trip.initialOdometerKm);
  entity.currentOdometerKm = toNumberOrNull(trip.composition?.vehicle.odometerKm ?? null);
  entity.defaultAxles = trip.composition?.axleConfiguration?.totalAxles ?? null;
  entity.createdAt = trip.createdAt;
  entity.updatedAt = trip.updatedAt;
  return entity;
}
