import { FinancialAccount, UserAccount } from '@prisma/client';
import { FinancialAccountEntity } from '../entities/financial-account.entity';

export type FinancialAccountWithRelations = FinancialAccount & {
  creator: UserAccount | null;
};

export function toFinancialAccountEntity(row: FinancialAccountWithRelations, currentBalance: number): FinancialAccountEntity {
  const entity = new FinancialAccountEntity();
  entity.id = row.id;
  entity.name = row.name;
  entity.type = row.type;
  entity.initialBalance = row.initialBalance.toNumber();
  entity.currentBalance = currentBalance;
  entity.bankName = row.bankName;
  entity.bankCode = row.bankCode;
  entity.accountNumberMasked = row.accountNumberMasked;
  entity.isActive = row.isActive;
  entity.createdBy = row.createdBy;
  entity.creatorName = row.creator?.name ?? null;
  entity.createdAt = row.createdAt;
  entity.updatedAt = row.updatedAt;
  return entity;
}
