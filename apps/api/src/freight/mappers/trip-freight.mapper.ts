import { Contract, FreightTable, TripFreight, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripFreightEntity } from '../entities/trip-freight.entity';

export type TripFreightWithRelations = TripFreight & {
  contract: Contract | null;
  freightTable: FreightTable | null;
  freightRule: { version: number } | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toTripFreightEntity(tripFreight: TripFreightWithRelations): TripFreightEntity {
  const entity = new TripFreightEntity();
  entity.id = tripFreight.id;
  entity.tenantId = tripFreight.tenantId;
  entity.tripId = tripFreight.tripId;
  entity.contractId = tripFreight.contractId;
  entity.contractCode = tripFreight.contract?.code ?? null;
  entity.freightTableId = tripFreight.freightTableId;
  entity.freightTableName = tripFreight.freightTable?.name ?? null;
  entity.freightRuleId = tripFreight.freightRuleId;
  entity.freightRuleVersion = tripFreight.freightRule?.version ?? null;
  entity.calculationInput = (tripFreight.calculationInput as Record<string, unknown>) ?? {};
  entity.baseAmount = toNumberOrNull(tripFreight.baseAmount);
  entity.additionsAmount = toNumberOrNull(tripFreight.additionsAmount);
  entity.tollAmount = toNumberOrNull(tripFreight.tollAmount);
  entity.feesAmount = toNumberOrNull(tripFreight.feesAmount);
  entity.estimatedAmount = toNumberOrNull(tripFreight.estimatedAmount);
  entity.contractedAmount = toNumberOrNull(tripFreight.contractedAmount);
  entity.finalAmount = toNumberOrNull(tripFreight.finalAmount);
  entity.revenueId = tripFreight.revenueId;
  entity.createdBy = tripFreight.createdBy;
  entity.creatorName = tripFreight.creator.name;
  entity.updatedBy = tripFreight.updatedBy;
  entity.updaterName = tripFreight.updater?.name ?? null;
  entity.createdAt = tripFreight.createdAt;
  entity.updatedAt = tripFreight.updatedAt;
  return entity;
}
