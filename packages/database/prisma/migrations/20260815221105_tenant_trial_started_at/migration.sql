-- Fase 49: data de inicio do trial. Nullable, aditivo -- planos existentes
-- ficam NULL ate a proxima transicao para TRIAL.
ALTER TABLE "tenant_plans" ADD COLUMN "trial_started_at" TIMESTAMP(3);
