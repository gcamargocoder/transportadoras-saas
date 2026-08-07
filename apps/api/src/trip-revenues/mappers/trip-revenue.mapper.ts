import { Customer, TripRevenue, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripRevenueEntity } from '../entities/trip-revenue.entity';

export type TripRevenueWithRelations = TripRevenue & {
  customer: Customer | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toTripRevenueEntity(revenue: TripRevenueWithRelations): TripRevenueEntity {
  const entity = new TripRevenueEntity();
  entity.id = revenue.id;
  entity.tenantId = revenue.tenantId;
  entity.tripId = revenue.tripId;
  entity.description = revenue.description;
  entity.category = revenue.category;
  entity.amount = toNumberOrNull(revenue.amount) ?? 0;
  entity.receivedAt = revenue.receivedAt;
  entity.invoiceNumber = revenue.invoiceNumber;
  entity.customerId = revenue.customerId;
  entity.customerName = revenue.customer?.name ?? null;
  entity.attachmentId = revenue.attachmentId;
  entity.createdBy = revenue.createdBy;
  entity.creatorName = revenue.creator.name;
  entity.updatedBy = revenue.updatedBy;
  entity.updaterName = revenue.updater?.name ?? null;
  entity.createdAt = revenue.createdAt;
  entity.updatedAt = revenue.updatedAt;
  return entity;
}
