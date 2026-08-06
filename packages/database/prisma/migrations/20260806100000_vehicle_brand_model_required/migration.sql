-- Backfill defensivo antes de tornar as colunas obrigatorias (nao ha
-- registros com valor nulo no momento desta migration, mas evita falha
-- caso existam em outro ambiente).
UPDATE "vehicles" SET "brand" = 'Nao informado' WHERE "brand" IS NULL;
UPDATE "vehicles" SET "model" = 'Nao informado' WHERE "model" IS NULL;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "model" SET NOT NULL,
ALTER COLUMN "brand" SET NOT NULL;
