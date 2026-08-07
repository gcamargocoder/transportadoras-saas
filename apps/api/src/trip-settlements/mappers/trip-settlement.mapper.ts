import { SettlementStatus, TripSettlement, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripSettlementEntity } from '../entities/trip-settlement.entity';

export type TripSettlementWithRelations = TripSettlement & { closer: UserAccount | null };

export function toTripSettlementEntity(
  tripId: string,
  settlement: TripSettlementWithRelations | null,
  liveTotals: {
    totalRevenue: number;
    totalExpenses: number;
    totalAdvances: number;
    netResult: number;
  },
): TripSettlementEntity {
  const entity = new TripSettlementEntity();
  entity.tripId = tripId;

  if (!settlement) {
    entity.id = null;
    entity.totalRevenue = liveTotals.totalRevenue;
    entity.totalExpenses = liveTotals.totalExpenses;
    entity.totalAdvances = liveTotals.totalAdvances;
    entity.netResult = liveTotals.netResult;
    entity.status = SettlementStatus.OPEN;
    entity.closedBy = null;
    entity.closedByName = null;
    entity.closedAt = null;
    entity.notes = null;
    entity.createdAt = null;
    entity.updatedAt = null;
    return entity;
  }

  entity.id = settlement.id;
  entity.totalRevenue = toNumberOrNull(settlement.totalRevenue) ?? 0;
  entity.totalExpenses = toNumberOrNull(settlement.totalExpenses) ?? 0;
  entity.totalAdvances = toNumberOrNull(settlement.totalAdvances) ?? 0;
  entity.netResult = toNumberOrNull(settlement.netResult) ?? 0;
  entity.status = settlement.status;
  entity.closedBy = settlement.closedBy;
  entity.closedByName = settlement.closer?.name ?? null;
  entity.closedAt = settlement.closedAt;
  entity.notes = settlement.notes;
  entity.createdAt = settlement.createdAt;
  entity.updatedAt = settlement.updatedAt;
  return entity;
}
