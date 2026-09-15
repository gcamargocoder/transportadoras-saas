-- Fase 119 -- fecha o GAP identificado na auditoria pos-Fase 118:
-- resolveDocumentExpiryStatus (Fase 62) ja era reaproveitado por Contract
-- (CONTRACT_EXPIRING, Fase 98), mas Document (CRLV/ANTT/CNH/INSURANCE de
-- veiculo/motorista) nunca gerava notificacao. Migration estritamente
-- aditiva: 1 valor novo num enum ja existente, mesmo padrao das migrations
-- 20260915000000_toll_data_sync_failure_notification_type e
-- 20260916000000_checklist_critical_non_conformity_notification_type.

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'DOCUMENT_EXPIRING';
