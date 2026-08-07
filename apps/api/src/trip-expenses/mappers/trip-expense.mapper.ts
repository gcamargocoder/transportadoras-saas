import { Driver, TripExpense, UserAccount, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripExpenseEntity } from '../entities/trip-expense.entity';

export type TripExpenseWithRelations = TripExpense & {
  driver: Driver | null;
  vehicle: Vehicle | null;
  approver: UserAccount | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toTripExpenseEntity(expense: TripExpenseWithRelations): TripExpenseEntity {
  const entity = new TripExpenseEntity();
  entity.id = expense.id;
  entity.tenantId = expense.tenantId;
  entity.tripId = expense.tripId;
  entity.driverId = expense.driverId;
  entity.driverName = expense.driver?.name ?? null;
  entity.vehicleId = expense.vehicleId;
  entity.vehiclePlate = expense.vehicle?.plate ?? null;
  entity.category = expense.category;
  entity.description = expense.description;
  entity.supplier = expense.supplier;
  entity.documentNumber = expense.documentNumber;
  entity.expenseDate = expense.expenseDate;
  entity.amount = toNumberOrNull(expense.amount) ?? 0;
  entity.currency = expense.currency;
  entity.paymentMethod = expense.paymentMethod;
  entity.status = expense.status;
  entity.approvedBy = expense.approvedBy;
  entity.approverName = expense.approver?.name ?? null;
  entity.approvedAt = expense.approvedAt;
  entity.attachmentId = expense.attachmentId;
  entity.createdBy = expense.createdBy;
  entity.creatorName = expense.creator.name;
  entity.updatedBy = expense.updatedBy;
  entity.updaterName = expense.updater?.name ?? null;
  entity.createdAt = expense.createdAt;
  entity.updatedAt = expense.updatedAt;
  return entity;
}
