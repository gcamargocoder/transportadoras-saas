import { ContractRenewal } from '@prisma/client';
import { ContractRenewalEntity } from '../entities/contract-renewal.entity';

export type ContractRenewalWithRelations = ContractRenewal & {
  previousContract: { code: string; customerId: string; customer: { name: string } };
  newContract: { code: string } | null;
  initiator: { name: string };
  completer: { name: string } | null;
  canceller: { name: string } | null;
};

export function toContractRenewalEntity(renewal: ContractRenewalWithRelations): ContractRenewalEntity {
  const entity = new ContractRenewalEntity();
  entity.id = renewal.id;
  entity.tenantId = renewal.tenantId;
  entity.previousContractId = renewal.previousContractId;
  entity.previousContractCode = renewal.previousContract.code;
  entity.customerId = renewal.previousContract.customerId;
  entity.customerName = renewal.previousContract.customer.name;
  entity.newContractId = renewal.newContractId;
  entity.newContractCode = renewal.newContract?.code ?? null;
  entity.status = renewal.status;
  entity.previousEndDate = renewal.previousEndDate;
  entity.newStartDate = renewal.newStartDate;
  entity.newEndDate = renewal.newEndDate;
  entity.notes = renewal.notes;
  entity.initiatedBy = renewal.initiatedBy;
  entity.initiatorName = renewal.initiator.name;
  entity.initiatedAt = renewal.initiatedAt;
  entity.completedBy = renewal.completedBy;
  entity.completerName = renewal.completer?.name ?? null;
  entity.completedAt = renewal.completedAt;
  entity.cancelledBy = renewal.cancelledBy;
  entity.cancellerName = renewal.canceller?.name ?? null;
  entity.cancelledAt = renewal.cancelledAt;
  entity.createdAt = renewal.createdAt;
  entity.updatedAt = renewal.updatedAt;
  return entity;
}
