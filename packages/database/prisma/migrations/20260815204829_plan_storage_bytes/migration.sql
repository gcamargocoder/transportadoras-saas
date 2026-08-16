-- Fase 48: tamanho real de arquivo (bytes) para enforcement de limite de
-- armazenamento do plano. Nullable, aditivo -- linhas existentes ficam NULL,
-- nunca estimadas retroativamente.
ALTER TABLE "attachments" ADD COLUMN "size_bytes" INTEGER;

ALTER TABLE "import_jobs" ADD COLUMN "size_bytes" INTEGER;
