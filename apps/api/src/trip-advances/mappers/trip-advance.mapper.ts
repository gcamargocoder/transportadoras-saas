import { Driver, TripAdvance, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripAdvanceEntity } from '../entities/trip-advance.entity';

export type TripAdvanceWithRelations = TripAdvance & {
  driver: Driver;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toTripAdvanceEntity(advance: TripAdvanceWithRelations): TripAdvanceEntity {
  const entity = new TripAdvanceEntity();
  entity.id = advance.id;
  entity.tenantId = advance.tenantId;
  entity.tripId = advance.tripId;
  entity.driverId = advance.driverId;
  entity.driverName = advance.driver.name;
  entity.description = advance.description;
  entity.amount = toNumberOrNull(advance.amount) ?? 0;
  entity.paymentMethod = advance.paymentMethod;
  entity.paidAt = advance.paidAt;
  entity.attachmentId = advance.attachmentId;
  entity.createdBy = advance.createdBy;
  entity.creatorName = advance.creator.name;
  entity.updatedBy = advance.updatedBy;
  entity.updaterName = advance.updater?.name ?? null;
  entity.createdAt = advance.createdAt;
  entity.updatedAt = advance.updatedAt;
  return entity;
}
