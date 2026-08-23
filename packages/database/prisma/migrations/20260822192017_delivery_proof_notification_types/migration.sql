-- Fase 70 -- 2 novos valores de notification_type (nenhuma alteracao de
-- tabela: o model Notification ja foi adaptado na Fase 69). Migration
-- isolada de proposito (Postgres exige que um novo valor de enum seja
-- commitado antes de poder ser usado em INSERT/WHERE).
ALTER TYPE "notification_type" ADD VALUE 'DELIVERY_PROOF_PENDING';
ALTER TYPE "notification_type" ADD VALUE 'DELIVERY_PROOF_PROBLEM';
