import { FreightRule, Prisma, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FreightRuleEntity, FreightRuleFeeEntity } from '../entities/freight-rule.entity';
import { FreightRuleFee } from '../utils/freight-calculation.util';

export type FreightRuleWithRelations = FreightRule & {
  creator: UserAccount;
  updater: UserAccount | null;
  nextVersion: { id: string } | null;
};

function parseOtherFees(value: Prisma.JsonValue | null): FreightRuleFeeEntity[] | null {
  if (!Array.isArray(value)) return null;
  const fees = value.filter(
    (entry): entry is { label: string; amount: number } =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).label === 'string' &&
      typeof (entry as Record<string, unknown>).amount === 'number',
  );
  return fees.length > 0 ? fees : null;
}

export function toFreightRuleEntity(rule: FreightRuleWithRelations): FreightRuleEntity {
  const entity = new FreightRuleEntity();
  entity.id = rule.id;
  entity.tenantId = rule.tenantId;
  entity.freightTableId = rule.freightTableId;
  entity.version = rule.version;
  entity.status = rule.status;
  entity.previousVersionId = rule.previousVersionId;
  entity.nextVersionId = rule.nextVersion?.id ?? null;
  entity.effectiveFrom = rule.effectiveFrom;
  entity.effectiveUntil = rule.effectiveUntil;
  entity.originLocationId = rule.originLocationId;
  entity.destinationLocationId = rule.destinationLocationId;
  entity.originRegion = rule.originRegion;
  entity.destinationRegion = rule.destinationRegion;
  entity.cargoType = rule.cargoType;
  entity.vehicleType = rule.vehicleType;
  entity.minWeightKg = toNumberOrNull(rule.minWeightKg);
  entity.maxWeightKg = toNumberOrNull(rule.maxWeightKg);
  entity.minCubageM3 = toNumberOrNull(rule.minCubageM3);
  entity.maxCubageM3 = toNumberOrNull(rule.maxCubageM3);
  entity.priority = rule.priority;
  entity.baseAmount = toNumberOrNull(rule.baseAmount);
  entity.perKmAmount = toNumberOrNull(rule.perKmAmount);
  entity.perTonAmount = toNumberOrNull(rule.perTonAmount);
  entity.minimumAmount = toNumberOrNull(rule.minimumAmount);
  entity.tollAmount = toNumberOrNull(rule.tollAmount);
  entity.riskAdditionalAmount = toNumberOrNull(rule.riskAdditionalAmount);
  entity.nightAdditionalAmount = toNumberOrNull(rule.nightAdditionalAmount);
  entity.dailyRateAmount = toNumberOrNull(rule.dailyRateAmount);
  entity.demurrageAmount = toNumberOrNull(rule.demurrageAmount);
  entity.otherFees = parseOtherFees(rule.otherFees);
  entity.notes = rule.notes;
  entity.createdBy = rule.createdBy;
  entity.creatorName = rule.creator.name;
  entity.updatedBy = rule.updatedBy;
  entity.updaterName = rule.updater?.name ?? null;
  entity.createdAt = rule.createdAt;
  entity.updatedAt = rule.updatedAt;
  return entity;
}

// Extrai um FreightRuleCandidate (numeros puros) a partir da linha do
// banco -- usado pelo motor de calculo (freight-calculation.util.ts), que
// nunca conhece Prisma.Decimal.
export function toFreightRuleCandidate(rule: FreightRule): {
  id: string;
  freightTableId: string;
  version: number;
  priority: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  originLocationId: string | null;
  destinationLocationId: string | null;
  originRegion: string | null;
  destinationRegion: string | null;
  cargoType: string | null;
  vehicleType: FreightRule['vehicleType'];
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minCubageM3: number | null;
  maxCubageM3: number | null;
  baseAmount: number | null;
  perKmAmount: number | null;
  perTonAmount: number | null;
  minimumAmount: number | null;
  tollAmount: number | null;
  riskAdditionalAmount: number | null;
  nightAdditionalAmount: number | null;
  dailyRateAmount: number | null;
  demurrageAmount: number | null;
  otherFees: FreightRuleFee[] | null;
} {
  return {
    id: rule.id,
    freightTableId: rule.freightTableId,
    version: rule.version,
    priority: rule.priority,
    effectiveFrom: rule.effectiveFrom,
    effectiveUntil: rule.effectiveUntil,
    originLocationId: rule.originLocationId,
    destinationLocationId: rule.destinationLocationId,
    originRegion: rule.originRegion,
    destinationRegion: rule.destinationRegion,
    cargoType: rule.cargoType,
    vehicleType: rule.vehicleType,
    minWeightKg: toNumberOrNull(rule.minWeightKg),
    maxWeightKg: toNumberOrNull(rule.maxWeightKg),
    minCubageM3: toNumberOrNull(rule.minCubageM3),
    maxCubageM3: toNumberOrNull(rule.maxCubageM3),
    baseAmount: toNumberOrNull(rule.baseAmount),
    perKmAmount: toNumberOrNull(rule.perKmAmount),
    perTonAmount: toNumberOrNull(rule.perTonAmount),
    minimumAmount: toNumberOrNull(rule.minimumAmount),
    tollAmount: toNumberOrNull(rule.tollAmount),
    riskAdditionalAmount: toNumberOrNull(rule.riskAdditionalAmount),
    nightAdditionalAmount: toNumberOrNull(rule.nightAdditionalAmount),
    dailyRateAmount: toNumberOrNull(rule.dailyRateAmount),
    demurrageAmount: toNumberOrNull(rule.demurrageAmount),
    otherFees: parseOtherFees(rule.otherFees) as FreightRuleFee[] | null,
  };
}
