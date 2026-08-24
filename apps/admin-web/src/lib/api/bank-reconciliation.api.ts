import type { Paginated, PaginationParams, QueryableParams } from '../../types/api';
import type {
  BankReconciliationDashboardEntity,
  BankTransactionCandidateEntity,
  BankTransactionEntity,
  ImportBankTransactionsResultEntity,
} from '../../types/entities';
import type { FinancialBankTransactionStatus, FinancialTransactionType } from '../../types/enums';
import { api } from './http';

// Fase 80 -- Conciliacao Financeira e Importacao de Movimentacoes Bancarias.
export interface FindBankTransactionsQuery extends PaginationParams {
  financialAccountId?: string | undefined;
  status?: FinancialBankTransactionStatus | undefined;
  type?: FinancialTransactionType | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function listBankTransactions(query: FindBankTransactionsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<BankTransactionEntity>>('/finance/bank-transactions', query, signal);
}

export interface FindBankReconciliationDashboardQuery extends QueryableParams {
  financialAccountId?: string | undefined;
  status?: FinancialBankTransactionStatus | undefined;
  type?: FinancialTransactionType | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function getBankReconciliationDashboard(query: FindBankReconciliationDashboardQuery = {}, signal?: AbortSignal) {
  return api.get<BankReconciliationDashboardEntity>('/finance/bank-transactions/dashboard', query, signal);
}

export function getBankTransaction(id: string) {
  return api.get<BankTransactionEntity>(`/finance/bank-transactions/${id}`);
}

export function getBankTransactionCandidates(id: string) {
  return api.get<BankTransactionCandidateEntity[]>(`/finance/bank-transactions/${id}/candidates`);
}

export function reconcileBankTransaction(id: string, financialTransactionId: string) {
  return api.post<BankTransactionEntity>(`/finance/bank-transactions/${id}/reconcile`, { financialTransactionId });
}

export function unreconcileBankTransaction(id: string) {
  return api.post<BankTransactionEntity>(`/finance/bank-transactions/${id}/unreconcile`, {});
}

// Import sincrono: o resumo (lidas/importadas/duplicadas/invalidas) volta
// direto na resposta -- sem job/polling.
export function importBankTransactionsCsv(financialAccountId: string, file: File): Promise<ImportBankTransactionsResultEntity> {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportBankTransactionsResultEntity>(`/finance/accounts/${financialAccountId}/bank-transactions/import`, form, {
    isForm: true,
  });
}
