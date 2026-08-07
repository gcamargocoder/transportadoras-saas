import { Driver, TagProvider, TollPlaza, TollTransaction, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TollTransactionEntity } from '../entities/toll-transaction.entity';

export type TollTransactionWithRelations = TollTransaction & {
  vehicle: Vehicle;
  driver: Driver | null;
  tollPlaza: TollPlaza;
  tagProvider: TagProvider | null;
};

export function toTollTransactionEntity(
  transaction: TollTransactionWithRelations,
): TollTransactionEntity {
  const entity = new TollTransactionEntity();
  entity.id = transaction.id;
  entity.tenantId = transaction.tenantId;
  entity.tripId = transaction.tripId;
  entity.vehicleId = transaction.vehicleId;
  entity.vehiclePlate = transaction.vehicle.plate;
  entity.driverId = transaction.driverId;
  entity.driverName = transaction.driver?.name ?? null;
  entity.tollPlazaId = transaction.tollPlazaId;
  entity.tollPlazaName = transaction.tollPlaza.name;
  entity.tagProviderId = transaction.tagProviderId;
  entity.tagProviderName = transaction.tagProvider?.name ?? null;
  entity.axleCount = transaction.axleCount;
  entity.expectedAmount = toNumberOrNull(transaction.expectedAmount) ?? 0;
  entity.chargedAmount = toNumberOrNull(transaction.chargedAmount) ?? 0;
  entity.discrepancyAmount = toNumberOrNull(transaction.discrepancyAmount) ?? 0;
  entity.status = transaction.status;
  entity.chargedAt = transaction.chargedAt;
  entity.source = transaction.source;
  entity.createdAt = transaction.createdAt;
  entity.updatedAt = transaction.updatedAt;
  return entity;
}
