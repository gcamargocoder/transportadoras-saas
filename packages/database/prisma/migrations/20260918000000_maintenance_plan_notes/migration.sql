-- Fase 81 -- manutencao preventiva: campo de observacoes livres no plano.
-- Migration ESTRITAMENTE ADITIVA: 1 coluna nullable em "maintenance_plans".
-- Nenhum backfill. Nao altera nenhuma coluna/tabela/enum existente. Nao
-- toca "vehicle_maintenances" (historico de execucoes) nem "vehicles".

-- AlterTable
ALTER TABLE "maintenance_plans" ADD COLUMN "notes" TEXT;
