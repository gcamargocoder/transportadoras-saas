import type { ReconciliationStatus, TollReconciliationStopVerdict } from '../../types/entities';
import { AUDIT_VERDICT_LABELS, AUDIT_VERDICT_TONE } from './audit-verdict';

// Camada de conciliacao (Fase 23) -- estende os 4 rotulos/tons do motor de
// conferencia (Fase 22, audit-verdict.ts) com o unico veredito novo,
// NOT_REGISTERED (praca esperada pela rota mas nunca registrada na viagem).
export const RECONCILIATION_VERDICT_LABELS: Record<TollReconciliationStopVerdict, string> = {
  ...AUDIT_VERDICT_LABELS,
  NOT_REGISTERED: 'Pedágio não registrado',
};

export const RECONCILIATION_VERDICT_TONE: Record<
  TollReconciliationStopVerdict,
  'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
> = {
  ...AUDIT_VERDICT_TONE,
  NOT_REGISTERED: 'warning',
};

// Status geral da conciliacao (Fase 24) -- espelha
// computeReconciliationStatus() em toll-reconciliation.util.ts (backend).
export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  PENDING: 'Pendente',
  CONFORM: 'Conforme',
  ATTENTION: 'Atenção',
  CRITICAL: 'Crítica',
  UNVERIFIABLE: 'Não verificável',
};

export const RECONCILIATION_STATUS_TONE: Record<
  ReconciliationStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
> = {
  PENDING: 'neutral',
  CONFORM: 'success',
  ATTENTION: 'warning',
  CRITICAL: 'danger',
  UNVERIFIABLE: 'neutral',
};
