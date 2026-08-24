import type { Paginated, PaginationParams } from '../../types/api';
import type {
  FinancialAccountEntity,
  FinancialAccountsDashboardEntity,
  FinancialTransactionEntity,
  FinancialTransferResultEntity,
} from '../../types/entities';
import type { FinancialAccountType, FinancialTransactionType } from '../../types/enums';
import { api } from './http';

// Fase 78 -- Contas Financeiras, Saldos e Movimentacoes Manuais.
export interface FindFinancialAccountsQuery extends PaginationParams {
  type?: FinancialAccountType | undefined;
  isActive?: boolean | undefined;
}

export function listFinancialAccounts(query: FindFinancialAccountsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FinancialAccountEntity>>('/finance/accounts', query, signal);
}

export function getFinancialAccountsDashboard(signal?: AbortSignal) {
  return api.get<FinancialAccountsDashboardEntity>('/finance/accounts/dashboard', undefined, signal);
}

export function getFinancialAccount(id: string) {
  return api.get<FinancialAccountEntity>(`/finance/accounts/${id}`);
}

export interface CreateFinancialAccountPayload {
  name: string;
  type: FinancialAccountType;
  initialBalance?: number;
  bankName?: string;
  bankCode?: string;
  accountNumberMasked?: string;
}

export function createFinancialAccount(payload: CreateFinancialAccountPayload) {
  return api.post<FinancialAccountEntity>('/finance/accounts', payload);
}

export function activateFinancialAccount(id: string) {
  return api.post<FinancialAccountEntity>(`/finance/accounts/${id}/activate`, {});
}

export function deactivateFinancialAccount(id: string) {
  return api.post<FinancialAccountEntity>(`/finance/accounts/${id}/deactivate`, {});
}

export interface FindFinancialTransactionsQuery extends PaginationParams {
  from?: string | undefined;
  to?: string | undefined;
  type?: FinancialTransactionType | undefined;
}

export function listFinancialTransactions(accountId: string, query: FindFinancialTransactionsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FinancialTransactionEntity>>(`/finance/accounts/${accountId}/transactions`, query, signal);
}

export interface CreateFinancialTransactionPayload {
  type: FinancialTransactionType;
  amount: number;
  transactionDate: string;
  description: string;
}

export function createFinancialTransaction(accountId: string, payload: CreateFinancialTransactionPayload) {
  return api.post<FinancialTransactionEntity>(`/finance/accounts/${accountId}/transactions`, payload);
}

export interface CreateFinancialTransferPayload {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  transactionDate: string;
  description?: string;
}

export function createFinancialTransfer(payload: CreateFinancialTransferPayload) {
  return api.post<FinancialTransferResultEntity>('/finance/transfers', payload);
}
