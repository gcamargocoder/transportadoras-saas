-- Fase 78 -- Contas Financeiras, Saldos e Movimentacoes Manuais.
-- Migration ADITIVA: cria apenas os enums e as duas tabelas novas
-- (financial_accounts, financial_transactions). Nenhuma tabela financeira
-- existente e alterada. Sem integracao bancaria, sem sincronizacao
-- automatica com Receivable/Payable.

-- CreateEnum
CREATE TYPE "financial_account_type" AS ENUM ('BANK', 'CASH');

-- CreateEnum
CREATE TYPE "financial_transaction_type" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "financial_account_type" NOT NULL,
    "initial_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_name" TEXT,
    "bank_code" TEXT,
    "account_number_masked" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" "financial_transaction_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_accounts_tenant_id_idx" ON "financial_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_accounts_tenant_id_type_idx" ON "financial_accounts"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "financial_accounts_tenant_id_is_active_idx" ON "financial_accounts"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "financial_transactions_tenant_id_idx" ON "financial_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_transactions_account_id_transaction_date_idx" ON "financial_transactions"("account_id", "transaction_date");

-- CreateIndex
CREATE INDEX "financial_transactions_tenant_id_type_idx" ON "financial_transactions"("tenant_id", "type");

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
