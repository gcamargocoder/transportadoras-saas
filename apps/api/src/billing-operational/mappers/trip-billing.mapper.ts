import { TripBilling, TripBillingEntry, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { computeBillingBalance, computeBillingStatusFromAmounts } from '../utils/billing-status.util';
import { TripBillingEntity } from '../entities/trip-billing.entity';
import { TripBillingEntryEntity } from '../entities/trip-billing-entry.entity';

export type TripBillingEntryWithRelations = TripBillingEntry & { creator: UserAccount };

export type TripBillingWithRelations = TripBilling & {
  entries: TripBillingEntryWithRelations[];
  creator: UserAccount;
  updater: UserAccount | null;
  canceller: UserAccount | null;
};

export interface TripBillingTripContext {
  tripLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  contractedAmount: number | null;
  calculatedAmount: number | null;
}

function toEntryEntity(entry: TripBillingEntryWithRelations): TripBillingEntryEntity {
  const entity = new TripBillingEntryEntity();
  entity.id = entry.id;
  entity.amount = toNumberOrNull(entry.amount) ?? 0;
  entity.revenueId = entry.revenueId;
  entity.notes = entry.notes;
  entity.createdBy = entry.createdBy;
  entity.creatorName = entry.creator.name;
  entity.createdAt = entry.createdAt;
  return entity;
}

export function toTripBillingEntity(row: TripBillingWithRelations, context: TripBillingTripContext): TripBillingEntity {
  const billableAmount = toNumberOrNull(row.billableAmount);
  const invoicedAmount = toNumberOrNull(row.invoicedAmount) ?? 0;

  const entity = new TripBillingEntity();
  entity.id = row.id;
  entity.tenantId = row.tenantId;
  entity.tripId = row.tripId;
  entity.tripLabel = context.tripLabel;
  entity.customerId = context.customerId;
  entity.customerName = context.customerName;
  entity.persisted = true;
  entity.status = row.status;
  entity.contractedAmount = context.contractedAmount;
  entity.calculatedAmount = context.calculatedAmount;
  entity.billableAmount = billableAmount;
  entity.invoicedAmount = invoicedAmount;
  entity.receivedAmount = invoicedAmount;
  entity.balance = computeBillingBalance(billableAmount, invoicedAmount);
  entity.notes = row.notes;
  entity.entries = row.entries.map(toEntryEntity);
  entity.cancelledAt = row.cancelledAt;
  entity.cancelledBy = row.cancelledBy;
  entity.cancellerName = row.canceller?.name ?? null;
  entity.createdBy = row.createdBy;
  entity.creatorName = row.creator.name;
  entity.updatedBy = row.updatedBy;
  entity.updaterName = row.updater?.name ?? null;
  entity.createdAt = row.createdAt;
  entity.updatedAt = row.updatedAt;
  return entity;
}

// GET .../trips/:tripId quando nenhum TripBilling foi persistido ainda --
// mesmo espirito de TripSettlementsService.getSettlement (Fase 51): nunca
// 404, sempre um preview calculado ao vivo, status DRAFT/READY conforme
// haja ou nao valor faturavel.
export function buildLiveTripBillingEntity(
  tenantId: string,
  tripId: string,
  context: TripBillingTripContext & { billableAmount: number | null },
): TripBillingEntity {
  const entity = new TripBillingEntity();
  entity.id = null;
  entity.tenantId = tenantId;
  entity.tripId = tripId;
  entity.tripLabel = context.tripLabel;
  entity.customerId = context.customerId;
  entity.customerName = context.customerName;
  entity.persisted = false;
  entity.status = computeBillingStatusFromAmounts(context.billableAmount, 0);
  entity.contractedAmount = context.contractedAmount;
  entity.calculatedAmount = context.calculatedAmount;
  entity.billableAmount = context.billableAmount;
  entity.invoicedAmount = 0;
  entity.receivedAmount = 0;
  entity.balance = computeBillingBalance(context.billableAmount, 0);
  entity.notes = null;
  entity.entries = [];
  entity.cancelledAt = null;
  entity.cancelledBy = null;
  entity.cancellerName = null;
  entity.createdBy = null;
  entity.creatorName = null;
  entity.updatedBy = null;
  entity.updaterName = null;
  entity.createdAt = null;
  entity.updatedAt = null;
  return entity;
}
