import { FinancialBankTransaction, FinancialTransaction, UserAccount } from '@prisma/client';
import { toFinancialTransactionEntity } from '../../finance-accounts/mappers/financial-transaction.mapper';
import { BankTransactionEntity } from '../entities/bank-transaction.entity';

export type FinancialTransactionWithCreator = FinancialTransaction & { creator: UserAccount | null };

export type BankTransactionWithRelations = FinancialBankTransaction & {
  financialAccount?: { name: string } | null;
  financialTransaction?: FinancialTransactionWithCreator | null;
};

function diffInDays(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((aUtc - bUtc) / 86_400_000);
}

export function toBankTransactionEntity(row: BankTransactionWithRelations): BankTransactionEntity {
  const entity = new BankTransactionEntity();
  entity.id = row.id;
  entity.financialAccountId = row.financialAccountId;
  entity.financialAccountName = row.financialAccount?.name ?? null;
  entity.date = row.date;
  entity.description = row.description;
  entity.amount = row.amount.toNumber();
  entity.type = row.type;
  entity.externalId = row.externalId;
  entity.status = row.status;
  entity.financialTransactionId = row.financialTransactionId;
  if (row.financialTransaction) {
    entity.financialTransaction = toFinancialTransactionEntity(row.financialTransaction);
    entity.dateDifferenceDays = diffInDays(row.date, row.financialTransaction.transactionDate);
  } else {
    entity.dateDifferenceDays = null;
  }
  entity.importedAt = row.importedAt;
  entity.updatedAt = row.updatedAt;
  return entity;
}

export function computeDateDifferenceDays(bankDate: Date, transactionDate: Date): number {
  return diffInDays(bankDate, transactionDate);
}
