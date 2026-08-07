import { Tire, Trailer, UserAccount, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TireEntity } from '../entities/tire.entity';

export type TireWithRelations = Tire & {
  vehicle: Vehicle | null;
  trailer: Trailer | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toTireEntity(tire: TireWithRelations): TireEntity {
  const entity = new TireEntity();
  entity.id = tire.id;
  entity.tenantId = tire.tenantId;
  entity.fireNumber = tire.fireNumber;
  entity.manufacturer = tire.manufacturer;
  entity.model = tire.model;
  entity.size = tire.size;
  entity.dot = tire.dot;
  entity.serialNumber = tire.serialNumber;
  entity.purchaseDate = tire.purchaseDate;
  entity.purchasePrice = toNumberOrNull(tire.purchasePrice);
  entity.expectedLifespanKm = toNumberOrNull(tire.expectedLifespanKm);
  entity.initialTreadDepthMm = toNumberOrNull(tire.initialTreadDepthMm);
  entity.currentTreadDepthMm = toNumberOrNull(tire.currentTreadDepthMm);
  entity.status = tire.status;
  entity.locationType = tire.locationType;
  entity.vehicleId = tire.vehicleId;
  entity.vehiclePlate = tire.vehicle?.plate ?? null;
  entity.trailerId = tire.trailerId;
  entity.trailerPlate = tire.trailer?.plate ?? null;
  entity.position = tire.position;
  entity.createdBy = tire.createdBy;
  entity.creatorName = tire.creator.name;
  entity.updatedBy = tire.updatedBy;
  entity.updaterName = tire.updater?.name ?? null;
  entity.createdAt = tire.createdAt;
  entity.updatedAt = tire.updatedAt;
  return entity;
}
