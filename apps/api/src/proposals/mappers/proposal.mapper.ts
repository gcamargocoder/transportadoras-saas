import { Customer, Proposal, Quotation, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { ProposalEntity } from '../entities/proposal.entity';

export type ProposalWithRelations = Proposal & {
  customer: Customer;
  quotation: (Quotation & { originLocation: { name: string }; destinationLocation: { name: string } }) | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

// "expirada" e sempre derivado de validUntil (nunca inferido do status --
// diferente de Quotation, aqui EXPIRED tambem existe como status real e
// explicito, mas o flag `expired` continua sendo informativo/visual mesmo
// quando o status ainda nao foi movido para EXPIRED por um humano).
export function isProposalExpired(proposal: { validUntil: Date }, now: Date = new Date()): boolean {
  return proposal.validUntil.getTime() < now.getTime();
}

export function toProposalEntity(proposal: ProposalWithRelations): ProposalEntity {
  const entity = new ProposalEntity();
  entity.id = proposal.id;
  entity.tenantId = proposal.tenantId;
  entity.number = proposal.number;
  entity.customerId = proposal.customerId;
  entity.customerName = proposal.customer.name;
  entity.quotationId = proposal.quotationId;
  entity.quotationOriginLocationName = proposal.quotation?.originLocation.name ?? null;
  entity.quotationDestinationLocationName = proposal.quotation?.destinationLocation.name ?? null;
  entity.status = proposal.status;
  entity.totalAmount = toNumberOrNull(proposal.totalAmount) ?? 0;
  entity.commercialConditions = proposal.commercialConditions;
  entity.notes = proposal.notes;
  entity.issuedAt = proposal.issuedAt;
  entity.validUntil = proposal.validUntil;
  entity.expired = isProposalExpired(proposal);
  entity.decidedAt = proposal.decidedAt;
  entity.createdBy = proposal.createdBy;
  entity.creatorName = proposal.creator.name;
  entity.updatedBy = proposal.updatedBy;
  entity.updaterName = proposal.updater?.name ?? null;
  entity.createdAt = proposal.createdAt;
  entity.updatedAt = proposal.updatedAt;
  return entity;
}
