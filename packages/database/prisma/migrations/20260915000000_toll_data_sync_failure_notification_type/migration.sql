-- Alertas de sincronizacao: novo tipo de notificacao para falha
-- persistente na atualizacao automatica de dados oficiais de pedagio.
-- Migration isolada de proposito (Postgres exige que um novo valor de enum
-- seja commitado antes de poder ser usado em INSERT/WHERE, mesmo padrao ja
-- usado nas Fases 70/98).

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'TOLL_DATA_SYNC_FAILURE';
