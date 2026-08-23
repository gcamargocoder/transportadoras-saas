import type { QueryableParams } from '../../types/api';
import type { CashFlowEntity } from '../../types/entities';
import { api } from './http';

export interface FindCashFlowQuery extends QueryableParams {
  from?: string | undefined;
  to?: string | undefined;
}

// GET /finance/cash-flow (Fase 74) -- fluxo de caixa e liquidez
// consolidados, projecao sobre Receivable/Payable ja existentes.
export function getCashFlow(query: FindCashFlowQuery = {}, signal?: AbortSignal) {
  return api.get<CashFlowEntity>('/finance/cash-flow', query, signal);
}
