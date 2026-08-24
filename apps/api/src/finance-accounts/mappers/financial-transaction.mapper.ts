import { FinancialTransaction, UserAccount } from '@prisma/client';
import { FinancialTransactionEntity } from '../entities/financial-transaction.entity';

export type FinancialTransactionWithRelations = FinancialTransaction & {
  creator: UserAccount | null;
};

export function toFinancialTransactionEntity(row: FinancialTransactionWithRelations): FinancialTransactionEntity {
  const entity = new FinancialTransactionEntity();
  entity.id = row.id;
  entity.accountId = row.accountId;
  entity.type = row.type;
  entity.amount = row.amount.toNumber();
  entity.transactionDate = row.transactionDate;
  entity.description = row.description;
  entity.referenceType = row.referenceType;
  entity.referenceId = row.referenceId;
  entity.createdBy = row.createdBy;
  entity.creatorName = row.creator?.name ?? null;
  entity.createdAt = row.createdAt;
  return entity;
}
