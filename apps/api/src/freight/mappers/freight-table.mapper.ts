import { Contract, Customer, FreightTable, UserAccount } from '@prisma/client';
import { FreightTableEntity } from '../entities/freight-table.entity';

export type FreightTableWithRelations = FreightTable & {
  customer: Customer;
  contract: Contract | null;
  creator: UserAccount;
  updater: UserAccount | null;
  _count: { rules: number };
};

// activeRulesCount vem separado (nunca de _count.select) porque o Prisma
// nao permite contar a mesma relacao 2x com filtros diferentes na mesma
// chave _count -- ver comentario em FreightTablesService.
export function toFreightTableEntity(
  table: FreightTableWithRelations,
  activeRulesCount: number,
): FreightTableEntity {
  const entity = new FreightTableEntity();
  entity.id = table.id;
  entity.tenantId = table.tenantId;
  entity.customerId = table.customerId;
  entity.customerName = table.customer.name;
  entity.contractId = table.contractId;
  entity.contractCode = table.contract?.code ?? null;
  entity.name = table.name;
  entity.code = table.code;
  entity.status = table.status;
  entity.effectiveFrom = table.effectiveFrom;
  entity.effectiveUntil = table.effectiveUntil;
  entity.notes = table.notes;
  entity.rulesCount = table._count.rules;
  entity.activeRulesCount = activeRulesCount;
  entity.createdBy = table.createdBy;
  entity.creatorName = table.creator.name;
  entity.updatedBy = table.updatedBy;
  entity.updaterName = table.updater?.name ?? null;
  entity.createdAt = table.createdAt;
  entity.updatedAt = table.updatedAt;
  return entity;
}
