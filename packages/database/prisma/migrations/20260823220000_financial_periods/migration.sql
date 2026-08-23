-- Fase 76 -- Fechamento Financeiro, Periodos e Controle de Competencia.
-- Migration ADITIVA: cria apenas o enum e a tabela de controle de periodo
-- (financial_periods). Nenhuma tabela financeira existente e alterada.

-- CreateEnum
CREATE TYPE "financial_period_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "financial_period_status" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opened_by" UUID NOT NULL,
    "closed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_periods_tenant_id_status_idx" ON "financial_periods"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_tenant_id_year_month_key" ON "financial_periods"("tenant_id", "year", "month");

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
