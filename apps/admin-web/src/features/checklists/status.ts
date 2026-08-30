import type { ChecklistExecutionStatus, ChecklistType } from '../../types/enums';

// Fase 111 -- extraido de operacao-tab.tsx (Fase 66) para ser reaproveitado
// tambem pela nova pagina de detalhe/listagem de checklist -- nunca uma
// segunda definicao dos mesmos rotulos/tons.
export const CHECKLIST_STATUS_LABELS: Record<ChecklistExecutionStatus, string> = {
  DRAFT: 'Rascunho',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  FAILED: 'Reprovado',
  CANCELLED: 'Cancelado',
};

export const CHECKLIST_STATUS_TONE: Record<ChecklistExecutionStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  DRAFT: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'warning',
};

export const CHECKLIST_TYPE_LABELS: Record<ChecklistType, string> = {
  PRE_TRIP: 'Pré-viagem',
  POST_TRIP: 'Pós-viagem',
  MAINTENANCE: 'Manutenção',
  TRAILER: 'Carreta',
  SAFETY: 'Segurança',
  ACCIDENT: 'Acidente',
  AUDIT: 'Auditoria',
};
