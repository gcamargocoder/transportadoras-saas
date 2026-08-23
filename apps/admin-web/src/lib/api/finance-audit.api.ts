import type { Paginated, PaginationParams } from '../../types/api';
import type { AuditLogEntity } from '../../types/entities';
import { api } from './http';

export interface FindFinanceAuditQuery extends PaginationParams {
  from?: string | undefined;
  to?: string | undefined;
  entityName?: string | undefined;
  entityId?: string | undefined;
  action?: string | undefined;
  userId?: string | undefined;
}

// GET /finance/audit (Fase 77) -- leitura filtrada/paginada sobre o mesmo
// AuditLog ja usado pelo restante da API, restrita a eventos financeiros
// (Receivable/ReceivablePayment/Payable/PayablePayment/FinancialPeriod).
export function getFinanceAudit(query: FindFinanceAuditQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<AuditLogEntity>>('/finance/audit', query, signal);
}
