import { Contract, Customer, UserAccount } from '@prisma/client';
import { ContractEntity } from '../entities/contract.entity';

export type ContractWithRelations = Contract & {
  customer: Customer;
  creator: UserAccount;
  updater: UserAccount | null;
  _count: { freightTables: number };
};

export function toContractEntity(contract: ContractWithRelations): ContractEntity {
  const entity = new ContractEntity();
  entity.id = contract.id;
  entity.tenantId = contract.tenantId;
  entity.customerId = contract.customerId;
  entity.customerName = contract.customer.name;
  entity.code = contract.code;
  entity.description = contract.description;
  entity.status = contract.status;
  entity.startDate = contract.startDate;
  entity.endDate = contract.endDate;
  entity.isExpired = contract.endDate !== null && contract.endDate.getTime() < Date.now();
  entity.notes = contract.notes;
  entity.commercialTerms = contract.commercialTerms;
  entity.freightTablesCount = contract._count.freightTables;
  entity.createdBy = contract.createdBy;
  entity.creatorName = contract.creator.name;
  entity.updatedBy = contract.updatedBy;
  entity.updaterName = contract.updater?.name ?? null;
  entity.createdAt = contract.createdAt;
  entity.updatedAt = contract.updatedAt;
  return entity;
}
