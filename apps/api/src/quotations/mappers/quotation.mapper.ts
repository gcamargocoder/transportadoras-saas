import { Customer, CustomerContact, Location, Quotation, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { QuotationEntity } from '../entities/quotation.entity';

export type QuotationWithRelations = Quotation & {
  customer: Customer;
  customerContact: CustomerContact | null;
  originLocation: Location;
  destinationLocation: Location;
  freightTable: { name: string } | null;
  freightRule: { version: number } | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

// status "expirado" e sempre derivado de validUntil (nunca uma coluna/
// transicao propria -- mesmo principio de computeTripOccurrenceStatus):
// e um fato de tempo, nao uma decisao de negocio.
export function isQuotationExpired(quotation: { validUntil: Date }, now: Date = new Date()): boolean {
  return quotation.validUntil.getTime() < now.getTime();
}

export function toQuotationEntity(quotation: QuotationWithRelations): QuotationEntity {
  const entity = new QuotationEntity();
  entity.id = quotation.id;
  entity.tenantId = quotation.tenantId;
  entity.customerId = quotation.customerId;
  entity.customerName = quotation.customer.name;
  entity.customerContactId = quotation.customerContactId;
  entity.customerContactName = quotation.customerContact?.name ?? null;
  entity.originLocationId = quotation.originLocationId;
  entity.originLocationName = quotation.originLocation.name;
  entity.destinationLocationId = quotation.destinationLocationId;
  entity.destinationLocationName = quotation.destinationLocation.name;
  entity.cargoType = quotation.cargoType;
  entity.weightKg = toNumberOrNull(quotation.weightKg);
  entity.cubageM3 = toNumberOrNull(quotation.cubageM3);
  entity.vehicleType = quotation.vehicleType;
  entity.conditions = quotation.conditions;
  entity.status = quotation.status;
  entity.validUntil = quotation.validUntil;
  entity.expired = isQuotationExpired(quotation);
  entity.amountSource = quotation.amountSource;
  entity.amount = toNumberOrNull(quotation.amount) ?? 0;
  entity.freightTableId = quotation.freightTableId;
  entity.freightTableName = quotation.freightTable?.name ?? null;
  entity.freightRuleId = quotation.freightRuleId;
  entity.freightRuleVersion = quotation.freightRule?.version ?? null;
  entity.baseAmount = toNumberOrNull(quotation.baseAmount);
  entity.additionsAmount = toNumberOrNull(quotation.additionsAmount);
  entity.tollAmount = toNumberOrNull(quotation.tollAmount);
  entity.feesAmount = toNumberOrNull(quotation.feesAmount);
  entity.calculatedAmount = toNumberOrNull(quotation.calculatedAmount);
  entity.calculationInput = (quotation.calculationInput as Record<string, unknown> | null) ?? null;
  entity.convertedTripId = quotation.convertedTripId;
  entity.createdBy = quotation.createdBy;
  entity.creatorName = quotation.creator.name;
  entity.updatedBy = quotation.updatedBy;
  entity.updaterName = quotation.updater?.name ?? null;
  entity.createdAt = quotation.createdAt;
  entity.updatedAt = quotation.updatedAt;
  return entity;
}
