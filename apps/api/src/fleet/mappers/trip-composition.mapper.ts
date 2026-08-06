import {
  AxleConfiguration,
  Trailer,
  TripComposition,
  TripCompositionTrailer,
  Vehicle,
} from '@prisma/client';
import { AxleConfigurationEntity } from '../entities/axle-configuration.entity';
import { TripCompositionTrailerEntity } from '../entities/trip-composition-trailer.entity';
import { TripCompositionEntity } from '../entities/trip-composition.entity';

export type TripCompositionWithRelations = TripComposition & {
  vehicle: Vehicle;
  trailers: (TripCompositionTrailer & { trailer: Trailer })[];
  axleConfiguration: AxleConfiguration | null;
};

function toAxleConfigurationEntity(config: AxleConfiguration): AxleConfigurationEntity {
  const entity = new AxleConfigurationEntity();
  entity.id = config.id;
  entity.totalAxles = config.totalAxles;
  entity.raisedAxles = config.raisedAxles;
  entity.loweredAxles = config.loweredAxles;
  entity.suspendedAxles = config.suspendedAxles;
  entity.steeringAxles = config.steeringAxles;
  entity.tractionAxles = config.tractionAxles;
  entity.billableCategory = config.billableCategory;
  entity.createdAt = config.createdAt;
  entity.updatedAt = config.updatedAt;
  return entity;
}

export function toTripCompositionEntity(
  composition: TripCompositionWithRelations,
): TripCompositionEntity {
  const entity = new TripCompositionEntity();
  entity.id = composition.id;
  entity.tenantId = composition.tenantId;
  entity.tripId = composition.tripId;
  entity.vehicleId = composition.vehicleId;
  entity.vehiclePlate = composition.vehicle.plate;
  entity.trailers = composition.trailers
    .sort((a, b) => a.positionOrder - b.positionOrder)
    .map((item): TripCompositionTrailerEntity => {
      const trailerEntity = new TripCompositionTrailerEntity();
      trailerEntity.trailerId = item.trailerId;
      trailerEntity.positionOrder = item.positionOrder;
      trailerEntity.trailerPlate = item.trailer.plate;
      return trailerEntity;
    });
  entity.axleConfiguration = composition.axleConfiguration
    ? toAxleConfigurationEntity(composition.axleConfiguration)
    : null;
  entity.createdAt = composition.createdAt;
  entity.updatedAt = composition.updatedAt;
  return entity;
}
