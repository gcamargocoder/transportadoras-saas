import type { PaginationParams } from '../../types/api';
import type { FinanceReconciliationEntity } from '../../types/entities';
import type { ReconciliationEntityType, ReconciliationIssueType, ReconciliationSeverity } from '../../types/entities';
import { api } from './http';

export interface FindFinanceReconciliationQuery extends PaginationParams {
  type?: ReconciliationIssueType | undefined;
  severity?: ReconciliationSeverity | undefined;
  entityType?: ReconciliationEntityType | undefined;
  from?: string | undefined;
  to?: string | undefined;
  tripId?: string | undefined;
  customerId?: string | undefined;
}

// GET /finance/reconciliation (Fase 75) -- inconsistencias entre os
// ledgers financeiros ja existentes. Projecao calculada ao vivo, nunca
// persistida.
export function getFinanceReconciliation(query: FindFinanceReconciliationQuery = {}, signal?: AbortSignal) {
  return api.get<FinanceReconciliationEntity>('/finance/reconciliation', query, signal);
}
