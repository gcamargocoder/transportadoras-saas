-- AlterEnum
-- Postgres exige que um novo valor de enum seja commitado antes de poder ser
-- usado (ex: no DEFAULT de tenant_plans.enabled_modules, migration seguinte)
-- -- por isso esta migration fica isolada, sem mais nenhuma instrucao.
ALTER TYPE "TenantModule" ADD VALUE 'FREIGHT';
